/**
 * Structured Logging System
 * 
 * Provides consistent, parseable logs for:
 * - Payment lifecycle tracking
 * - Request tracing
 * - Performance monitoring
 * - Error investigation
 * 
 * WHY: Production systems need:
 * - Correlation IDs for request tracing
 * - Structured JSON for log aggregation
 * - Consistent log format
 * - Performance metrics
 */

export interface LogContext {
  requestId?: string;
  orderId?: string;
  orderNumber?: string;
  userId?: string;
  provider?: string;
  operation: string;
  durationMs?: number;
  [key: string]: unknown;
}

export interface StructuredLog {
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  service: string;
  operation: string;
  message: string;
  context: LogContext;
  metadata?: Record<string, unknown>;
}

/**
 * Generate correlation ID for request tracing
 */
export function generateCorrelationId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Create structured log entry
 */
function createLog(
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR',
  message: string,
  context: LogContext,
  metadata?: Record<string, unknown>
): StructuredLog {
  return {
    timestamp: new Date().toISOString(),
    level,
    service: 'tykhai-payment',
    operation: context.operation,
    message,
    context,
    metadata,
  };
}

/**
 * Format log for output (JSON in production, pretty in dev)
 */
function formatLog(log: StructuredLog): string {
  if (process.env.NODE_ENV === 'production') {
    return JSON.stringify(log);
  }
  
  // Pretty format for development
  const prefix = `[${log.timestamp}] [${log.level}]`;
  const contextStr = Object.entries(log.context)
    .filter(([_, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');
  
  return `${prefix} ${log.message} ${contextStr}`;
}

/**
 * Log structured debug message
 */
export function logDebug(message: string, context: LogContext, metadata?: Record<string, unknown>): void {
  if (process.env.LOG_LEVEL === 'debug') {
    const log = createLog('DEBUG', message, context, metadata);
    console.debug(formatLog(log));
  }
}

/**
 * Log structured info message
 */
export function logInfo(message: string, context: LogContext, metadata?: Record<string, unknown>): void {
  const log = createLog('INFO', message, context, metadata);
  console.info(formatLog(log));
}

/**
 * Log structured warning message
 */
export function logWarn(message: string, context: LogContext, metadata?: Record<string, unknown>): void {
  const log = createLog('WARN', message, context, metadata);
  console.warn(formatLog(log));
}

/**
 * Log structured error message
 */
export function logError(message: string, context: LogContext, error?: Error, metadata?: Record<string, unknown>): void {
  const log = createLog('ERROR', message, context, {
    ...metadata,
    error: error?.message,
    stack: error?.stack,
  });
  console.error(formatLog(log));
}

/**
 * Log payment lifecycle event
 */
export function logPaymentEvent(
  event: 'INITIATED' | 'CONFIRMED' | 'FAILED' | 'EXPIRED' | 'REFUNDED',
  context: {
    orderId: string;
    orderNumber: string;
    provider: string;
    amount: number;
    currency: string;
    requestId?: string;
  },
  metadata?: Record<string, unknown>
): void {
  logInfo(`Payment ${event}`, {
    operation: 'payment-lifecycle',
    ...context,
  }, {
    eventType: event,
    ...metadata,
  });
}

/**
 * Log webhook processing
 */
export function logWebhookEvent(
  event: 'RECEIVED' | 'VERIFIED' | 'REJECTED' | 'PROCESSED' | 'DUPLICATE',
  context: {
    provider: string;
    signature?: string;
    clientIP?: string;
    requestId: string;
  },
  metadata?: Record<string, unknown>
): void {
  logInfo(`Webhook ${event}`, {
    operation: 'webhook-processing',
    ...context,
  }, metadata);
}

/**
 * Log delivery processing
 */
export function logDeliveryEvent(
  event: 'QUEUED' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'RETRYING',
  context: {
    orderId: string;
    orderNumber: string;
    provider: string;
    attempt: number;
    durationMs?: number;
    requestId?: string;
  },
  metadata?: Record<string, unknown>
): void {
  logInfo(`Delivery ${event}`, {
    operation: 'delivery-processing',
    ...context,
  }, metadata);
}

/**
 * Log performance metric
 */
export function logPerformance(
  operation: string,
  durationMs: number,
  context: {
    requestId?: string;
    provider?: string;
    success: boolean;
  }
): void {
  const level = durationMs > 5000 ? 'WARN' : durationMs > 10000 ? 'ERROR' : 'INFO';
  
  logInfo(`${operation} completed in ${durationMs}ms`, {
    operation: 'performance',
    durationMs,
    ...context,
  }, {
    slow: durationMs > 5000,
  });
}

/**
 * Create a logger with pre-bound context
 */
export function createLogger(baseContext: Partial<LogContext>) {
  return {
    debug: (message: string, metadata?: Record<string, unknown>) => 
      logDebug(message, baseContext as LogContext, metadata),
    
    info: (message: string, metadata?: Record<string, unknown>) => 
      logInfo(message, baseContext as LogContext, metadata),
    
    warn: (message: string, metadata?: Record<string, unknown>) => 
      logWarn(message, baseContext as LogContext, metadata),
    
    error: (message: string, error?: Error, metadata?: Record<string, unknown>) => 
      logError(message, baseContext as LogContext, error, metadata),
    
    withContext: (newContext: Partial<LogContext>) => 
      createLogger({ ...baseContext, ...newContext }),
  };
}

/**
 * Middleware for automatic request logging
 */
export function createRequestLogger() {
  return {
    logRequest: (req: Request, requestId: string) => {
      logInfo('Request received', {
        operation: 'http-request',
        requestId,
        method: req.method,
        url: req.url,
      });
    },
    
    logResponse: (req: Request, response: Response, requestId: string, durationMs: number) => {
      logPerformance('HTTP request', durationMs, {
        requestId,
        success: response.status < 400,
      });
    },
  };
}
