import type { ChatInputCommandInteraction, ClientEvents } from "discord.js";
import { BaseEvent } from "../../events/types";
import { bootstrap } from "../..";
import type { IBoot } from "../../interfaces/IBoot";
import type { CommandManager } from "../../commands/CommandManager";
import { LoggerFactory } from "../../logger/factory";
import type { Logger } from "../../logger";

interface CommandExecutionContext {
  interaction: ChatInputCommandInteraction;
  commandName: string;
  user: {
    id: string;
    tag: string;
  };
  guild?: {
    id: string;
    name: string;
  };
  channel?: {
    id: string;
    type: string;
  };
}

interface CommandExecutionResult {
  success: boolean;
  executionTime: number;
  error?: Error;
  context: CommandExecutionContext;
}

interface CommandEvents {
  "command:started": CommandExecutionContext;
  "command:completed": CommandExecutionResult;
  "command:failed": CommandExecutionResult;
  "command:not-found": CommandExecutionContext;
}

interface CommandExecutionContext {
  interaction: ChatInputCommandInteraction;
  commandName: string;
  user: {
    id: string;
    tag: string;
  };
  guild?: {
    id: string;
    name: string;
  };
  channel?: {
    id: string;
    type: string;
  };
}

interface CommandExecutionResult {
  success: boolean;
  executionTime: number;
  error?: Error;
  context: CommandExecutionContext;
}

interface CommandEvents {
  "command:started": CommandExecutionContext;
  "command:completed": CommandExecutionResult;
  "command:failed": CommandExecutionResult;
  "command:not-found": CommandExecutionContext;
}

export class AdvancedCommandInteractionHandler extends BaseEvent<"interactionCreate"> {
  public readonly name = "interactionCreate";
  private readonly bootstrap: IBoot = bootstrap;
  private readonly commandManager: CommandManager;
  private readonly logger: Logger;
  private readonly commandStats = new Map<
    string,
    {
      executions: number;
      failures: number;
      totalExecutionTime: number;
      lastExecuted: number;
    }
  >();

  constructor() {
    super();
    this.commandManager = this.bootstrap.getCommandManager();
    this.logger = LoggerFactory.create("command-interaction-handler");
  }

  public async execute(
    interaction: ClientEvents["interactionCreate"][0]
  ): Promise<void> {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    const context = this.createExecutionContext(interaction);

    const command = this.commandManager.commands.get(interaction.commandName);
    if (!command) {
      await this.handleCommandNotFound(context);
      return;
    }

    await this.executeCommand(context, command);
  }

  private createExecutionContext(
    interaction: ChatInputCommandInteraction
  ): CommandExecutionContext {
    return {
      interaction,
      commandName: interaction.commandName,
      user: {
        id: interaction.user.id,
        tag: interaction.user.tag,
      },
      guild: interaction.guild
        ? {
            id: interaction.guild.id,
            name: interaction.guild.name,
          }
        : undefined,
      channel: interaction.channel
        ? {
            id: interaction.channel.id,
            type: interaction.channel.type.toString(),
          }
        : undefined,
    };
  }

  private async executeCommand(
    context: CommandExecutionContext,
    command: any
  ): Promise<void> {
    const startTime = Date.now();

    this.emitEvent("command:started", context);

    this.logger.debug(`Executing command: ${context.commandName}`, {
      user: context.user.tag,
      guild: context.guild?.name,
      channel: context.channel?.id,
    });

    try {
      await command.execute(context.interaction);

      const executionTime = Date.now() - startTime;
      const result: CommandExecutionResult = {
        success: true,
        executionTime,
        context,
      };

      this.updateCommandStats(context.commandName, true, executionTime);

      // Logging
      this.logger.info(
        `Command ${context.commandName} executed successfully in ${executionTime}ms`,
        {
          user: context.user.tag,
          executionTime,
          guild: context.guild?.name,
        }
      );

      this.emitEvent("command:completed", result);
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const err = error instanceof Error ? error : new Error(String(error));

      const result: CommandExecutionResult = {
        success: false,
        executionTime,
        error: err,
        context,
      };

      this.updateCommandStats(context.commandName, false, executionTime);

      // Error Handling
      await this.handleCommandError(context, err);

      // Event: Command Failed
      this.emitEvent("command:failed", result);
    }
  }

  private async handleCommandError(
    context: CommandExecutionContext,
    error: Error
  ): Promise<void> {
    this.logger.error(
      `Error executing command ${context.commandName}: ${error.message}`,
      error,
      {
        user: context.user.tag,
        guild: context.guild?.name,
        channel: context.channel?.id,
        stack: error.stack,
        commandName: context.commandName,
      }
    );

    const errorResponse = {
      content: "There was an error while executing this command!",
      ephemeral: true,
    };

    try {
      if (context.interaction.replied || context.interaction.deferred) {
        await context.interaction.followUp(errorResponse);
      } else {
        await context.interaction.reply(errorResponse);
      }
    } catch (replyError) {
      this.logger.error(
        `Failed to send error response for command ${context.commandName}:`,
        replyError as Error
      );
    }
  }

  private async handleCommandNotFound(
    context: CommandExecutionContext
  ): Promise<void> {
    this.logger.warn(`Command not found: ${context.commandName}`, {
      user: context.user.tag,
      guild: context.guild?.name,
    });

    // Event: Command Not Found
    this.emitEvent("command:not-found", context);

    const errorResponse = {
      content: "This command is not available or has been removed.",
      ephemeral: true,
    };

    try {
      await context.interaction.reply(errorResponse);
    } catch (replyError) {
      this.logger.error(
        `Failed to send 'command not found' response:`,
        replyError as Error
      );
    }
  }

  private updateCommandStats(
    commandName: string,
    success: boolean,
    executionTime: number
  ): void {
    const stats = this.commandStats.get(commandName) || {
      executions: 0,
      failures: 0,
      totalExecutionTime: 0,
      lastExecuted: 0,
    };

    stats.executions++;
    stats.totalExecutionTime += executionTime;
    stats.lastExecuted = Date.now();

    if (!success) {
      stats.failures++;
    }

    this.commandStats.set(commandName, stats);
  }

  public getCommandStats(): Map<
    string,
    {
      executions: number;
      failures: number;
      averageExecutionTime: number;
      successRate: number;
      lastExecuted: number;
    }
  > {
    const result = new Map();

    for (const [commandName, stats] of this.commandStats) {
      result.set(commandName, {
        executions: stats.executions,
        failures: stats.failures,
        averageExecutionTime: Math.round(
          stats.totalExecutionTime / stats.executions
        ),
        successRate: Math.round(
          ((stats.executions - stats.failures) / stats.executions) * 100
        ),
        lastExecuted: stats.lastExecuted,
      });
    }

    return result;
  }

  private emitEvent<K extends keyof CommandEvents>(
    eventName: K,
    data: CommandEvents[K]
  ): void {
    this.logger.debug(`Event emitted: ${eventName}`, data);
  }

  public resetStats(): void {
    this.commandStats.clear();
    this.logger.info("Command statistics reset");
  }

  public getPerformanceReport(): {
    totalCommands: number;
    totalExecutions: number;
    totalFailures: number;
    averageExecutionTime: number;
    topCommands: Array<{
      name: string;
      executions: number;
      failureRate: number;
    }>;
  } {
    const stats = Array.from(this.commandStats.entries());
    const totalExecutions = stats.reduce(
      (sum, [, stat]) => sum + stat.executions,
      0
    );
    const totalFailures = stats.reduce(
      (sum, [, stat]) => sum + stat.failures,
      0
    );
    const totalExecutionTime = stats.reduce(
      (sum, [, stat]) => sum + stat.totalExecutionTime,
      0
    );

    return {
      totalCommands: stats.length,
      totalExecutions,
      totalFailures,
      averageExecutionTime:
        totalExecutions > 0
          ? Math.round(totalExecutionTime / totalExecutions)
          : 0,
      topCommands: stats
        .map(([name, stat]) => ({
          name,
          executions: stat.executions,
          failureRate: Math.round((stat.failures / stat.executions) * 100),
        }))
        .sort((a, b) => b.executions - a.executions)
        .slice(0, 10),
    };
  }
}
