import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  type CategoryChannel,
  type Client,
  type Guild,
  type Role,
  type TextChannel,
  type User,
} from "discord.js";
import type { Logger } from "../../logger";
import { LoggerFactory } from "../../logger/factory";
import { bootstrap } from "../..";
import { TicketService } from "./TicketService";
import type { TicketCache } from "./TicketCache";
import { config, type ITicket, type TicketType } from "../../config";

export class TicketHandler {
  private logger: Logger = LoggerFactory.create("TicketHandler");
  private readonly client: Client;
  private readonly ticketCache: TicketCache | null = null;

  constructor() {
    this.client = bootstrap.getClient().client!;

    const ticketService = bootstrap
      .getServiceManager()
      .getService<TicketService>("ticket-service");

    if (!ticketService) {
      this.logger.error("TicketService not found");
      return;
    }

    this.ticketCache = ticketService.getTicketCache();
  }

  public getTicketCache(): TicketCache | null {
    return this.ticketCache;
  }

  public async createTicket(
    userId: string,
    ticketType: TicketType,
    guild: Guild
  ): Promise<{ success: boolean; channel?: TextChannel; message?: string }> {
    if (!this.ticketCache) {
      return { success: false, message: "TicketService not found" };
    }
    // Ticket Limit to 50 Until we store it in DB
    if (this.ticketCache.getAllTickets().length >= 50) {
      return { success: false, message: "Ticket limit reached" };
    }

    if (!config.ticket.settings.allowMultipleTickets) {
      if (this.ticketCache.hasOpenTicket(userId, ticketType)) {
        return { success: false, message: "You already have an open ticket" };
      }
    }

    const member = await guild.members.fetch(userId);
    const hasBlacklistedRole = member.roles.cache.some((role: Role) => {
      return config.ticket.permissions.blacklistedRoles.includes(role.id);
    });

    if (hasBlacklistedRole) {
      return {
        success: false,
        message: "You are blacklisted from creating tickets",
      };
    }

    const type = config.ticket.ticketTypes[ticketType];
    if (!type) {
      return { success: false, message: "Invalid ticket type" };
    }

    const category = guild.channels.cache.get(
      type.categoryId
    ) as CategoryChannel;

    if (!category) {
      return { success: false, message: "Ticket category not found" };
    }

    const channelName = this.generateChannelName(userId, ticketType);

    const ticketChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: category,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: userId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
          ],
        },
        {
          id: config.ticket.permissions.supportRoleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.ManageMessages,
          ],
        },
        ...config.ticket.permissions.allowedRoles.map((roleId) => ({
          id: roleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
          ],
        })),
      ],
    });

    if (!ticketChannel) {
      return { success: false, message: "Failed to create ticket channel" };
    }

    const ticketObject: ITicket = {
      ChannelId: ticketChannel.id,
      CreatedAt: new Date(),
      CreatedBy: userId,
      Type: ticketType,
      Closed: false,
      Users: [userId],
      ClosedAt: null,
    };

    this.ticketCache.addTicket(ticketObject);

    await this.sendTicketOpenMessage(ticketChannel, ticketObject, member.user);
    await this.logTicketAction("open", ticketObject, member.user);
    return {
      success: true,
      channel: ticketChannel,
    };
  }

  public async closeTicket(
    channelId: string,
    closedBy: string,
    reason?: string
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const ticket = this.ticketCache?.getTicket(channelId);
      if (!ticket) {
        return { success: false, message: "Ticket not found." };
      }

      if (ticket.Closed) {
        return { success: false, message: "Ticket is already closed." };
      }

      ticket.Closed = true;
      ticket.ClosedAt = new Date();
      ticket.ClosedBy = closedBy;
      ticket.CloseReason = reason;

      const channel = this.client.channels.cache.get(channelId) as TextChannel;
      if (!channel) {
        return { success: false, message: "Channel not found." };
      }

      const closingEmbed = new EmbedBuilder()
        .setTitle("🔒 Ticket Closing")
        .setDescription("This ticket will be archived in 30 seconds...")
        .setColor(0xe74c3c)
        .setFooter({ text: "Eterna - Support Team" })
        .setTimestamp();

      await channel.send({ embeds: [closingEmbed] });

      setTimeout(async () => {
        await this.archiveTicket(ticket, channel);
      }, 30000);

      const closedByUser = await this.client.users.fetch(closedBy);
      await this.logTicketAction("closed", ticket, closedByUser, reason);
      this.ticketCache?.closeTicket(channelId, reason, closedBy);

      return { success: true };
    } catch (error) {
      this.logger.info("Error closing ticket:", error);
      return {
        success: false,
        message: "An error occurred while closing the ticket.",
      };
    }
  }

  public async addUserToTicket(
    channelId: string,
    userId: string,
    addedBy: string
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const ticket = this.ticketCache?.getTicket(channelId);
      if (!ticket || ticket.Closed) {
        return {
          success: false,
          message: "Ticket not found or already closed.",
        };
      }

      if (ticket.Users.includes(userId)) {
        return { success: false, message: "User is already in this ticket." };
      }

      const channel = this.client.channels.cache.get(channelId) as TextChannel;
      if (!channel) {
        return { success: false, message: "Channel not found." };
      }

      await channel.permissionOverwrites.create(userId, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true,
      });

      ticket.Users.push(userId);

      const user = await this.client.users.fetch(userId);
      const addedByUser = await this.client.users.fetch(addedBy);

      const embed = new EmbedBuilder()
        .setTitle("➕ User Added to Ticket")
        .setDescription(
          `${user} has been added to this ticket by ${addedByUser}`
        )
        .setColor(0x3498db)
        .setTimestamp();

      await channel.send({ embeds: [embed] });

      return { success: true };
    } catch (error) {
      this.logger.info("Error adding user to ticket:", error);
      return {
        success: false,
        message: "An error occurred while adding the user.",
      };
    }
  }

  public async removeUserFromTicket(
    channelId: string,
    userId: string,
    removedBy: string
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const ticket = this.ticketCache?.getTicket(channelId);
      if (!ticket || ticket.Closed) {
        return {
          success: false,
          message: "Ticket not found or already closed.",
        };
      }

      if (!ticket.Users.includes(userId)) {
        return { success: false, message: "User is not in this ticket." };
      }

      // Can't remove the ticket creator
      if (ticket.CreatedBy === userId) {
        return { success: false, message: "Cannot remove the ticket creator." };
      }

      const channel = this.client.channels.cache.get(channelId) as TextChannel;
      if (!channel) {
        return { success: false, message: "Channel not found." };
      }

      // Remove permissions
      await channel.permissionOverwrites.delete(userId);

      // Remove user from ticket
      ticket.Users = ticket.Users.filter((id) => id !== userId);

      // Notify in channel
      const user = await this.client.users.fetch(userId);
      const removedByUser = await this.client.users.fetch(removedBy);

      const embed = new EmbedBuilder()
        .setTitle("➖ User Removed from Ticket")
        .setDescription(
          `${user} has been removed from this ticket by ${removedByUser}`
        )
        .setColor(0xe74c3c)
        .setTimestamp();

      await channel.send({ embeds: [embed] });

      return { success: true };
    } catch (error) {
      this.logger.info("Error removing user from ticket:", error);
      return {
        success: false,
        message: "An error occurred while removing the user.",
      };
    }
  }

  private generateChannelName(userId: string, ticketType: TicketType): string {
    const pattern = config.ticket.settings.ticketNamingPattern;
    return pattern
      .replace("{username}", `user-${userId.slice(-4)}`)
      .replace("{ticketType}", ticketType)
      .toLowerCase();
  }

  private async sendTicketOpenMessage(
    channel: TextChannel,
    ticket: ITicket,
    user: User
  ): Promise<void> {
    const ticketTypeConfig = config.ticket.ticketTypes[ticket.Type];

    const embed = new EmbedBuilder()
      .setTitle(`🧾 ${ticketTypeConfig.name} Ticket Opened`)
      .setDescription(
        `Hello ${user},\n\n` +
          `Thank you for opening a **${ticketTypeConfig.name}** ticket. A member of our support team will be with you shortly.\n\n` +
          `${ticketTypeConfig.defaultMessage}\n\n` +
          `<@&${config.ticket.permissions.alertRoleId}>`
      )
      .setColor(0x2ecc71)
      .setFooter({ text: "Eterna - Support Team" })
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`close_ticket_${channel.id}`)
        .setLabel("Close Ticket")
        .setEmoji("🔒")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`add_user_${channel.id}`)
        .setLabel("Add User")
        .setEmoji("➕")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`remove_user_${channel.id}`)
        .setLabel("Remove User")
        .setEmoji("➖")
        .setStyle(ButtonStyle.Secondary)
    );

    await channel.send({ embeds: [embed], components: [row] });
  }

  private async archiveTicket(
    ticket: ITicket,
    channel: TextChannel
  ): Promise<void> {
    try {
      const archiveCategory = channel.guild.channels.cache.get(
        config.ticket.channelConfig.ticketArchiveCategoryId
      ) as CategoryChannel;

      if (archiveCategory) {
        await channel.setParent(archiveCategory);
        await channel.setName(`archived-${channel.name}`);

        // Remove all user permissions except support staff
        const permissionOverwrites = channel.permissionOverwrites.cache;
        for (const [id, permission] of permissionOverwrites) {
          if (
            id !== channel.guild.roles.everyone.id &&
            id !== config.ticket.permissions.supportRoleId &&
            !config.ticket.permissions.allowedRoles.includes(id)
          ) {
            await channel.permissionOverwrites.delete(id);
          }
        }
      } else {
        // If no archive category, delete the channel
        await channel.delete();
      }
    } catch (error) {
      this.logger.info("Error archiving ticket:", error);
    }
  }

  private async logTicketAction(
    action: string,
    ticket: ITicket,
    user: User,
    reason?: string
  ): Promise<void> {
    try {
      const logChannel = this.client.channels.cache.get(
        config.ticket.channelConfig.logChannelId
      ) as TextChannel;

      if (!logChannel) return;

      const ticketTypeConfig = config.ticket.ticketTypes[ticket.Type];

      const embed = new EmbedBuilder()
        .setTitle(
          `🎫 Ticket ${action.charAt(0).toUpperCase() + action.slice(1)}`
        )
        .addFields(
          { name: "Ticket Type", value: ticketTypeConfig.name, inline: true },
          { name: "Channel", value: `<#${ticket.ChannelId}>`, inline: true },
          { name: "User", value: `${user} (${user.id})`, inline: true },
          { name: "Created By", value: `<@${ticket.CreatedBy}>`, inline: true },
          {
            name: "Created At",
            value: ticket.CreatedAt.toISOString(),
            inline: true,
          }
        )
        .setColor(action === "created" ? 0x2ecc71 : 0xe74c3c)
        .setTimestamp();

      if (reason) {
        embed.addFields({ name: "Reason", value: reason, inline: false });
      }

      if (ticket.ClosedAt) {
        embed.addFields({
          name: "Closed At",
          value: ticket.ClosedAt.toISOString(),
          inline: true,
        });
      }

      await logChannel.send({ embeds: [embed] });
    } catch (error) {
      this.logger.info("Error logging ticket action:", error);
    }
  }
}
