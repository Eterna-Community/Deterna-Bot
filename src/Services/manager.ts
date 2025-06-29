import type { BaseService } from ".";
import type { Logger } from "../logger";
import { LoggerFactory } from "../logger/factory";
import { LogTarget } from "../logger/types";
import {
  ServiceManagerEvents,
  ServiceStatus,
  type BatchOperationResult,
  type ServiceEvent,
  type ServiceManagerConfig,
  type ServiceOperationResult,
  type ServiceRegistrationResult,
} from "./types";

export class ServiceManager {
  private readonly services: Map<string, BaseService> = new Map();
  private readonly eventHandlers: Map<
    string,
    ((event: ServiceEvent) => void)[]
  > = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private readonly logger: Logger;
  private readonly config: ServiceManagerConfig;
  private isShuttingDown: boolean = false;

  constructor(config: Partial<ServiceManagerConfig> = {}) {
    this.logger = LoggerFactory.create("ServiceManager", [
      LogTarget.CONSOLE,
      LogTarget.FILE,
    ]);

    this.config = {
      healthCheckInterval: 30000,
      maxStartupRetries: 3,
      gracefulShutdownTimeout: 30000,
      ...config,
    };
  }

  public register(service: BaseService): ServiceRegistrationResult {
    try {
      this.validateServiceRegistration(service);
      this.services.set(service.identifier, service);

      this.logger.info(
        `Service "${service.identifier}" registered successfully!`
      );

      this.emitEvent(ServiceManagerEvents.SERVICE_REGISTERED, {
        serviceId: service.identifier,
        event: ServiceManagerEvents.SERVICE_REGISTERED,
        timestamp: Date.now(),
      });

      return { success: true, message: "Service registered successfully" };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to register service "${service.identifier}": ${errorMessage}`
      );
      return { success: false, message: errorMessage };
    }
  }

  public async start(): Promise<BatchOperationResult> {
    const startTime = Date.now();
    const sortedServices = this.getSortedServices();
    const results = await this.executeServiceBatch(sortedServices, (service) =>
      this.startSingleService(service)
    );

    this.startHealthChecks();

    const totalDuration = Date.now() - startTime;
    this.logger.info(
      `Startup completed: ${results.succeeded.length} succeeded, ${results.failed.length} failed in ${totalDuration}ms`
    );

    this.emitEvent(ServiceManagerEvents.BATCH_OPERATION_COMPLETED, {
      serviceId: "service-manager",
      event: ServiceManagerEvents.BATCH_OPERATION_COMPLETED,
      timestamp: Date.now(),
      data: { operation: "start", ...results },
    });

    return { ...results, totalDuration };
  }

  public async stop(): Promise<BatchOperationResult> {
    this.isShuttingDown = true;
    const startTime = Date.now();

    this.stopHealthChecks();

    const sortedServices = this.getSortedServices().reverse();
    const results = await this.executeServiceBatch(
      sortedServices,
      (service) => this.stopSingleService(service),
      this.config.gracefulShutdownTimeout
    );

    const totalDuration = Date.now() - startTime;
    this.logger.info(
      `Shutdown completed: ${results.succeeded.length} succeeded, ${results.failed.length} failed in ${totalDuration}ms`
    );

    return { ...results, totalDuration };
  }

  public async startService(identifier: string): Promise<void> {
    const service = this.getRequiredService(identifier);
    this.validateServiceDependencies(service);

    await this.startSingleService(service);
  }

  public async stopService(identifier: string): Promise<void> {
    const service = this.getRequiredService(identifier);
    this.validateServiceCanBeStopped(service);

    await this.stopSingleService(service);
  }

  public getService<T extends BaseService = BaseService>(
    identifier: string
  ): T | undefined {
    return this.services.get(identifier) as T;
  }

  public getServiceStatus(identifier: string): ServiceStatus | undefined {
    return this.getService(identifier)?.status;
  }

  public getServiceInfo(): Array<{
    identifier: string;
    status: ServiceStatus;
    uptime: number;
    isHealthy: boolean;
    lastError: string | null;
    dependencies: string[];
    priority: number;
  }> {
    return Array.from(this.services.values()).map((service) => ({
      identifier: service.identifier,
      status: service.status,
      uptime: service.uptime,
      isHealthy: service.isHealthy,
      lastError: service.lastError?.message ?? null,
      dependencies: service.config.dependencies,
      priority: service.config.priority,
    }));
  }

  public onEvent(
    eventType: ServiceManagerEvents | string,
    handler: (event: ServiceEvent) => void
  ): () => void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }
    this.eventHandlers.get(eventType)!.push(handler);

    // Return unsubscribe function
    return () => {
      const handlers = this.eventHandlers.get(eventType);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      }
    };
  }

  public async restart(delayMs = 1000): Promise<void> {
    await this.stop();
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    await this.start();
  }

  private validateServiceRegistration(service: BaseService): void {
    if (this.services.has(service.identifier)) {
      throw new Error(`Service "${service.identifier}" already registered!`);
    }

    for (const dep of service.config.dependencies) {
      if (!this.services.has(dep)) {
        throw new Error(
          `Service "${service.identifier}" depends on "${dep}" which doesn't exist!`
        );
      }
    }
  }

  private getRequiredService(identifier: string): BaseService {
    const service = this.services.get(identifier);
    if (!service) {
      throw new Error(`Service ${identifier} not found`);
    }
    return service;
  }

  private validateServiceDependencies(service: BaseService): void {
    for (const dep of service.config.dependencies) {
      const depService = this.services.get(dep);
      if (!depService || depService.status !== ServiceStatus.ENABLED) {
        throw new Error(
          `Dependency ${dep} is not running for service ${service.identifier}`
        );
      }
    }
  }

  private validateServiceCanBeStopped(service: BaseService): void {
    const dependentServices = Array.from(this.services.values()).filter(
      (s) =>
        s.config.dependencies.includes(service.identifier) &&
        s.status === ServiceStatus.ENABLED
    );

    if (dependentServices.length > 0) {
      const dependentNames = dependentServices
        .map((s) => s.identifier)
        .join(", ");
      throw new Error(
        `Cannot stop ${service.identifier}: Services ${dependentNames} depend on it`
      );
    }
  }

  private async startSingleService(
    service: BaseService
  ): Promise<ServiceOperationResult> {
    const startTime = Date.now();

    try {
      await service.onEnableService();
      const duration = Date.now() - startTime;

      this.emitEvent(ServiceManagerEvents.SERVICE_STARTED, {
        serviceId: service.identifier,
        event: ServiceManagerEvents.SERVICE_STARTED,
        timestamp: Date.now(),
        data: { duration },
      });

      this.logger.info(
        `Service "${service.identifier}" started successfully in ${duration}ms!`
      );

      return {
        identifier: service.identifier,
        success: true,
        duration,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const duration = Date.now() - startTime;

      this.logger.error(
        `Error while starting service "${service.identifier}": ${err.message}`
      );

      this.emitEvent(ServiceManagerEvents.SERVICE_ERROR, {
        serviceId: service.identifier,
        event: ServiceManagerEvents.SERVICE_ERROR,
        timestamp: Date.now(),
        data: { error: err.message, operation: "start" },
      });

      return {
        identifier: service.identifier,
        success: false,
        error: err,
        duration,
      };
    }
  }

  private async stopSingleService(
    service: BaseService
  ): Promise<ServiceOperationResult> {
    const startTime = Date.now();

    try {
      await service.onDisableService();
      const duration = Date.now() - startTime;

      this.emitEvent(ServiceManagerEvents.SERVICE_STOPPED, {
        serviceId: service.identifier,
        event: ServiceManagerEvents.SERVICE_STOPPED,
        timestamp: Date.now(),
        data: { duration },
      });

      return {
        identifier: service.identifier,
        success: true,
        duration,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const duration = Date.now() - startTime;

      this.emitEvent(ServiceManagerEvents.SERVICE_ERROR, {
        serviceId: service.identifier,
        event: ServiceManagerEvents.SERVICE_ERROR,
        timestamp: Date.now(),
        data: { error: err.message, operation: "stop" },
      });

      return {
        identifier: service.identifier,
        success: false,
        error: err,
        duration,
      };
    }
  }

  private async executeServiceBatch(
    services: BaseService[],
    operation: (service: BaseService) => Promise<ServiceOperationResult>,
    timeoutMs?: number
  ): Promise<{
    succeeded: ServiceOperationResult[];
    failed: ServiceOperationResult[];
  }> {
    const succeeded: ServiceOperationResult[] = [];
    const failed: ServiceOperationResult[] = [];

    for (const service of services) {
      if (this.isShuttingDown && timeoutMs) {
        const timeoutPromise = new Promise<ServiceOperationResult>(
          (_, reject) =>
            setTimeout(() => reject(new Error("Operation timeout")), timeoutMs)
        );

        try {
          const result = await Promise.race([
            operation(service),
            timeoutPromise,
          ]);
          if (result.success) {
            succeeded.push(result);
          } else {
            failed.push(result);
          }
        } catch (error) {
          failed.push({
            identifier: service.identifier,
            success: false,
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      } else {
        const result = await operation(service);
        if (result.success) {
          succeeded.push(result);
        } else {
          failed.push(result);
        }
      }
    }

    return { succeeded, failed };
  }

  private getSortedServices(): BaseService[] {
    const services = Array.from(this.services.values());
    const sorted: BaseService[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (service: BaseService) => {
      if (visiting.has(service.identifier)) {
        throw new Error(
          `Circular dependency detected involving ${service.identifier}`
        );
      }
      if (visited.has(service.identifier)) {
        return;
      }

      visiting.add(service.identifier);

      for (const dep of service.config.dependencies) {
        const depService = this.services.get(dep);
        if (depService) {
          visit(depService);
        }
      }

      visiting.delete(service.identifier);
      visited.add(service.identifier);
      sorted.push(service);
    };

    services
      .sort((a, b) => b.config.priority - a.config.priority)
      .forEach(visit);

    return sorted;
  }

  private startHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      if (this.isShuttingDown) return;

      for (const service of this.services.values()) {
        if (service.status === ServiceStatus.ENABLED) {
          try {
            const healthy = await service.healthCheck();
            if (!healthy) {
              this.handleUnhealthyService(service);
            }
          } catch (error) {
            this.logger.error(
              `Health check failed for ${service.identifier}: ${error}`
            );
            this.handleUnhealthyService(service);
          }
        }
      }
    }, this.config.healthCheckInterval);
  }

  private stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  private async handleUnhealthyService(service: BaseService): Promise<void> {
    this.emitEvent(ServiceManagerEvents.HEALTH_CHECK_FAILED, {
      serviceId: service.identifier,
      event: ServiceManagerEvents.HEALTH_CHECK_FAILED,
      timestamp: Date.now(),
    });

    if (service.config.restartOnError && !this.isShuttingDown) {
      this.logger.warn(`Attempting auto-restart of ${service.identifier}`);

      try {
        await service.onDisableService();
        await service.onEnableService();
        this.logger.info(`Auto-restart successful for ${service.identifier}`);
      } catch (error) {
        this.logger.error(
          `Auto-restart failed for ${service.identifier}: ${error}`
        );

        this.emitEvent(ServiceManagerEvents.SERVICE_ERROR, {
          serviceId: service.identifier,
          event: ServiceManagerEvents.SERVICE_ERROR,
          timestamp: Date.now(),
          data: { error: "Auto-restart failed", operation: "restart" },
        });
      }
    }
  }

  private emitEvent(
    eventType: ServiceManagerEvents | string,
    event: ServiceEvent
  ): void {
    // Emit für spezifischen Event Type
    const specificHandlers = this.eventHandlers.get(eventType) || [];
    // Emit für alle Events (falls jemand alle Events hören will)
    const allHandlers = this.eventHandlers.get("*") || [];

    [...specificHandlers, ...allHandlers].forEach((handler) => {
      try {
        handler(event);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.logger.error("Event handler error:", err);
      }
    });
  }
}
