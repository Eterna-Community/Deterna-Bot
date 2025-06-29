export enum ServiceStatus {
  DISABLED = "disabled",
  ENABLING = "enabling",
  ENABLED = "enabled",
  DISABLING = "disabling",
  ERROR = "error",
}

export interface ServiceConfig {
  /**
   * Priority of the service
   */
  readonly priority: number;
  /**
   * Dependencies of the service
   */
  readonly dependencies: string[];
  /**
   * Timeout of the service
   */
  readonly timeout: number;
  /**
   * Restart the service on error
   */
  readonly restartOnError: boolean;
}

/**
 * Events that can be emitted by the ServiceManager
 */
export enum ServiceManagerEvents {
  SERVICE_REGISTERED = "service_registered",
  SERVICE_STARTED = "service_started",
  SERVICE_STOPPED = "service_stopped",
  SERVICE_ERROR = "service_error",
  HEALTH_CHECK_FAILED = "health_check_failed",
  BATCH_OPERATION_COMPLETED = "batch_operation_completed",
}

/**
 * Event that is emitted by the ServiceManager
 */
export interface ServiceEvent {
  serviceId: string;
  event: ServiceManagerEvents;
  timestamp: number;
  data?: any;
}

// Service Manager types
export interface ServiceManagerConfig {
  healthCheckInterval: number;
  gracefulShutdownTimeout: number;
  maxStartupRetries: number;
}

export interface ServiceRegistrationResult {
  success: boolean;
  message: string;
}

export interface ServiceOperationResult {
  identifier: string;
  success: boolean;
  error?: Error;
  duration?: number;
}

export interface BatchOperationResult {
  succeeded: ServiceOperationResult[];
  failed: ServiceOperationResult[];
  totalDuration: number;
}
