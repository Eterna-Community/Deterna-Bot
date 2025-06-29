import {
  LogLevel,
  type DiscordLogConfig,
  type FileLogConfig,
  type FormatConfig,
} from "./types";

export class LoggerUtils {
  public static createFileConfig(
    options: Partial<FileLogConfig> = {}
  ): FileLogConfig {
    return {
      directory: "./logs",
      filename: `app_${new Date().toISOString().split("T")[0]}.log`,
      maxFileSize: 50, // 50MB
      maxFiles: 5,
      dateRotation: true,
      ...options,
    };
  }

  public static createDiscordConfig(
    webhookUrl: string,
    options: Partial<DiscordLogConfig> = {}
  ): DiscordLogConfig {
    return {
      webhookUrl,
      username: "Application Logger",
      minLevel: LogLevel.WARN,
      ...options,
    };
  }

  public static createFormatConfig(
    options: Partial<FormatConfig> = {}
  ): FormatConfig {
    return {
      colorized: true,
      includeStack: false,
      dateFormat: "de-DE",
      timezone: "Europe/Berlin",
      ...options,
    };
  }
}
