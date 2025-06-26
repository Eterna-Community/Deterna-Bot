import { Client, GatewayIntentBits, Partials } from "discord.js";
import type { IBoot } from "./Interfaces/IBoot";
import { CommandHandler } from "./Handler/CommandHandler";
import { EventHandler } from "./Handler/EventHandler";
import { config } from "./Config/Config";

export class Bootstrap implements IBoot {
  private client: Client | undefined;
  private commandManager: CommandHandler | undefined;
  private eventManager: EventHandler | undefined;

  public async onEnable(): Promise<void> {
    try {
      // Client initialisieren mit den nötigen Intents
      this.client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
          GatewayIntentBits.GuildMessageReactions,
          GatewayIntentBits.GuildMembers,
          GatewayIntentBits.GuildModeration,
        ],
        partials: [Partials.Message, Partials.Channel, Partials.Reaction],
      });

      // Manager initialisieren
      this.commandManager = new CommandHandler();
      this.eventManager = new EventHandler(this.client);

      // Commands und Events laden
      await this.commandManager.loadCommands();
      await this.eventManager.loadEvents();

      // Basic Event Handler für Commands
      this.client.on("interactionCreate", async (interaction) => {
        if (!interaction.isChatInputCommand()) return;

        const command = this.commandManager!.commands.get(
          interaction.commandName
        );
        if (!command) {
          console.error(
            `No command matching ${interaction.commandName} was found.`
          );
          return;
        }

        try {
          await command.execute(interaction);
        } catch (error) {
          console.error("Error executing command:", error);
          const reply = {
            content: "There was an error while executing this command!",
            ephemeral: true,
          };

          if (interaction.replied || interaction.deferred) {
            await interaction.followUp(reply);
          } else {
            await interaction.reply(reply);
          }
        }
      });

      // Ready Event
      this.client.once("ready", async (client) => {
        console.log(`Ready! Logged in as ${client.user.tag}`);
        await this.commandManager!.deployCommands();
      });

      // Bot anmelden
      await this.client.login(config.token);
    } catch (error) {
      console.error("Error during bot initialization:", error);
      throw error;
    }
  }

  public async onDisable(): Promise<void> {
    if (this.client) {
      this.client.destroy();
      console.log("Bot disconnected successfully");
    }
  }

  public getClient(): Client {
    if (!this.client) {
      throw new Error("Client is not initialized");
    }
    return this.client;
  }
}
