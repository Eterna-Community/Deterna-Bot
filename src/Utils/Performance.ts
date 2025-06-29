import type { Logger } from "../logger";
import { LoggerFactory } from "../logger/factory";
import { LogTarget } from "../logger/types";

let logger: Logger = LoggerFactory.create("Performance", [
  LogTarget.FILE,
  LogTarget.CONSOLE,
]);

export interface PerformanceConfig {
  enabled?: boolean;
  logToConsole?: boolean;
  minThreshold?: number;
  includeArguments?: boolean;
  includeReturnValue?: boolean;
  customLogger?: (info: PerformanceInfo) => void;
  excludeMethods?: string[];
  colorize?: boolean;
}

export interface PerformanceInfo {
  className: string;
  methodName: string;
  executionTime: number;
  arguments?: any[];
  returnValue?: any;
  timestamp: string;
  isAsync: boolean;
}

const Colors = {
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

function formatTimestamp(): string {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  }).format(new Date());
}

function getColorByTime(ms: number, colorize: boolean = true): string {
  if (!colorize) return "";

  if (ms < 1) return Colors.green;
  if (ms < 10) return Colors.cyan;
  if (ms < 50) return Colors.yellow;
  if (ms < 200) return Colors.magenta;
  return Colors.red;
}

function defaultLogger(info: PerformanceInfo, config: PerformanceConfig): void {
  const color = getColorByTime(info.executionTime, config.colorize);
  const reset = config.colorize ? Colors.reset : "";
  const bright = config.colorize ? Colors.bright : "";
  const dim = config.colorize ? Colors.dim : "";

  let logMessage = `${dim}🕐 [${info.timestamp}]${reset} `;
  logMessage += `${bright}${info.className}.${info.methodName}()${reset} `;
  logMessage += `${color}⚡ ${info.executionTime.toFixed(2)}ms${reset}`;

  if (info.isAsync) {
    logMessage += ` ${dim}(async)${reset}`;
  }

  logger.info(logMessage);

  if (config.includeArguments && info.arguments && info.arguments.length > 0) {
    logger.info(`${dim}  ↳ Args:${reset}`, info.arguments);
  }

  if (config.includeReturnValue && info.returnValue !== undefined) {
    logger.info(`${dim}  ↳ Return:${reset}`, info.returnValue);
  }
}

function logPerformance(
  info: PerformanceInfo,
  config: PerformanceConfig
): void {
  if (info.executionTime < (config.minThreshold || 0)) {
    return;
  }

  if (config.customLogger) {
    config.customLogger(info);
  } else if (config.logToConsole) {
    defaultLogger(info, config);
  }
}

function createPerformanceWrapper(
  originalMethod: Function,
  className: string,
  methodName: string,
  config: PerformanceConfig
) {
  return function (this: any, ...args: any[]) {
    const startTime = performance.now();

    try {
      const result = originalMethod.apply(this, args);

      if (result && typeof result.then === "function") {
        return result
          .then((value: any) => {
            const endTime = performance.now();
            const executionTime = endTime - startTime;

            logPerformance(
              {
                className,
                methodName,
                executionTime,
                arguments: config.includeArguments ? args : undefined,
                returnValue: config.includeReturnValue ? value : undefined,
                timestamp: formatTimestamp(),
                isAsync: true,
              },
              config
            );

            return value;
          })
          .catch((error: any) => {
            const endTime = performance.now();
            const executionTime = endTime - startTime;

            logPerformance(
              {
                className,
                methodName,
                executionTime,
                arguments: config.includeArguments ? args : undefined,
                returnValue: config.includeReturnValue
                  ? `❌ Error: ${error.message}`
                  : undefined,
                timestamp: formatTimestamp(),
                isAsync: true,
              },
              config
            );

            throw error;
          });
      } else {
        const endTime = performance.now();
        const executionTime = endTime - startTime;

        logPerformance(
          {
            className,
            methodName,
            executionTime,
            arguments: config.includeArguments ? args : undefined,
            returnValue: config.includeReturnValue ? result : undefined,
            timestamp: formatTimestamp(),
            isAsync: false,
          },
          config
        );

        return result;
      }
    } catch (error) {
      const endTime = performance.now();
      const executionTime = endTime - startTime;

      logPerformance(
        {
          className,
          methodName,
          executionTime,
          arguments: config.includeArguments ? args : undefined,
          returnValue: config.includeReturnValue
            ? `❌ Error: ${(error as Error).message}`
            : undefined,
          timestamp: formatTimestamp(),
          isAsync: false,
        },
        config
      );

      throw error;
    }
  };
}

export function PerformanceMonitor(config: PerformanceConfig = {}) {
  const defaultConfig: PerformanceConfig = {
    enabled: true,
    logToConsole: true,
    minThreshold: 0,
    includeArguments: false,
    includeReturnValue: false,
    excludeMethods: ["constructor"],
    colorize: true,
    ...config,
  };

  return function <T extends { new (...args: any[]): {} }>(constructor: T) {
    if (!defaultConfig.enabled) {
      return constructor;
    }

    const className = constructor.name;
    const prototype = constructor.prototype;

    Object.getOwnPropertyNames(prototype).forEach((methodName) => {
      if (
        methodName === "constructor" ||
        defaultConfig.excludeMethods?.includes(methodName)
      ) {
        return;
      }

      const descriptor = Object.getOwnPropertyDescriptor(prototype, methodName);

      if (
        descriptor &&
        typeof descriptor.value === "function" &&
        descriptor.configurable
      ) {
        const originalMethod = descriptor.value;

        descriptor.value = createPerformanceWrapper(
          originalMethod,
          className,
          methodName,
          defaultConfig
        );

        Object.defineProperty(prototype, methodName, descriptor);
      }
    });

    return constructor;
  };
}

export function PerformanceMonitorAdvanced(config: PerformanceConfig = {}) {
  const defaultConfig: PerformanceConfig = {
    enabled: true,
    logToConsole: true,
    minThreshold: 0,
    includeArguments: false,
    includeReturnValue: false,
    excludeMethods: ["constructor"],
    colorize: true,
    ...config,
  };

  return function <T extends { new (...args: any[]): {} }>(constructor: T) {
    if (!defaultConfig.enabled) {
      return constructor;
    }

    const className = constructor.name;

    function wrapPrototypeMethods(proto: any, depth: number = 0) {
      if (!proto || proto === Object.prototype || depth > 10) {
        return;
      }

      Object.getOwnPropertyNames(proto).forEach((methodName) => {
        if (
          methodName === "constructor" ||
          defaultConfig.excludeMethods?.includes(methodName)
        ) {
          return;
        }

        const descriptor = Object.getOwnPropertyDescriptor(proto, methodName);

        if (
          descriptor &&
          typeof descriptor.value === "function" &&
          descriptor.configurable &&
          !descriptor.value._isWrapped
        ) {
          const originalMethod = descriptor.value;
          const wrappedMethod = createPerformanceWrapper(
            originalMethod,
            className,
            methodName,
            defaultConfig
          );

          ///@ts-expect-error
          wrappedMethod._isWrapped = true;

          descriptor.value = wrappedMethod;
          Object.defineProperty(proto, methodName, descriptor);
        }
      });

      wrapPrototypeMethods(Object.getPrototypeOf(proto), depth + 1);
    }

    wrapPrototypeMethods(constructor.prototype);

    return constructor;
  };
}

export function MeasurePerformance(config: Partial<PerformanceConfig> = {}) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const className = target.constructor.name;

    const methodConfig: PerformanceConfig = {
      enabled: true,
      logToConsole: true,
      minThreshold: 0,
      includeArguments: false,
      includeReturnValue: false,
      colorize: true,
      ...config,
    };

    if (!methodConfig.enabled) {
      return descriptor;
    }

    descriptor.value = createPerformanceWrapper(
      originalMethod,
      className,
      propertyKey,
      methodConfig
    );

    return descriptor;
  };
}

export class PerformanceStats {
  private static stats: Map<
    string,
    {
      totalCalls: number;
      totalTime: number;
      minTime: number;
      maxTime: number;
      avgTime: number;
      lastCalled: string;
      recentTimes: number[];
    }
  > = new Map();

  static record(
    className: string,
    methodName: string,
    executionTime: number
  ): void {
    const key = `${className}.${methodName}`;
    const existing = this.stats.get(key);

    if (existing) {
      existing.totalCalls++;
      existing.totalTime += executionTime;
      existing.minTime = Math.min(existing.minTime, executionTime);
      existing.maxTime = Math.max(existing.maxTime, executionTime);
      existing.avgTime = existing.totalTime / existing.totalCalls;
      existing.lastCalled = formatTimestamp();

      existing.recentTimes.push(executionTime);
      if (existing.recentTimes.length > 10) {
        existing.recentTimes.shift();
      }
    } else {
      this.stats.set(key, {
        totalCalls: 1,
        totalTime: executionTime,
        minTime: executionTime,
        maxTime: executionTime,
        avgTime: executionTime,
        lastCalled: formatTimestamp(),
        recentTimes: [executionTime],
      });
    }
  }

  static printStats(): void {
    logger.info("\n📊 Performance Statistics:");
    logger.info("═".repeat(80));

    const sortedStats = Array.from(this.stats.entries()).sort(
      ([, a], [, b]) => b.totalTime - a.totalTime
    );

    for (const [method, stats] of sortedStats) {
      const color = getColorByTime(stats.avgTime);
      const trend = this.getTrend(stats.recentTimes);

      logger.info(`${Colors.bright}${method}:${Colors.reset}`);
      logger.info(
        `  📞 Calls: ${
          stats.totalCalls
        } | 📊 Avg: ${color}${stats.avgTime.toFixed(2)}ms${
          Colors.reset
        } ${trend}`
      );
      logger.info(
        `  ⚡ Min: ${stats.minTime.toFixed(
          2
        )}ms | 🔥 Max: ${stats.maxTime.toFixed(
          2
        )}ms | ⏱️ Total: ${stats.totalTime.toFixed(2)}ms`
      );
      logger.info(`  🕐 Last: ${stats.lastCalled}`);
      logger.info("");
    }
  }

  private static getTrend(recentTimes: number[]): string {
    if (recentTimes.length < 3) return "";

    const recent = recentTimes.slice(-3);
    const earlier = recentTimes.slice(-6, -3);

    if (earlier.length === 0) return "";

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const earlierAvg = earlier.reduce((a, b) => a + b, 0) / earlier.length;

    if (recentAvg > earlierAvg * 1.2) return "📈"; // Wird langsamer
    if (recentAvg < earlierAvg * 0.8) return "📉"; // Wird schneller
    return "➡️"; // Stabil
  }

  static reset(): void {
    this.stats.clear();
  }

  static getStats(): Map<string, any> {
    return new Map(this.stats);
  }
}

// Class Decorator mit automatischen Statistiken
export function PerformanceMonitorWithStats(config: PerformanceConfig = {}) {
  const enhancedConfig = {
    ...config,
    customLogger: (info: PerformanceInfo) => {
      // Statistiken sammeln
      PerformanceStats.record(
        info.className,
        info.methodName,
        info.executionTime
      );

      // Standard-Logging
      if (config.logToConsole !== false) {
        defaultLogger(info, config);
      }

      // Custom Logger aufrufen falls vorhanden
      if (config.customLogger) {
        config.customLogger(info);
      }
    },
  };

  return PerformanceMonitor(enhancedConfig);
}
