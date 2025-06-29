import { Client, GatewayIntentBits, Partials } from "discord.js";
import type { IClient } from "./interfaces/IClient";
import type { Logger } from "./logger";
import { LoggerFactory } from "./logger/factory";
import { config } from "./config";

export class CustomClient implements IClient {
  public client: Client | null = null;
  private logger: Logger = LoggerFactory.create("CustomClient");

  public async start(): Promise<void> {
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
  }

  public getClient(): Client {
    if (!this.client) throw new Error("Client not initialized");
    return this.client;
  }
}
