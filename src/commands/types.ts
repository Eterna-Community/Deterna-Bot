import {
  ApplicationCommandOptionType,
  MessageFlags,
  PermissionsBitField,
  type ChatInputCommandInteraction,
  type Client,
  type SlashCommandBuilder,
} from "discord.js";

export interface ICommand {
  data: SlashCommandBuilder;
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
}

export interface CommandConfig {
  name: string;
  description: string;
  options?: CommandOptionConfig[];
  subcommands?: SubcommandConfig[];
  permissions?: (keyof typeof PermissionsBitField.Flags)[];
  category?: string;
  guildOnly?: boolean;
  ownerOnly?: boolean;
}

export interface CommandOptionConfig {
  name: string;
  description: string;
  type: CommandOptionType;
  required?: boolean;
  choices?: Array<{ name: string; value: string | number }>;
  minValue?: number;
  maxValue?: number;
  minLength?: number;
  maxLength?: number;
  autocomplete?: boolean;
}

export interface SubcommandConfig {
  name: string;
  description: string;
  options?: CommandOptionConfig[];
}

// Type definitions for better type safety
export type CommandOptionType =
  | "string"
  | "integer"
  | "boolean"
  | "user"
  | "channel"
  | "role"
  | "mentionable"
  | "number"
  | "attachment";

export const OPTION_TYPE_MAP: Record<
  CommandOptionType,
  ApplicationCommandOptionType
> = {
  string: ApplicationCommandOptionType.String,
  integer: ApplicationCommandOptionType.Integer,
  boolean: ApplicationCommandOptionType.Boolean,
  user: ApplicationCommandOptionType.User,
  channel: ApplicationCommandOptionType.Channel,
  role: ApplicationCommandOptionType.Role,
  mentionable: ApplicationCommandOptionType.Mentionable,
  number: ApplicationCommandOptionType.Number,
  attachment: ApplicationCommandOptionType.Attachment,
};

export abstract class BaseCommand implements ICommand {
  public data!: SlashCommandBuilder;
  public abstract execute(
    interaction: ChatInputCommandInteraction
  ): Promise<void>;

  public client: Client;

  constructor() {
    this.client = bootstrap.getClient();
  }

  protected async reply(
    interaction: ChatInputCommandInteraction,
    content: string,
    ephemeral: boolean = false
  ): Promise<void> {
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({ content });
    } else {
      await interaction.reply({
        content,
        flags: ephemeral ? MessageFlags.Ephemeral : undefined,
      });
    }
  }

  protected async deferReply(
    interaction: ChatInputCommandInteraction,
    ephemeral: boolean = false
  ): Promise<void> {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({
        flags: ephemeral ? MessageFlags.Ephemeral : undefined,
      });
    }
  }
}
