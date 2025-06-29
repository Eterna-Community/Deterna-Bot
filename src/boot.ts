import { CustomClient } from "./client";
import { CommandManager } from "./commands/CommandManager";
import { config } from "./config";
import { EventManager } from "./events/EventManager";
import type { IBoot } from "./interfaces/IBoot";
import type { IClient } from "./interfaces/IClient";
import type { Logger } from "./logger";
import { LoggerFactory } from "./logger/factory";
import { TicketService } from "./modules/ticket/TicketService";
import { DatabaseService } from "./services/database";
import {
  GitHubWebhookService,
  type GitHubWebhookConfig,
} from "./services/github";
import { ServiceManager } from "./services/manager";
import { PerformanceMonitor } from "./utils/performance";

const githubWebhookConfig: GitHubWebhookConfig = {
  port: 3000,
  webhookSecret: process.env.GITHUB_WEBHOOK_SECRET!, // Aus .env
  channelId: "1388974166740566168", // Discord Channel ID
  allowedEvents: ["push", "pull_request", "issues", "release", "star"],
  timeout: 15000,
  priority: 1000,
  dependencies: [],
  restartOnError: true,
};

@PerformanceMonitor()
export class Bootstrap implements IBoot {
  private customClient: IClient | null = null;
  private serviceManager: ServiceManager | null = null;
  private commandManager: CommandManager | null = null;
  private eventManager: EventManager | null = null;

  private logger: Logger = LoggerFactory.create("Bootstrap");

  public async onEnable(): Promise<void> {
    this.customClient = new CustomClient();
    await this.customClient.start();
    this.logger.info("Started the Client...");
    this.serviceManager = new ServiceManager();
    this.logger.info("Started the ServiceManager...");
    this.commandManager = new CommandManager();
    this.logger.info("Started the CommandManager...");
    this.eventManager = new EventManager(this.customClient.getClient());
    this.logger.info("Started the EventManager...");
    await this.registerService();
    await this.commandManager.loadCommands();
    await this.eventManager.loadEvents();

    await this.getClient().client?.login(config.token);
  }

  public async onDisable(): Promise<void> {}

  public getClient(): IClient {
    if (!this.customClient) throw new Error("Client not initialized");
    return this.customClient;
  }

  public getServiceManager(): ServiceManager {
    if (!this.serviceManager) throw new Error("ServiceManager not initialized");
    return this.serviceManager;
  }

  public getEventManager(): EventManager {
    if (!this.eventManager) throw new Error("EventManager not initialized");
    return this.eventManager;
  }

  public getCommandManager(): CommandManager {
    if (!this.commandManager) throw new Error("CommandManager not initialized");
    return this.commandManager;
  }

  public async registerService(): Promise<void> {
    const promises = [
      // this.serviceManager?.register(new DatabaseService()),
      this.serviceManager?.register(new TicketService()),
      this.serviceManager?.register(
        new GitHubWebhookService(
          this.getClient().getClient(),
          githubWebhookConfig
        )
      ),
    ];

    await Promise.allSettled(promises);
    this.logger.info("Services registered");
  }
}
