import { Collection, REST, Routes } from "discord.js";
import type { ICommand } from "../Interfaces/ICommand";
import { config } from "../Config/Config";

export class CommandHandler {
  public commands: Collection<string, ICommand>;

  constructor() {
    this.commands = new Collection();
  }

  public async loadCommands(): Promise<void> {
    /*
    const commandFiles = glob.sync('./src/Modules/Commands/*.ts');
    for (const file of commandFiles) {
      const command = await import(file);
      if (command.default) {
        this.commands.set(command.default.data.name, command.default);
      }
    }
    */
  }

  public async deployCommands(): Promise<void> {
    const commands = this.commands.map((command) => command.data.toJSON());

    const rest = new REST().setToken(config.token);

    try {
      console.log(
        `Started refreshing ${commands.length} application (/) commands.`
      );

      await rest.put(
        Routes.applicationGuildCommands(config.clientId, config.guildId),
        { body: commands }
      );

      console.log(
        `Successfully reloaded ${commands.length} application (/) commands.`
      );
    } catch (error) {
      console.error("Error deploying commands:", error);
    }
  }
}
