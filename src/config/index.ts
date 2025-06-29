import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

export interface Config {
  token: string;
  guildId: string;
  clientId: string;
  database: {
    url: string;
  };
  moderation_roles: string[];
  ticket: ITicketConfiguration;
}

export interface ITicket {
  ChannelId: string;
  Users: string[];
  Type: TicketType;
  CreatedBy: string;
  CreatedAt: Date;
  Closed: boolean;
  ClosedAt: Date | null;
  CloseReason?: string;
  ClosedBy?: string;
}

export type TicketType =
  | "general"
  | "bug"
  | "feature"
  | "application"
  | "other";

export interface ITicketConfiguration {
  ticketTypes: Record<
    TicketType,
    {
      name: string;
      categoryId: string;
      emoji: string;
      defaultMessage: string;
    }
  >;
  channelConfig: {
    logChannelId: string;
    ticketArchiveCategoryId: string;
    messageChannelId: string;
  };
  permissions: {
    supportRoleId: string;
    allowedRoles: string[];
    alertRoleId: string;
    blacklistedRoles: string[];
  };
  settings: {
    ticketNamingPattern: string;
    autoCloseTimeoutMinutes: number;
    allowMultipleTickets: boolean;
  };
}

export const config: Config = {
  token: process.env.DISCORD_TOKEN || "",
  guildId: process.env.GUILD_ID || "",
  clientId: process.env.CLIENT_ID || "",
  database: {
    url: process.env.DATABASE_URL || "sqlite:./bot.db",
  },
  moderation_roles: [
    "1384243444062490661",
    "1384243444062490660",
    "1384243444062490658",
  ],
  ticket: {
    ticketTypes: {
      general: {
        name: "General Support",
        categoryId: "1388555994639892582",
        emoji: "📩",
        defaultMessage: "Please describe your issue in detail.",
      },
      bug: {
        name: "Bug Report",
        categoryId: "1388556031876927629",
        emoji: "🐛",
        defaultMessage: "Please explain the bug you encountered.",
      },
      feature: {
        name: "Feature Request",
        categoryId: "1388556062193619084",
        emoji: "✨",
        defaultMessage: "Describe the feature you'd like to see.",
      },
      application: {
        name: "Application",
        categoryId: "1388556089355927622",
        emoji: "📝",
        defaultMessage: "Please fill out the application form.",
      },
      other: {
        name: "Other",
        categoryId: "1388556123094913204",
        emoji: "❓",
        defaultMessage: "Please describe your request.",
      },
    },
    channelConfig: {
      logChannelId: "1384243445119586427",
      ticketArchiveCategoryId: "1388556761518182500",
      messageChannelId: "1384243445488681060",
    },
    permissions: {
      supportRoleId: "1384243444062490658",
      allowedRoles: ["1384243444062490656"],
      alertRoleId: "1388556367035498688",
      blacklistedRoles: [],
    },
    settings: {
      ticketNamingPattern: "ticket-{username}-{ticketType}",
      autoCloseTimeoutMinutes: 60,
      allowMultipleTickets: false,
    },
  },
};

// Ticket Specific Config, need to move it
export const ticketSelectionEmbed = {
  title: "🎫 Create a Support Ticket",
  description:
    "Select the type of support you need by clicking one of the buttons below.\n\n" +
    "📩 **General Support** - General questions or help.\n" +
    "🐛 **Bug Report** - Report a bug you've encountered.\n" +
    "✨ **Feature Request** - Suggest a new feature or improvement.\n" +
    "📝 **Application** - Apply for a position or role.\n" +
    "❓ **Other** - Anything else that doesn't fit above.",
  color: 0x5865f2, // Discord blurple
};

export const createTicketOpenedEmbed = (
  ticketTypeName: string,
  username: string
) => ({
  title: `🧾 ${ticketTypeName} Ticket Opened`,
  description:
    `Hello <@${username}>,\n\n` +
    `Thank you for opening a **${ticketTypeName}** ticket. A member of our support team will be with you shortly.\n\n` +
    `In the meantime, please provide as much detail as possible about your issue/request.\n\n` +
    `<@${config.ticket.permissions.alertRoleId}>`,
  color: 0x2ecc71, // Green
  footer: {
    text: "Eterna - Support Team",
  },
  timestamp: new Date().toISOString(),
});

export const ticketTypeButtons =
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_general")
      .setLabel("General")
      .setEmoji("📩")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("ticket_bug")
      .setLabel("Bug")
      .setEmoji("🐛")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("ticket_feature")
      .setLabel("Feature")
      .setEmoji("✨")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("ticket_application")
      .setLabel("Application")
      .setEmoji("📝")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("ticket_other")
      .setLabel("Other")
      .setEmoji("❓")
      .setStyle(ButtonStyle.Secondary)
  );

export const ticketTypeOptions = [
  { label: "General", value: "ticket_general", emoji: "📩" },
  { label: "Bug", value: "ticket_bug", emoji: "🐛" },
  { label: "Feature", value: "ticket_feature", emoji: "✨" },
  { label: "Application", value: "ticket_application", emoji: "📝" },
  { label: "Other", value: "ticket_other", emoji: "❓" },
];
