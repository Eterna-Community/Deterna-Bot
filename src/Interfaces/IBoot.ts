import type { Client } from "discord.js";
import type { ServiceManager } from "../services/manager";
import type { EventManager } from "../events/EventManager";
import type { CommandManager } from "../commands/CommandManager";
import type { IClient } from "./IClient";

export interface IBoot {
  onEnable(): Promise<void>;
  onDisable(): Promise<void>;

  getClient(): IClient;
  getServiceManager(): ServiceManager;
  getEventManager(): EventManager;
  getCommandManager(): CommandManager;

  registerService(): Promise<void>;
}
