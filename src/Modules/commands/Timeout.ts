import type {
  ChatInputApplicationCommandData,
  ChatInputCommandInteraction,
  CommandInteraction,
} from "discord.js";
import { Command } from "../../commands/CommandDecorator";
import { BaseCommand } from "../../commands/types";
import type { Logger } from "../../logger";
import { LoggerFactory } from "../../logger/factory";

@Command({
  name: "timeout",
  description: "Timeout a user",
  options: [
    {
      name: "user",
      description: "The user to timeout",
      type: "user",
      required: true,
    },
    {
      name: "duration",
      description: "The duration of the timeout",
      type: "integer",
      required: true,
    },
    {
      name: "reason",
      description: "The reason for the timeout",
      type: "string",
      required: false,
    },
  ],
})
export class TimeoutCommand extends BaseCommand {
  private logger: Logger = LoggerFactory.create("TimeoutCommand");

  public override async execute(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const user = interaction.options.getUser("user", true);
    const duration = interaction.options.getInteger("duration", true);
    const reason =
      interaction.options.getString("reason") || "No reason provided";

    if (!user || !duration) {
      this.logger.error("User or duration not found");
      return;
    }

    const guildUser = interaction.guild?.members.resolve(user.id);

    if (!guildUser) {
      this.logger.error("Guild user not found");
      return;
    }

    try {
      await guildUser.timeout(duration, reason);

      this.reply(interaction, `User ${user.displayName} has been timed out.`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error("Error executing command:", err);
    }
  }
}
