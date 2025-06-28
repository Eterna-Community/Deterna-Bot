import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  User,
  type CategoryChannel,
  type Client,
  type TextChannel,
} from "discord.js";
import {
  defaultConfig,
  type ITicket,
  type ITicketConfiguration,
  type TicketType,
} from "../../Config/TicketConfiguration";
import { BaseService } from "../../Services";
import type { ServiceConfig } from "../../Services/data";
import { bootstrap } from "../../Index";
import type { Logger } from "../../Logger/Index";
import { LoggerFactory } from "../../Logger/LoggerFactory";

export class TicketService extends BaseService {
  public readonly serviceIdentifier: string = "ticket-service";
  public readonly config: ServiceConfig = {
    priority: 1000,
    dependencies: [],
    timeout: 15000,
    restartOnError: true,
  };

  private tickets: Record<TicketType, ITicket[]> = {
    general: [],
    bug: [],
    feature: [],
    application: [],
    other: [],
  };

  private client: Client;
  private ticketConfig: ITicketConfiguration;
  private logger: Logger = LoggerFactory.create("TicketService");

  constructor() {
    super();
    this.client = bootstrap.getClient();
    this.ticketConfig = defaultConfig;
  }

  public async onServiceEnable(): Promise<void> {
    this.logger.info("🎫 Ticket Service enabled");
    await this.setupTicketMessage();
  }

  public async onServiceDisable(): Promise<void> {
    this.logger.info("🎫 Ticket Service disabled");
  }

  public async onHealthCheck(): Promise<boolean> {
    return true;
  }

  /**
   * Creates a new ticket for a user
   */
  public async createTicket(
    userId: string,
    ticketType: TicketType,
    guild: any
  ): Promise<{ success: boolean; channel?: TextChannel; message?: string }> {
    try {
      // Check if user already has an open ticket
      if (!this.ticketConfig.settings.allowMultipleTickets) {
        const existingTicket = this.getUserOpenTickets(userId);
        if (existingTicket.length > 0) {
          return {
            success: false,
            message:
              "You already have an open ticket. Please close it before creating a new one.",
          };
        }
      }

      // Check if user is blacklisted
      const member = await guild.members.fetch(userId);
      const hasBlacklistedRole = member.roles.cache.some((role: any) =>
        this.ticketConfig.permissions.blacklistedRoles.includes(role.id)
      );

      if (hasBlacklistedRole) {
        return {
          success: false,
          message: "You are not allowed to create tickets.",
        };
      }

      const ticketTypeConfig = this.ticketConfig.ticketTypes[ticketType];
      const category = guild.channels.cache.get(
        ticketTypeConfig.categoryId
      ) as CategoryChannel;

      if (!category) {
        throw new Error(`Category ${ticketTypeConfig.categoryId} not found`);
      }

      // Generate channel name
      const channelName = this.generateChannelName(userId, ticketType);

      // Create the ticket channel
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
            id: this.ticketConfig.permissions.supportRoleId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.ManageMessages,
            ],
          },
          ...this.ticketConfig.permissions.allowedRoles.map((roleId) => ({
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

      // Create ticket object
      const ticket: ITicket = {
        ChannelId: ticketChannel.id,
        Users: [userId],
        Type: ticketType,
        CreatedBy: userId,
        CreatedAt: new Date(),
        Closed: false,
        ClosedAt: null,
      };

      // Add to tickets array
      this.tickets[ticketType].push(ticket);

      // Send initial message
      await this.sendTicketOpenMessage(ticketChannel, ticket, member.user);

      // Log ticket creation
      await this.logTicketAction("created", ticket, member.user);

      return { success: true, channel: ticketChannel };
    } catch (error) {
      this.logger.info("Error creating ticket:", error);
      return {
        success: false,
        message: "An error occurred while creating the ticket.",
      };
    }
  }

  /**
   * Closes a ticket
   */
  public async closeTicket(
    channelId: string,
    closedBy: string,
    reason?: string
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const ticket = this.getTicketByChannelId(channelId);
      if (!ticket) {
        return { success: false, message: "Ticket not found." };
      }

      if (ticket.Closed) {
        return { success: false, message: "Ticket is already closed." };
      }

      // Update ticket
      ticket.Closed = true;
      ticket.ClosedAt = new Date();
      ticket.ClosedBy = closedBy;
      ticket.CloseReason = reason;

      const channel = this.client.channels.cache.get(channelId) as TextChannel;
      if (!channel) {
        return { success: false, message: "Channel not found." };
      }

      // Send closing message
      const closingEmbed = new EmbedBuilder()
        .setTitle("🔒 Ticket Closing")
        .setDescription("This ticket will be archived in 30 seconds...")
        .setColor(0xe74c3c)
        .setFooter({ text: "Eterna - Support Team" })
        .setTimestamp();

      await channel.send({ embeds: [closingEmbed] });

      // Archive the channel after 30 seconds
      setTimeout(async () => {
        await this.archiveTicket(ticket, channel);
      }, 30000);

      // Log ticket closure
      const closedByUser = await this.client.users.fetch(closedBy);
      await this.logTicketAction("closed", ticket, closedByUser, reason);

      return { success: true };
    } catch (error) {
      this.logger.info("Error closing ticket:", error);
      return {
        success: false,
        message: "An error occurred while closing the ticket.",
      };
    }
  }

  /**
   * Adds a user to a ticket
   */
  public async addUserToTicket(
    channelId: string,
    userId: string,
    addedBy: string
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const ticket = this.getTicketByChannelId(channelId);
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

      // Add permissions for the user
      await channel.permissionOverwrites.create(userId, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true,
      });

      // Add user to ticket
      ticket.Users.push(userId);

      // Notify in channel
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

  /**
   * Removes a user from a ticket
   */
  public async removeUserFromTicket(
    channelId: string,
    userId: string,
    removedBy: string
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const ticket = this.getTicketByChannelId(channelId);
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

  /**
   * Gets all open tickets for a user
   */
  public getUserOpenTickets(userId: string): ITicket[] {
    const allTickets = Object.values(this.tickets).flat();
    return allTickets.filter(
      (ticket) => ticket.Users.includes(userId) && !ticket.Closed
    );
  }

  /**
   * Gets ticket by channel ID
   */
  public getTicketByChannelId(channelId: string): ITicket | null {
    const allTickets = Object.values(this.tickets).flat();
    return allTickets.find((ticket) => ticket.ChannelId === channelId) || null;
  }

  /**
   * Gets all tickets of a specific type
   */
  public getTicketsByType(type: TicketType): ITicket[] {
    return this.tickets[type];
  }

  /**
   * Gets all open tickets
   */
  public getAllOpenTickets(): ITicket[] {
    const allTickets = Object.values(this.tickets).flat();
    return allTickets.filter((ticket) => !ticket.Closed);
  }

  /**
   * Gets ticket statistics
   */
  public getTicketStats(): {
    total: number;
    open: number;
    closed: number;
    byType: Record<TicketType, { total: number; open: number; closed: number }>;
  } {
    const allTickets = Object.values(this.tickets).flat();
    const openTickets = allTickets.filter((ticket) => !ticket.Closed);
    const closedTickets = allTickets.filter((ticket) => ticket.Closed);

    const byType: Record<
      TicketType,
      { total: number; open: number; closed: number }
    > = {} as any;

    for (const type of Object.keys(this.tickets) as TicketType[]) {
      const typeTickets = this.tickets[type];
      byType[type] = {
        total: typeTickets.length,
        open: typeTickets.filter((ticket) => !ticket.Closed).length,
        closed: typeTickets.filter((ticket) => ticket.Closed).length,
      };
    }

    return {
      total: allTickets.length,
      open: openTickets.length,
      closed: closedTickets.length,
      byType,
    };
  }

  // Private helper methods

  private generateChannelName(userId: string, ticketType: TicketType): string {
    const pattern = this.ticketConfig.settings.ticketNamingPattern;
    // This would need to be implemented to fetch username
    // For now, using user ID
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
    const ticketTypeConfig = this.ticketConfig.ticketTypes[ticket.Type];

    const embed = new EmbedBuilder()
      .setTitle(`🧾 ${ticketTypeConfig.name} Ticket Opened`)
      .setDescription(
        `Hello ${user},\n\n` +
          `Thank you for opening a **${ticketTypeConfig.name}** ticket. A member of our support team will be with you shortly.\n\n` +
          `${ticketTypeConfig.defaultMessage}\n\n` +
          `<@&${this.ticketConfig.permissions.alertRoleId}>`
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
        this.ticketConfig.channelConfig.ticketArchiveCategoryId
      ) as CategoryChannel;

      if (archiveCategory) {
        await channel.setParent(archiveCategory);
        await channel.setName(`archived-${channel.name}`);

        // Remove all user permissions except support staff
        const permissionOverwrites = channel.permissionOverwrites.cache;
        for (const [id, permission] of permissionOverwrites) {
          if (
            id !== channel.guild.roles.everyone.id &&
            id !== this.ticketConfig.permissions.supportRoleId &&
            !this.ticketConfig.permissions.allowedRoles.includes(id)
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
        this.ticketConfig.channelConfig.logChannelId
      ) as TextChannel;

      if (!logChannel) return;

      const ticketTypeConfig = this.ticketConfig.ticketTypes[ticket.Type];

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

  private createTicketButtons(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
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
  }

  private async setupTicketMessage(): Promise<void> {
    try {
      const messageChannel = this.client.channels.cache.get(
        this.ticketConfig.channelConfig.messageChannelId
      ) as TextChannel;

      if (!messageChannel) {
        this.logger.info(
          `❌ Message channel ${this.ticketConfig.channelConfig.messageChannelId} not found`
        );
        return;
      }

      // Check if there's already a ticket message
      const messages = await messageChannel.messages.fetch({ limit: 50 });
      const existingMessage = messages.find(
        (msg) =>
          msg.author.id === this.client.user?.id &&
          msg.embeds.length > 0 &&
          msg.embeds[0].title === "🎫 Create a Support Ticket"
      );

      if (existingMessage) {
        this.logger.info(
          "✅ Ticket selection message already exists, updating buttons..."
        );
        // Update the existing message with fresh buttons
        await existingMessage.edit({
          embeds: [existingMessage.embeds[0]],
          components: [this.createTicketButtons()],
        });
        return;
      }

      // Create new ticket selection message
      const embed = new EmbedBuilder()
        .setTitle("🎫 Create a Support Ticket")
        .setDescription(
          "Select the type of support you need by clicking one of the buttons below.\n\n" +
            "📩 **General Support** - General questions or help.\n" +
            "🐛 **Bug Report** - Report a bug you've encountered.\n" +
            "✨ **Feature Request** - Suggest a new feature or improvement.\n" +
            "📝 **Application** - Apply for a position or role.\n" +
            "❓ **Other** - Anything else that doesn't fit above."
        )
        .setColor(0x5865f2) // Discord blurple
        .setFooter({ text: "Eterna - Support System" })
        .setTimestamp();

      const row = this.createTicketButtons();

      await messageChannel.send({
        embeds: [embed],
        components: [row],
      });

      this.logger.info("✅ Ticket selection message created successfully");
    } catch (error) {
      this.logger.info("❌ Error setting up ticket message:", error);
    }
  }
}
