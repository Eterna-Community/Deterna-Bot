import { bootstrap } from "..";
import type { IBoot } from "../interfaces/IBoot";
import type { Logger } from "../logger";
import { LoggerFactory } from "../logger/factory";
import { ServiceStatus, type ServiceConfig } from "./types";

export abstract class BaseService {
  public abstract readonly identifier: string;
  public abstract config: ServiceConfig;
  public abstract logger: Logger;

  // Private Fields
  private readonly bootstrap: IBoot;

  public status: ServiceStatus = ServiceStatus.DISABLED;
  public lastError: Error | null = null;
  public startTime: number | null = null;

  // Constructor
  constructor() {
    this.bootstrap = bootstrap;
  }

  // Getter
  public get serviceStatus(): ServiceStatus {
    return this.status;
  }

  public get uptime(): number {
    return this.startTime ? Date.now() - this.startTime : 0;
  }

  public get isHealthy(): boolean {
    return this.status === ServiceStatus.ENABLED && !this.lastError;
  }

  public async onEnableService(): Promise<void> {
    if (this.status !== ServiceStatus.DISABLED) {
      this.logger.warn(
        `The Service ${this.identifier} is either already started, or starting...`
      );
      this.lastError = new Error(
        `Service ${this.identifier} is already started`
      );
      return;
    }

    this.status = ServiceStatus.ENABLING;
    this.lastError = null;

    try {
      await this.withTimeout(
        this.onServiceEnable(),
        this.config.timeout ?? 10000,
        `Service ${this.identifier} enable timeout`
      );
    } catch (error) {
      this.status = ServiceStatus.ERROR;
      this.lastError =
        error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Error while enabling Service ${this.identifier}:`,
        this.lastError
      );
    } finally {
      this.status = ServiceStatus.ENABLED;
      this.startTime = Date.now();
    }
  }

  public async onDisableService(): Promise<void> {
    if (this.status === ServiceStatus.DISABLED) {
      this.logger.warn(
        `The Service ${this.identifier} is either already stopped, or stopping...`
      );
      this.lastError = new Error(
        `Service ${this.identifier} is already stopped`
      );
      return;
    }

    this.status = ServiceStatus.DISABLING;
    this.lastError = null;

    try {
      await this.withTimeout(
        this.onServiceDisable(),
        this.config.timeout ?? 10000,
        `Service ${this.identifier} disable timeout`
      );
    } catch (error) {
      this.status = ServiceStatus.ERROR;
      this.lastError =
        error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Error while disabling Service ${this.identifier}:`,
        this.lastError
      );
    } finally {
      this.status = ServiceStatus.DISABLED;
      this.startTime = null;
    }
  }

  public async healthCheck(): Promise<boolean> {
    if (this.status !== ServiceStatus.ENABLED) {
      return false;
    }

    try {
      return await this.withTimeout(
        this.onHealthCheck(),
        5000,
        `Health check timeout for ${this.identifier}`
      );
    } catch (error) {
      this.lastError =
        error instanceof Error ? error : new Error(String(error));
      this.logger.error("Health check failed:", this.lastError);
      return false;
    }
  }

  // Private Methods
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    message: string
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]);
  }

  // Abstract Methods
  protected abstract onServiceEnable(): Promise<void>;
  protected abstract onServiceDisable(): Promise<void>;
  protected abstract onHealthCheck(): Promise<boolean>;
}
