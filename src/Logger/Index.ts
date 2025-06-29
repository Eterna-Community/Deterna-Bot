import {
  Colors,
  LogLevel,
  LogTarget,
  type LogEntry,
  type LoggerConfig,
} from "./types";
import fs from "node:fs";
import path from "node:path";

export class Logger {
  private config: LoggerConfig;
  private fileStream?: fs.WriteStream;

  constructor(config: LoggerConfig) {
    this.config = {
      minLevel: LogLevel.INFO,
      formatConfig: {
        colorized: true,
        includeStack: true,
        dateFormat: "de-DE",
        timezone: "Europe/Berlin",
      },
      ...config,
    };

    this.initializeTargets();
  }

  private initializeTargets(): void {
    if (this.config.targets.includes(LogTarget.FILE)) {
      this.initializeFileLogging();
    }
  }

  private initializeFileLogging(): void {
    const fileConfig = this.config.fileConfig || {};
    const logDir = fileConfig.directory || "./logs";

    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const filename =
      fileConfig.filename ||
      `${this.config.prefix.toLowerCase()}_${
        new Date().toISOString().split("T")[0]
      }.log`;

    const filePath = path.join(logDir, filename);

    this.fileStream = fs.createWriteStream(filePath, { flags: "a" });

    if (fileConfig.maxFileSize) {
      this.checkFileRotation(filePath, fileConfig.maxFileSize);
    }
  }

  private checkFileRotation(filePath: string, maxSizeMB: number): void {
    try {
      const stats = fs.statSync(filePath);
      const fileSizeMB = stats.size / (1024 * 1024);

      if (fileSizeMB > maxSizeMB) {
        this.rotateLogFile(filePath);
      }
    } catch (error) {
      console.error("The file does not exist:", error);
    }
  }

  private rotateLogFile(filePath: string): void {
    this.fileStream?.end();

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const rotatedPath = filePath.replace(".log", `_${timestamp}.log`);

    fs.renameSync(filePath, rotatedPath);

    this.fileStream = fs.createWriteStream(filePath, { flags: "a" });
  }

  private formatTimestamp(): string {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat(
      this.config.formatConfig?.dateFormat || "de-DE",
      {
        timeZone: this.config.formatConfig?.timezone || "Europe/Berlin",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        fractionalSecondDigits: 3,
      }
    );

    return formatter.format(now);
  }

  private getLevelString(level: LogLevel): string {
    return LogLevel[level].padEnd(5);
  }

  private getLevelColor(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG:
        return Colors.gray;
      case LogLevel.INFO:
        return Colors.cyan;
      case LogLevel.WARN:
        return Colors.yellow;
      case LogLevel.ERROR:
        return Colors.red;
      case LogLevel.FATAL:
        return Colors.magenta;
      default:
        return Colors.white;
    }
  }

  private formatMessage(entry: LogEntry, colorized: boolean = false): string {
    const timestamp = entry.timestamp;
    const level = this.getLevelString(entry.level);
    const prefix = `[${entry.prefix}]`;

    if (colorized && this.config.formatConfig?.colorized !== false) {
      const levelColor = this.getLevelColor(entry.level);
      const prefixColor = Colors.bright + Colors.blue;
      const timestampColor = Colors.gray;

      return `${timestampColor}${timestamp}${Colors.reset} ${levelColor}${level}${Colors.reset} ${prefixColor}${prefix}${Colors.reset} ${entry.message}`;
    }

    return `${timestamp} ${level} ${prefix} ${entry.message}`;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= (this.config.minLevel || LogLevel.INFO);
  }

  private async logToTargets(entry: LogEntry): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const target of this.config.targets) {
      switch (target) {
        case LogTarget.CONSOLE:
          promises.push(this.logToConsole(entry));
          break;
        case LogTarget.FILE:
          promises.push(this.logToFile(entry));
          break;
        case LogTarget.DISCORD:
          promises.push(this.logToDiscord(entry));
          break;
        case LogTarget.DATABASE:
          promises.push(this.logToDatabase(entry));
          break;
      }
    }

    await Promise.allSettled(promises);
  }

  private async logToConsole(entry: LogEntry): Promise<void> {
    const message = this.formatMessage(entry, true);

    if (entry.level >= LogLevel.ERROR) {
      console.error(message);
    } else if (entry.level >= LogLevel.WARN) {
      console.warn(message);
    } else {
      console.log(message);
    }

    if (entry.data) {
      console.log("Data:", entry.data);
    }

    if (entry.stack && this.config.formatConfig?.includeStack) {
      console.log("Stack:", entry.stack);
    }
  }

  private async logToFile(entry: LogEntry): Promise<void> {
    if (!this.fileStream) return;

    const message = this.formatMessage(entry, false);
    let logLine = message + "\n";

    if (entry.data) {
      logLine += `Data: ${JSON.stringify(entry.data, null, 2)}\n`;
    }

    if (entry.stack && this.config.formatConfig?.includeStack) {
      logLine += `Stack: ${entry.stack}\n`;
    }

    return new Promise((resolve, reject) => {
      this.fileStream!.write(logLine, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  private async logToDiscord(entry: LogEntry): Promise<void> {
    if (!this.config.discordConfig) return;

    const discordMinLevel = this.config.discordConfig.minLevel || LogLevel.WARN;
    if (entry.level < discordMinLevel) return;

    const embed = {
      title: `${this.getLevelString(entry.level)} - ${entry.prefix}`,
      description: entry.message,
      color: this.getDiscordColor(entry.level),
      timestamp: new Date().toISOString(),
      fields: [] as { name: string; value: string; inline: boolean }[],
    };

    if (entry.data) {
      embed.fields.push({
        name: "Data",
        value:
          "```json\n" +
          JSON.stringify(entry.data, null, 2).substring(0, 1000) +
          "\n```",
        inline: false,
      });
    }

    const payload = {
      username: this.config.discordConfig.username || "Logger",
      avatar_url: this.config.discordConfig.avatar,
      embeds: [embed],
    };

    try {
      const response = await fetch(this.config.discordConfig.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Discord webhook failed: ${response.status}`);
      }
    } catch (error) {
      console.error("Failed to send Discord log:", error);
    }
  }

  private getDiscordColor(level: LogLevel): number {
    switch (level) {
      case LogLevel.DEBUG:
        return 0x808080; // Gray
      case LogLevel.INFO:
        return 0x00ffff; // Cyan
      case LogLevel.WARN:
        return 0xffff00; // Yellow
      case LogLevel.ERROR:
        return 0xff0000; // Red
      case LogLevel.FATAL:
        return 0xff00ff; // Magenta
      default:
        return 0xffffff; // White
    }
  }

  private async logToDatabase(entry: LogEntry): Promise<void> {
    console.log("Database logging not implemented yet");
  }

  private createLogEntry(
    level: LogLevel,
    message: string,
    data?: any,
    error?: Error
  ): LogEntry {
    return {
      timestamp: this.formatTimestamp(),
      level,
      prefix: this.config.prefix,
      message,
      data,
      stack: error?.stack,
    };
  }

  public debug(message: string, data?: any): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;
    const entry = this.createLogEntry(LogLevel.DEBUG, message, data);
    this.logToTargets(entry);
  }

  public info(message: string, data?: any): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    const entry = this.createLogEntry(LogLevel.INFO, message, data);
    this.logToTargets(entry);
  }

  public warn(message: string, data?: any): void {
    if (!this.shouldLog(LogLevel.WARN)) return;
    const entry = this.createLogEntry(LogLevel.WARN, message, data);
    this.logToTargets(entry);
  }

  public error(message: string, error?: Error, data?: any): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;
    const entry = this.createLogEntry(LogLevel.ERROR, message, data, error);
    this.logToTargets(entry);
  }

  public fatal(message: string, error?: Error, data?: any): void {
    if (!this.shouldLog(LogLevel.FATAL)) return;
    const entry = this.createLogEntry(LogLevel.FATAL, message, data, error);
    this.logToTargets(entry);
  }

  public log(
    level: LogLevel,
    message: string,
    data?: any,
    error?: Error
  ): void {
    if (!this.shouldLog(level)) return;
    const entry = this.createLogEntry(level, message, data, error);
    this.logToTargets(entry);
  }

  public close(): void {
    if (this.fileStream) {
      this.fileStream.end();
    }
  }
}
