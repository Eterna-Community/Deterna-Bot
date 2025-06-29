import { BaseService } from "..";
import { PrismaClient } from "../../../prisma/generated/prisma";
import type { Logger } from "../../logger";
import { LoggerFactory } from "../../logger/factory";
import { PerformanceMonitor } from "../../utils/performance";
import type { ServiceConfig } from "../types";

@PerformanceMonitor()
export class DatabaseService extends BaseService {
  public readonly identifier: string = "database";
  public readonly config: ServiceConfig = {
    priority: 1000,
    dependencies: [],
    timeout: 1000,
    restartOnError: true,
  };

  private prisma: PrismaClient;
  public logger: Logger = LoggerFactory.create("DatabaseService");

  constructor() {
    super();
    this.prisma = new PrismaClient({
      log: ["error"],
    });
  }

  public async onServiceEnable(): Promise<void> {
    try {
      await this.prisma.$connect();
      this.logger.info("Database connection established");
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error("Failed to connect to database:", err);
      throw error;
    }
  }

  public async onServiceDisable(): Promise<void> {
    try {
      await this.prisma.$disconnect();
      this.logger.info("Database connection closed");
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error("Error closing database connection:", err);
    }
  }

  public async onHealthCheck(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error("Database health check failed:", err);
      return false;
    }
  }

  public getPrismaClient(): PrismaClient {
    return this.prisma;
  }

  public async executeInTransaction<T>(
    fn: (prisma: PrismaClient) => Promise<T>
  ): Promise<T> {
    ///@ts-expect-error
    return await this.prisma.$transaction(fn);
  }
}
