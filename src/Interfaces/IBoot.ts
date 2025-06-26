import type { Client } from "discord.js";

export interface IBoot {
  onEnable(): Promise<void>;
  onDisable(): Promise<void>;

  getClient(): Client;
}
