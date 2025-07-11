import {
  ActionRowBuilder,
  GuildMember,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ClientEvents,
  type Interaction,
} from "discord.js";
import { BaseEvent } from "../../events/types";
import type { Logger } from "../../logger";
import { LoggerFactory } from "../../logger/factory";
import { TicketHandler } from "../ticket/TicketHandler";
import { config, type TicketType } from "../../config";
import { bootstrap } from "../..";
import { TicketService } from "../ticket/TicketService";
import type { TicketCache } from "../ticket/TicketCache";

export class TicketButtonInteraction extends BaseEvent<"interactionCreate"> {
  public readonly name = "interactionCreate";

  private logger: Logger = LoggerFactory.create("TicketButtonInteraction");
  private ticketHandler: TicketHandler;
  private ticketCache: TicketCache;

  constructor() {
    super();
    this.ticketHandler = new TicketHandler();
    this.ticketCache = this.ticketHandler.getTicketCache()!;
  }

  public async execute(interaction: Interaction): Promise<void> {
    try {
      if (interaction.isButton()) {
        if (
          interaction.customId.startsWith("ticket_") ||
          interaction.customId.startsWith("close_ticket_") ||
          interaction.customId.startsWith("add_user_") ||
          interaction.customId.startsWith("remove_user_")
        ) {
          await this.handleButtonInteraction(interaction);
        }
      }

      if (interaction.isModalSubmit()) {
        if (
          interaction.customId.startsWith("close_reason_") ||
          interaction.customId.startsWith("add_user_modal_") ||
          interaction.customId.startsWith("remove_user_modal_")
        ) {
          await this.handleModalSubmit(interaction);
        }
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error("Error executing event:", err);
    }
  }

  async handleButtonInteraction(interaction: ButtonInteraction) {
    const { customId, user, guild } = interaction;

    // Ticket Creation Buttons
    if (customId.startsWith("ticket_")) {
      const ticketType = customId.replace("ticket_", "") as TicketType;

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const result = await this.ticketHandler.createTicket(
        user.id,
        ticketType,
        guild!
      );

      if (result.success) {
        await interaction.editReply({
          content: `✅ Your **${ticketType}** ticket has been created: ${result.channel}\n\nPlease head over to your ticket channel to continue.`,
        });
      } else {
        await interaction.editReply({
          content: `❌ ${result.message}`,
        });
      }
      return;
    }

    // Close Ticket Button
    if (customId.startsWith("close_ticket_")) {
      const channelId = customId.replace("close_ticket_", "");

      // Check if user has permission to close (creator or staff)
      const ticket = this.ticketCache?.getTicket(channelId);
      if (!ticket) {
        await interaction.reply({
          content: "❌ Ticket not found.",
          ephemeral: true,
        });
        return;
      }

      const member = interaction.member as GuildMember;
      const isCreator = ticket.CreatedBy === user.id;
      const isStaff =
        member.roles.cache.has(config.ticket.permissions.supportRoleId) ||
        config.ticket.permissions.allowedRoles.some((roleId: string) =>
          member.roles.cache.has(roleId)
        ) ||
        config.moderation_roles.some((roleId: string) => {
          return member.roles.cache.has(roleId);
        });

      if (!isCreator && !isStaff) {
        await interaction.reply({
          content: "❌ You don't have permission to close this ticket.",
          ephemeral: true,
        });
        return;
      }

      // Show modal for close reason
      const modal = new ModalBuilder()
        .setCustomId(`close_reason_${channelId}`)
        .setTitle("Close Ticket");

      const reasonInput = new TextInputBuilder()
        .setCustomId("close_reason")
        .setLabel("Reason for closing (optional)")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("Please provide a reason for closing this ticket...")
        .setRequired(false)
        .setMaxLength(500);

      const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
        reasonInput
      );
      modal.addComponents(actionRow);

      await interaction.showModal(modal);
      return;
    }

    // Add User Button
    if (customId.startsWith("add_user_")) {
      const channelId = customId.replace("add_user_", "");

      // Check if user has permission (staff only)
      const member = interaction.member as any;
      const isStaff =
        member.roles.cache.has(config.ticket.permissions.supportRoleId) ||
        config.ticket.permissions.allowedRoles.some((roleId: string) =>
          member.roles.cache.has(roleId)
        ) ||
        config.moderation_roles.some((roleId: string) => {
          return member.roles.cache.has(roleId);
        });

      if (!isStaff) {
        await interaction.reply({
          content: "❌ Only staff members can add users to tickets.",
          ephemeral: true,
        });
        return;
      }

      // Show modal for user input
      const modal = new ModalBuilder()
        .setCustomId(`add_user_modal_${channelId}`)
        .setTitle("Add User to Ticket");

      const userInput = new TextInputBuilder()
        .setCustomId("user_id")
        .setLabel("User ID or @mention")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Enter user ID or @mention the user...")
        .setRequired(true);

      const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
        userInput
      );
      modal.addComponents(actionRow);

      await interaction.showModal(modal);
      return;
    }

    // Remove User Button
    if (customId.startsWith("remove_user_")) {
      const channelId = customId.replace("remove_user_", "");

      // Check if user has permission (staff only)
      const member = interaction.member as GuildMember;
      const isStaff =
        member.roles.cache.has(config.ticket.permissions.supportRoleId) ||
        config.ticket.permissions.allowedRoles.some((roleId: string) =>
          member.roles.cache.has(roleId)
        ) ||
        config.moderation_roles.some((roleId: string) => {
          return member.roles.cache.has(roleId);
        });

      if (!isStaff) {
        await interaction.reply({
          content: "❌ Only staff members can remove users from tickets.",
          ephemeral: true,
        });
        return;
      }

      // Show modal for user input
      const modal = new ModalBuilder()
        .setCustomId(`remove_user_modal_${channelId}`)
        .setTitle("Remove User from Ticket");

      const userInput = new TextInputBuilder()
        .setCustomId("user_id")
        .setLabel("User ID or @mention")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Enter user ID or @mention the user...")
        .setRequired(true);

      const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
        userInput
      );
      modal.addComponents(actionRow);

      await interaction.showModal(modal);
      return;
    }
  }

  // Handle Modal Submissions
  async handleModalSubmit(interaction: any) {
    const { customId } = interaction;

    // Close Reason Modal
    if (customId.startsWith("close_reason_")) {
      const channelId = customId.replace("close_reason_", "");
      const reason =
        interaction.fields.getTextInputValue("close_reason") ||
        "No reason provided";

      await interaction.deferReply({ ephemeral: true });

      const result = await this.ticketHandler.closeTicket(
        channelId,
        interaction.user.id,
        reason
      );

      if (result.success) {
        await interaction.editReply({
          content: "✅ Ticket is being closed...",
        });
      } else {
        await interaction.editReply({
          content: `❌ ${result.message}`,
        });
      }
      return;
    }

    // Add User Modal
    if (customId.startsWith("add_user_modal_")) {
      const channelId = customId.replace("add_user_modal_", "");
      const userInput = interaction.fields.getTextInputValue("user_id");

      await interaction.deferReply({ ephemeral: true });

      // Extract user ID from mention or use as-is
      const userId = userInput.replace(/[<@!>]/g, "");

      try {
        // Verify user exists
        const user = await interaction.client.users.fetch(userId);

        const result = await this.ticketHandler.addUserToTicket(
          channelId,
          userId,
          interaction.user.id
        );

        if (result.success) {
          await interaction.editReply({
            content: `✅ Successfully added ${user} to the ticket.`,
          });
        } else {
          await interaction.editReply({
            content: `❌ ${result.message}`,
          });
        }
      } catch (error) {
        await interaction.editReply({
          content: "❌ Invalid user ID or user not found.",
        });
      }
      return;
    }

    // Remove User Modal
    if (customId.startsWith("remove_user_modal_")) {
      const channelId = customId.replace("remove_user_modal_", "");
      const userInput = interaction.fields.getTextInputValue("user_id");

      await interaction.deferReply({ ephemeral: true });

      // Extract user ID from mention or use as-is
      const userId = userInput.replace(/[<@!>]/g, "");

      try {
        // Verify user exists
        const user = await interaction.client.users.fetch(userId);

        const result = await this.ticketHandler.removeUserFromTicket(
          channelId,
          userId,
          interaction.user.id
        );

        if (result.success) {
          await interaction.editReply({
            content: `✅ Successfully removed ${user} from the ticket.`,
          });
        } else {
          await interaction.editReply({
            content: `❌ ${result.message}`,
          });
        }
      } catch (error) {
        await interaction.editReply({
          content: "❌ Invalid user ID or user not found.",
        });
      }
      return;
    }
  }
}
