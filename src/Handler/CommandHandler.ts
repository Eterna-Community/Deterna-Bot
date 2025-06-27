import { Collection, REST, Routes } from "discord.js";
import type { ICommand } from "../Interfaces/ICommand";
import { config } from "../Config/Config";
import { Glob } from "bun";
import type { Logger } from "../Logger/Index";
import { LoggerFactory } from "../Logger/LoggerFactory";
import { LogTarget } from "../Logger/Types";
import {
  PerformanceMonitor,
  PerformanceMonitorWithStats,
} from "../Utils/Performance";

@PerformanceMonitor({
  minThreshold: 50, // Nur Methoden > 50ms loggen
  includeArguments: true, // Argumente mit ausgeben
  includeReturnValue: true, // Rückgabewerte anzeigen
  excludeMethods: ["toString"], // Methoden ausschließen
  colorize: true, // Farbige Ausgabe
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
      const command = await import(file);
      if (command.default) {
        this.commands.set(command.default.data.name, command.default);
        this.logger.info("Loaded command:", command.default.data.name);
      }
    }

    this.logger.info(`Loaded ${this.commands.size} commands.`);
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
}
