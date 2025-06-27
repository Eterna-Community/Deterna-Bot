import type { Client } from "discord.js";
import type { ServiceManager } from "../Services/manager";

export interface IBoot {
  onEnable(): Promise<void>;
  onDisable(): Promise<void>;

  getClient(): Client;
  getServiceManager(): ServiceManager;
}
