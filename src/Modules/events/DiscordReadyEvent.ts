import { bootstrap } from "../..";
import { BaseEvent } from "../../events/types";
import type { IBoot } from "../../interfaces/IBoot";
import type { Logger } from "../../logger";
import { LoggerFactory } from "../../logger/factory";
import { PerformanceMonitor } from "../../utils/performance";

@PerformanceMonitor()
export class EventReady extends BaseEvent<"ready"> {
  public readonly name = "ready";
  private bootstrap: IBoot = bootstrap;
  private logger: Logger = LoggerFactory.create("DiscordReadyEvent");

  public async execute(): Promise<void> {
    await this.bootstrap.getCommandManager().deployCommands();

    this.logger.info("Discord Bot is ready, and commands are deployed.");
  }
}
