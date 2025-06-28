import type {
  ChatInputCommandInteraction,
  GuildMember,
  User,
} from "discord.js";
import { BaseCommand, Command } from "../../Interfaces/ICommand";
import type { Logger } from "../../Logger/Index";
import { LoggerFactory } from "../../Logger/LoggerFactory";

@Command({
  name: "timeout",
  description: "Timeout an user",
  options: [
    {
      name: "user",
      description: "The user to timeout",
      type: "user",
      required: true,
    },
    {
      name: "duration",
      description: "The duration of the timeout in seconds",
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
  permissions: ["KickMembers"],
  guildOnly: true,
})
export class TimeoutCommand extends BaseCommand {
  private readonly logger: Logger = LoggerFactory.create("TimeoutCommand");

  public async execute(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const user = interaction.options.getUser("user");
    const duration = interaction.options.getInteger("duration");
    const reason = interaction.options.getString("reason");

    if (duration === null) {
      await this.reply(interaction, "Duration was not found.", true);
      return;
    }

    if (user === null) {
      await this.reply(interaction, "User was not found.", true);
      return;
    }

    const guildUser = interaction.guild?.members.resolve(user) as GuildMember;

    if (guildUser === null) {
      await this.reply(interaction, "User was not found.", true);
      return;
    }

    try {
      await guildUser.timeout(
        duration * 1000,
        reason ? reason : "Timeout by Deterna Bot"
      );
      await this.reply(
        interaction,
        `User ${user.displayName} has been timed out for ${duration} seconds.`
      );

      // TODO: When Timeout is Successfull, add this User to the Database with Timeout Data
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      await this.reply(interaction, "User could not be timed out.", true);
      this.logger.error(`Error during timeout: ${err.message}`, err);
    }
  }
}
