import type { CommandInteraction, SlashCommandBuilder } from "discord.js";

export interface ICommand {
  data: SlashCommandBuilder;
  execute(interaction: CommandInteraction): Promise<void>;
}

// src/interfaces/IEvent.ts
import type { ClientEvents } from "discord.js";

export interface IEvent<K extends keyof ClientEvents = keyof ClientEvents> {
  name: K;
  once?: boolean;
  execute(...args: ClientEvents[K]): Promise<void>;
}
