import { Logger } from ".";
import { LogLevel, LogTarget, type LoggerConfig } from "./types";

export class LoggerFactory {
  private static instances: Map<string, Logger> = new Map();
  private static defaultConfig: Partial<LoggerConfig> = {
    targets: [LogTarget.CONSOLE],
    minLevel: LogLevel.INFO,
    formatConfig: {
      colorized: true,
      includeStack: true,
      dateFormat: "de-DE",
      timezone: "Europe/Berlin",
    },
  };

  public static setDefaultConfig(config: Partial<LoggerConfig>): void {
    this.defaultConfig = { ...this.defaultConfig, ...config };
  }

  public static create(
    prefix: string,
    targets?: LogTarget[],
    config?: Partial<LoggerConfig>
  ): Logger {
    const key = `${prefix}_${targets?.join("_") || "default"}`;

    if (this.instances.has(key)) {
      return this.instances.get(key)!;
    }

    const loggerConfig: LoggerConfig = {
      ...this.defaultConfig,
      ...config,
      prefix,
      targets: targets || this.defaultConfig.targets || [LogTarget.CONSOLE],
    };

    const logger = new Logger(loggerConfig);
    this.instances.set(key, logger);

    return logger;
  }

  public static get(prefix: string): Logger | undefined {
    for (const [key, logger] of this.instances) {
      if (key.startsWith(prefix + "_")) {
        return logger;
      }
    }
    return undefined;
  }

  public static closeAll(): void {
    for (const logger of this.instances.values()) {
      logger.close();
    }
    this.instances.clear();
  }

  public static getInstances(): string[] {
    return Array.from(this.instances.keys());
  }
}
