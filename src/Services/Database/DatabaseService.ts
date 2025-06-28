import { BaseService } from "..";
import type { ServiceConfig } from "../data";
import type { Logger } from "../../Logger/Index";
import { LoggerFactory } from "../../Logger/LoggerFactory";
import { PerformanceMonitor } from "../../Utils/Performance";
import { PrismaClient } from "../../../prisma/generated/prisma";

@PerformanceMonitor()
export class DatabaseService extends BaseService {
  public readonly serviceIdentifier: string = "database";
  public readonly config: ServiceConfig = {
    priority: 1000,
    dependencies: [],
    timeout: 1000,
    restartOnError: true,
  };

  private prisma: PrismaClient;
  private logger: Logger = LoggerFactory.create("DatabaseService");

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
    return await this.prisma.$transaction(fn);
  }
}
