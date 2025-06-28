import {
  GuildMember,
  TextChannel,
  User,
  type ChatInputCommandInteraction,
} from "discord.js";
import { BaseCommand, Command } from "../../Interfaces/ICommand";
import type { Logger } from "../../Logger/Index";
import { LoggerFactory } from "../../Logger/LoggerFactory";
import { LogTarget } from "../../Logger/Types";

@Command({
  name: "ping",
  description: "See what happens",
  options: [],
  permissions: [],
  guildOnly: true,
})
export class PingCommand extends BaseCommand {
  private logger: Logger = LoggerFactory.create("PingCommand", [
    LogTarget.CONSOLE,
    LogTarget.FILE,
  ]);

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const member = interaction.member as GuildMember;

    if (member && interaction.guild) {
      try {
        await member.timeout(
          10000,
          "Ping, now you have been timed out for 10 seconds!"
        );
        await this.reply(interaction, "You are now Muted for 10 seconds!");
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        if (err.message === "Missing Permissions") {
          await this.reply(
            interaction,
            "I dont have the Power to mute u.. Give me some time and we will get u...",
            true
          );
          return;
        }
        await this.reply(interaction, "Du hast keine Rechte darauf!", true);
        this.logger.error(`Error during timeout: ${err.message}`, err);
      }
    } else {
      await this.reply(
        interaction,
        "This Command only works on the Eterna Discord!"
      );
    }
  }
}
