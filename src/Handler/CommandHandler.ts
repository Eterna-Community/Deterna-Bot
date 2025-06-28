import { Collection, REST, Routes } from "discord.js";
import { BaseCommand, type ICommand } from "../Interfaces/ICommand";
import { config } from "../Config/Config";
import { Glob } from "bun";
import type { Logger } from "../Logger/Index";
import { LoggerFactory } from "../Logger/LoggerFactory";
import { LogTarget } from "../Logger/Types";
import {
  PerformanceMonitor,
  PerformanceMonitorWithStats,
} from "../Utils/Performance";
import path from "node:path";
import { pathToFileURL } from "node:url";

@PerformanceMonitor({
  minThreshold: 50,
  includeArguments: true,
  includeReturnValue: true,
  excludeMethods: ["toString"],
  colorize: true,
})
export class CommandHandler {
  public commands: Collection<string, ICommand>;
  private logger: Logger;

  constructor() {
    this.commands = new Collection();
    this.logger = LoggerFactory.create("CommandHandler", [LogTarget.CONSOLE]);
  }

  public async loadCommands(): Promise<void> {
    const glob = new Glob("*.{ts}");
    const commandFiles = await Array.fromAsync(
      glob.scan({
        cwd: "./src/Modules/Commands",
      })
    );

    for (const file of commandFiles) {
      try {
        const absolutePath = path.resolve("./src/Modules/Commands", file);
        const fileUrl = pathToFileURL(absolutePath).href;

        const commandModule = await import(fileUrl);

        const CommandClass = this.findCommandClass(commandModule);
        if (CommandClass) {
          const commandInstance = new CommandClass();
          this.commands.set(commandInstance!.data.name, commandInstance!);
          this.logger.info("Loaded command:", commandInstance!.data.name);
        } else {
          this.logger.warn(`No valid command class found in ${file}`);
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.logger.error(`Error loading command from ${file}:`, err);
      }
    }
    this.logger.info(`Loaded ${this.commands.size} commands.`);
  }

  private findCommandClass(module: any): new () => BaseCommand | null {
    if (module.default && this.isCommandClass(module.default)) {
      return module.default;
    }
    for (const [key, value] of Object.entries(module)) {
      if (this.isCommandClass(value)) {
        return value as new () => BaseCommand;
      }
    }
    // Even though we clarified that we could return null, TS still complains
    ///@ts-expect-error
    return null;
  }

  private isCommandClass(cls: any): boolean {
    try {
      return (
        typeof cls === "function" &&
        cls.prototype &&
        (cls.prototype instanceof BaseCommand ||
          (cls.prototype.constructor.name !== "Object" &&
            typeof cls.prototype.execute === "function" &&
            cls.prototype.data !== undefined))
      );
    } catch {
      return false;
    }
  }

  public async deployCommands(): Promise<void> {
    const commands = this.commands.map((command) => command.data.toJSON());
    const rest = new REST().setToken(config.token);

    try {
      this.logger.info(
        `Started refreshing ${commands.length} application (/) commands.`
      );

      await rest.put(
        Routes.applicationGuildCommands(config.clientId, config.guildId),
        { body: commands }
      );

      this.logger.info(
        `Successfully reloaded ${commands.length} application (/) commands.`
      );
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error("Error deploying commands:", err);
    }
  }

  public registerCommand(command: ICommand): void {
    this.commands.set(command.data.name, command);
    this.logger.info("Registered command:", command.data.name);
  }

  public unregisterCommand(name: string): boolean {
    const removed = this.commands.delete(name);
    if (removed) {
      this.logger.info("Unregistered command:", name);
    }
    return removed;
  }

  public async reloadCommand(name: string): Promise<boolean> {
    const command = this.commands.get(name);
    if (!command) {
      this.logger.warn(`Command ${name} not found for reload`);
      return false;
    }

    try {
      this.logger.info(`Reloaded command: ${name}`);
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Error reloading command ${name}:`, err);
      return false;
    }
  }
}
