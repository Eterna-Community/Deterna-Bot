import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type SlashCommandSubcommandBuilder,
  ApplicationCommandOptionType,
  PermissionsBitField,
  Client,
  InteractionResponseType,
  MessageFlags,
} from "discord.js";
import { bootstrap } from "../Index";

// Base Command Interface
export interface ICommand {
  data: SlashCommandBuilder;
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
}

// Base Command Class
export abstract class BaseCommand implements ICommand {
  public data!: SlashCommandBuilder; // Will be set by decorator
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

// Configuration Interfaces
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

// Mapping from our types to Discord.js types
const OPTION_TYPE_MAP: Record<CommandOptionType, ApplicationCommandOptionType> =
  {
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

export function Command(config: CommandConfig) {
  return function <T extends new (...args: any[]) => BaseCommand>(
    constructor: T
  ) {
    ///@ts-expect-error // Fuck this shit, TS
    const DecoratedClass = class extends constructor {
      constructor(...args: any[]) {
        super(...args);
        this.data = CommandBuilder.build(config);
      }
    };
    Object.defineProperty(DecoratedClass, "name", { value: constructor.name });

    return DecoratedClass as T;
  };
}

class CommandBuilder {
  static build(config: CommandConfig): SlashCommandBuilder {
    const builder = new SlashCommandBuilder()
      .setName(config.name)
      .setDescription(config.description);

    // Add default permissions if specified
    if (config.permissions && config.permissions.length > 0) {
      const permissionsBitField = new PermissionsBitField(config.permissions);
      builder.setDefaultMemberPermissions(permissionsBitField.bitfield);
    }

    // Set guild-only if specified
    if (config.guildOnly) {
      // 0 Stands for (Only in Guilds)
      // 1 Stands for (Interaction in Guilds and DMs)
      // 2 Stands for (Interaction everywhere related to discord, including Private DMs and Group Chats)
      builder.setContexts(0);
    }

    // Add options
    if (config.options) {
      config.options.forEach((option) => this.addOption(builder, option));
    }

    // Add subcommands
    if (config.subcommands) {
      config.subcommands.forEach((subcommand) =>
        this.addSubcommand(builder, subcommand)
      );
    }

    return builder;
  }

  private static addOption(
    builder: SlashCommandBuilder,
    option: CommandOptionConfig
  ): void {
    const optionType = OPTION_TYPE_MAP[option.type];

    switch (option.type) {
      case "string":
        builder.addStringOption((opt) => {
          this.configureBasicOption(opt, option);
          ///@ts-expect-error
          if (option.choices) opt.addChoices(...option.choices);
          if (option.minLength !== undefined)
            opt.setMinLength(option.minLength);
          if (option.maxLength !== undefined)
            opt.setMaxLength(option.maxLength);
          if (option.autocomplete) opt.setAutocomplete(true);
          return opt;
        });
        break;

      case "integer":
        builder.addIntegerOption((opt) => {
          this.configureBasicOption(opt, option);
          ///@ts-expect-error
          if (option.choices) opt.addChoices(...option.choices);
          if (option.minValue !== undefined) opt.setMinValue(option.minValue);
          if (option.maxValue !== undefined) opt.setMaxValue(option.maxValue);
          if (option.autocomplete) opt.setAutocomplete(true);
          return opt;
        });
        break;

      case "number":
        builder.addNumberOption((opt) => {
          this.configureBasicOption(opt, option);
          ///@ts-expect-error
          if (option.choices) opt.addChoices(...option.choices);
          if (option.minValue !== undefined) opt.setMinValue(option.minValue);
          if (option.maxValue !== undefined) opt.setMaxValue(option.maxValue);
          if (option.autocomplete) opt.setAutocomplete(true);
          return opt;
        });
        break;

      case "boolean":
        builder.addBooleanOption((opt) => {
          this.configureBasicOption(opt, option);
          return opt;
        });
        break;

      case "user":
        builder.addUserOption((opt) => {
          this.configureBasicOption(opt, option);
          return opt;
        });
        break;

      case "channel":
        builder.addChannelOption((opt) => {
          this.configureBasicOption(opt, option);
          return opt;
        });
        break;

      case "role":
        builder.addRoleOption((opt) => {
          this.configureBasicOption(opt, option);
          return opt;
        });
        break;

      case "mentionable":
        builder.addMentionableOption((opt) => {
          this.configureBasicOption(opt, option);
          return opt;
        });
        break;

      case "attachment":
        builder.addAttachmentOption((opt) => {
          this.configureBasicOption(opt, option);
          return opt;
        });
        break;

      default:
        throw new Error(`Unsupported option type: ${option.type}`);
    }
  }

  private static configureBasicOption(
    opt: any,
    option: CommandOptionConfig
  ): void {
    opt.setName(option.name).setDescription(option.description);
    if (option.required) opt.setRequired(true);
  }

  private static addSubcommand(
    builder: SlashCommandBuilder,
    subcommand: SubcommandConfig
  ): void {
    builder.addSubcommand((sub: SlashCommandSubcommandBuilder) => {
      sub.setName(subcommand.name).setDescription(subcommand.description);

      if (subcommand.options) {
        subcommand.options.forEach((option) =>
          this.addSubcommandOption(sub, option)
        );
      }

      return sub;
    });
  }

  private static addSubcommandOption(
    subcommand: SlashCommandSubcommandBuilder,
    option: CommandOptionConfig
  ): void {
    switch (option.type) {
      case "string":
        subcommand.addStringOption((opt) => {
          this.configureBasicOption(opt, option);
          ///@ts-expect-error
          if (option.choices) opt.addChoices(...option.choices);
          if (option.minLength !== undefined)
            opt.setMinLength(option.minLength);
          if (option.maxLength !== undefined)
            opt.setMaxLength(option.maxLength);
          if (option.autocomplete) opt.setAutocomplete(true);
          return opt;
        });
        break;

      case "integer":
        subcommand.addIntegerOption((opt) => {
          this.configureBasicOption(opt, option);
          ///@ts-expect-error
          if (option.choices) opt.addChoices(...option.choices);
          if (option.minValue !== undefined) opt.setMinValue(option.minValue);
          if (option.maxValue !== undefined) opt.setMaxValue(option.maxValue);
          if (option.autocomplete) opt.setAutocomplete(true);
          return opt;
        });
        break;

      case "number":
        subcommand.addNumberOption((opt) => {
          this.configureBasicOption(opt, option);
          ///@ts-expect-error
          if (option.choices) opt.addChoices(...option.choices);
          if (option.minValue !== undefined) opt.setMinValue(option.minValue);
          if (option.maxValue !== undefined) opt.setMaxValue(option.maxValue);
          if (option.autocomplete) opt.setAutocomplete(true);
          return opt;
        });
        break;

      case "boolean":
        subcommand.addBooleanOption((opt) => {
          this.configureBasicOption(opt, option);
          return opt;
        });
        break;

      case "user":
        subcommand.addUserOption((opt) => {
          this.configureBasicOption(opt, option);
          return opt;
        });
        break;

      case "channel":
        subcommand.addChannelOption((opt) => {
          this.configureBasicOption(opt, option);
          return opt;
        });
        break;

      case "role":
        subcommand.addRoleOption((opt) => {
          this.configureBasicOption(opt, option);
          return opt;
        });
        break;

      case "mentionable":
        subcommand.addMentionableOption((opt) => {
          this.configureBasicOption(opt, option);
          return opt;
        });
        break;

      case "attachment":
        subcommand.addAttachmentOption((opt) => {
          this.configureBasicOption(opt, option);
          return opt;
        });
        break;

      default:
        throw new Error(`Unsupported subcommand option type: ${option.type}`);
    }
  }
}
