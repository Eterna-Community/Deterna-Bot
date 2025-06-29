import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  type Client,
  type TextChannel,
} from "discord.js";
import { bootstrap } from "../..";
import type { IBoot } from "../../interfaces/IBoot";
import type { Logger } from "../../logger";
import { LoggerFactory } from "../../logger/factory";
import { BaseService } from "../../services";
import type { ServiceConfig } from "../../services/types";
import { config, type ITicket, type TicketType } from "../../config";
import { TicketCache } from "./TicketCache";

export class TicketService extends BaseService {
  public logger: Logger = LoggerFactory.create("TicketService");
  public readonly identifier: string = "ticket-service";
  public readonly config: ServiceConfig = {
    priority: 1000,
    dependencies: [],
    timeout: 1000,
    restartOnError: true,
  };

  private ticketCategories: string[] = [];

  private ticketCache: TicketCache = new TicketCache();

  private client: Client = bootstrap.getClient().client!;

  public async onServiceEnable(): Promise<void> {
    await this.setupTicketMessage();

    for (const category of Object.values(config.ticket.ticketTypes)) {
      this.ticketCategories.push(category.categoryId);
    }
  }

  public async onServiceDisable(): Promise<void> {}

  public async onHealthCheck(): Promise<boolean> {
    const guild = await this.client.guilds.fetch(config.guildId);

    for (const category of this.ticketCategories) {
      const categoryChannel = await guild.channels.fetch(category);
      if (
        !categoryChannel ||
        categoryChannel.type !== ChannelType.GuildCategory
      ) {
        continue;
      }

      const channelsInCategory = categoryChannel.children.cache.filter(
        (channel) => channel.type === ChannelType.GuildText
      );

      for (const [_, channel] of channelsInCategory) {
        const ticket = this.ticketCache.getTicket(channel.id);
        if (ticket) {
          continue;
        }

        // If the Channel is not in the cache and its not closed, add it to the cache
        const textChannel = channel as TextChannel;

        // Determine ticket type from category
        const ticketType = this.getTicketTypeFromCategory(category);
        if (!ticketType) {
          this.logger.warn(
            `Could not determine ticket type for category ${category}`
          );
          continue;
        }

        try {
          // Reconstruct ticket data from channel
          const reconstructedTicket = await this.reconstructTicketFromChannel(
            textChannel,
            ticketType
          );

          if (reconstructedTicket) {
            // Add to cache
            this.ticketCache.addTicket(reconstructedTicket);
            this.logger.info(
              `✅ Added reconstructed ticket ${textChannel.name} (${textChannel.id}) to cache`
            );
          } else {
            this.logger.warn(
              `⚠️ Could not reconstruct ticket data for channel ${textChannel.name}`
            );
          }
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          this.logger.error(
            `❌ Error reconstructing ticket for channel ${textChannel.name}:`,
            err
          );
        }
      }
    }

    return true;
  }

  private getTicketTypeFromCategory(categoryId: string): TicketType | null {
    for (const [type, typeConfig] of Object.entries(
      config.ticket.ticketTypes
    )) {
      if (typeConfig.categoryId === categoryId) {
        return type as TicketType;
      }
    }
    return null;
  }

  private async reconstructTicketFromChannel(
    channel: TextChannel,
    ticketType: TicketType
  ): Promise<ITicket | null> {
    try {
      // Get channel permissions to find users with access
      const users: string[] = [];
      let createdBy = "";

      // Check permission overwrites for users
      const permissions = channel.permissionOverwrites.cache;

      for (const [id, overwrite] of permissions) {
        if (overwrite.type === 1) {
          // Type 1 = User
          users.push(id);

          // Try to determine the creator (first user or from channel name)
          if (!createdBy) {
            createdBy = id;
          }
        }
      }

      // Try to extract creator from channel name pattern
      // Assuming pattern like "ticket-username-type" or similar
      const channelName = channel.name.toLowerCase();
      const nameParts = channelName.split("-");

      if (nameParts.length >= 2) {
        const potentialUsername = nameParts[1];

        // Try to match username with actual users in permissions
        for (const userId of users) {
          try {
            const member = await channel.guild.members.fetch(userId);
            if (
              member.user.username.toLowerCase() === potentialUsername ||
              member.displayName.toLowerCase() === potentialUsername ||
              member.user.globalName?.toLowerCase() === potentialUsername
            ) {
              createdBy = userId;
              break;
            }
          } catch (error) {
            // User might have left the server, skip
            continue;
          }
        }
      }

      // If still no creator found, use the first user in the list
      if (!createdBy && users.length > 0) {
        createdBy = users[0];
      }

      // Determine if ticket is closed based on category
      const isArchived =
        channel.parentId ===
        config.ticket.channelConfig.ticketArchiveCategoryId;

      const reconstructedTicket: ITicket = {
        ChannelId: channel.id,
        Users: users,
        Type: ticketType,
        CreatedBy: createdBy,
        CreatedAt: channel.createdAt || new Date(),
        Closed: isArchived,
        ClosedAt: isArchived ? channel.createdAt || new Date() : null,
        CloseReason: isArchived ? "Reconstructed from archive" : undefined,
        ClosedBy: undefined,
      };

      return reconstructedTicket;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Error reconstructing ticket from channel ${channel.id}:`,
        err
      );
      return null;
    }
  }

  public getTicketCache(): TicketCache {
    return this.ticketCache;
  }

  private async setupTicketMessage(): Promise<void> {
    try {
      const messageChannel = this.client.channels.cache.get(
        config.ticket.channelConfig.messageChannelId
      ) as TextChannel;

      if (!messageChannel) {
        this.logger.info(
          `❌ Message channel ${config.ticket.channelConfig.messageChannelId} not found`
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

  // Create later an Dedicated Area to Create Buttons
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
}
