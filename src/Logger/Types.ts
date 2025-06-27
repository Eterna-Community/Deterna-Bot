export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4,
}

export enum LogTarget {
  CONSOLE = "console",
  FILE = "file",
  DISCORD = "discord",
  DATABASE = "database",
}
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  prefix: string;
  message: string;
  data?: any;
  stack?: string;
}

export interface LoggerConfig {
  prefix: string;
  targets: LogTarget[];
  minLevel?: LogLevel;
  fileConfig?: FileLogConfig;
  discordConfig?: DiscordLogConfig;
  formatConfig?: FormatConfig;
}

export interface FileLogConfig {
  directory?: string;
  filename?: string;
  maxFileSize?: number; // MB
  maxFiles?: number;
  dateRotation?: boolean;
}

export interface DiscordLogConfig {
  webhookUrl: string;
  username?: string;
  avatar?: string;
  minLevel?: LogLevel;
}

export interface FormatConfig {
  colorized?: boolean;
  includeStack?: boolean;
  dateFormat?: string;
  timezone?: string;
}

export const Colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
};
