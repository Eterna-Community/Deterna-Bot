import type { Client } from "discord.js";

export interface IClient {
  client: Client | null;

  start(): Promise<void>;

  getClient(): Client;
}
