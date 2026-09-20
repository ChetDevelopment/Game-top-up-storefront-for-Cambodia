/**
 * Error Classification System
 * 
 * Categorizes errors for proper handling:
 * - Retryable vs non-retryable
 * - Provider-specific errors
 * - User-friendly messages
 * 
 * WHY: Different errors require different handling:
 * - Network errors → retry with backoff
 * - Validation errors → don't retry, fix input
 * - Auth errors → don't retry, fix credentials
 * - Rate limits → retry after delay
 */

export enum ErrorType {
  RETRYABLE = 'RETRYABLE',
  NON_RETRYABLE = 'NON_RETRYABLE',
  RATE_LIMITED = 'RATE_LIMITED',
  AUTH_ERROR = 'AUTH_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  UNKNOWN = 'UNKNOWN',
}

export enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export interface ClassifiedError {
  type: ErrorType;
  severity: ErrorSeverity;
  message: string;
  userMessage?: string;
  originalError: Error;
  retryable: boolean;
  retryAfterMs?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Classify an error for proper handling
 */
export function classifyError(error: any, context?: {
  provider?: string;
  operation?: string;
  attempt?: number;
}): ClassifiedError {
  const errorCode = error?.code || error?.statusCode || error?.status;
  const errorMessage = error?.message || String(error);
  
  // Network errors
  if (errorMessage.includes('ETIMEDOUT') || errorMessage.includes('ECONNREFUSED')) {
    return {
      type: ErrorType.NETWORK_ERROR,
      severity: ErrorSeverity.HIGH,
      message: 'Network connection failed',
      userMessage: 'Unable to connect to payment provider. Please try again.',
      originalError: error,
      retryable: true,
      retryAfterMs: 5000,
    };
  }
  
  // Timeout errors
  if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
    return {
      type: ErrorType.TIMEOUT,
      severity: ErrorSeverity.HIGH,
      message: 'Request timed out',
      userMessage: 'Payment provider is taking too long to respond.',
      originalError: error,
      retryable: true,
      retryAfterMs: 10000,
    };
  }
  
  // Rate limiting
  if (errorCode === 429 || errorMessage.includes('rate limit')) {
    return {
      type: ErrorType.RATE_LIMITED,
      severity: ErrorSeverity.MEDIUM,
      message: 'Rate limit exceeded',
      userMessage: 'Too many requests. Please wait before trying again.',
      originalError: error,
      retryable: true,
      retryAfterMs: 60000, // Wait 1 minute
    };
  }
  
  // Authentication errors
  if (errorCode === 401 || errorCode === 403 || errorMessage.includes('unauthorized') || errorMessage.includes('forbidden')) {
    return {
      type: ErrorType.AUTH_ERROR,
      severity: ErrorSeverity.CRITICAL,
      message: 'Authentication failed',
      userMessage: 'Payment provider authentication failed. Contact support.',
      originalError: error,
      retryable: false,
    };
  }
  
  // Validation errors
  if (errorCode === 400 || errorCode === 422 || errorMessage.includes('validation') || errorMessage.includes('invalid')) {
    return {
      type: ErrorType.VALIDATION_ERROR,
      severity: ErrorSeverity.MEDIUM,
      message: 'Validation failed',
      userMessage: 'Invalid payment details. Please check and try again.',
      originalError: error,
      retryable: false,
    };
  }
  
  // Provider-specific errors
  if (errorCode >= 500 || errorCode === '500') {
    return {
      type: ErrorType.PROVIDER_ERROR,
      severity: ErrorSeverity.HIGH,
      message: 'Payment provider error',
      userMessage: 'Payment provider is experiencing issues. Please try again later.',
      originalError: error,
      retryable: true,
      retryAfterMs: 30000,
    };
  }
  
  // Idempotency conflicts (409)
  if (errorCode === 409 || errorMessage.includes('duplicate') || errorMessage.includes('idempotency')) {
    // This is ambiguous - may have succeeded
    return {
      type: ErrorType.PROVIDER_ERROR,
      severity: ErrorSeverity.HIGH,
      message: 'Idempotency conflict',
      userMessage: 'Payment status unclear. Please check your account.',
      originalError: error,
      retryable: false, // Don't retry - requires reconciliation
    };
  }
  
  // Configuration errors
  if (errorMessage.includes('configuration') || errorMessage.includes('not configured') || errorMessage.includes('missing')) {
    return {
      type: ErrorType.CONFIGURATION_ERROR,
      severity: ErrorSeverity.CRITICAL,
      message: 'Configuration error',
      userMessage: 'System configuration error. Contact support.',
      originalError: error,
      retryable: false,
    };
  }
  
  // Default: unknown error
  return {
    type: ErrorType.UNKNOWN,
    severity: ErrorSeverity.MEDIUM,
    message: 'Unknown error occurred',
    userMessage: 'An unexpected error occurred. Please try again.',
    originalError: error,
    retryable: true,
    retryAfterMs: 5000,
  };
}

/**
 * Get user-friendly error message
 */
export function getUserFriendlyMessage(error: any): string {
  const classified = classifyError(error);
  return classified.userMessage || classified.message;
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: any): boolean {
  const classified = classifyError(error);
  return classified.retryable;
}

/**
 * Get recommended retry delay
 */
export function getRetryDelay(error: any, attempt: number = 1): number {
  const classified = classifyError(error);
  
  if (classified.retryAfterMs) {
    return classified.retryAfterMs;
  }
  
  // Exponential backoff with jitter
  const baseDelay = 1000 * Math.pow(2, attempt);
  const jitter = (Math.random() - 0.5) * 0.6 * baseDelay;
  return baseDelay + jitter;
}

/**
 * Log error with classification
 */
export function logClassifiedError(
  error: any,
  context: {
    operation: string;
    provider?: string;
    orderId?: string;
  }
): void {
  const classified = classifyError(error, {
    provider: context.provider,
    operation: context.operation,
  });
  
  const logLevel = classified.severity === ErrorSeverity.CRITICAL ? 'error' :
                   classified.severity === ErrorSeverity.HIGH ? 'error' :
                   classified.severity === ErrorSeverity.MEDIUM ? 'warn' : 'info';
  
  console[logLevel](`[Error] ${context.operation}:`, {
    type: classified.type,
    severity: classified.severity,
    message: classified.message,
    provider: context.provider,
    orderId: context.orderId,
    retryable: classified.retryable,
    originalError: classified.originalError.message,
  });
}

/**
 * Error codes for frontend display
 */
export const ERROR_CODES = {
  [ErrorType.RETRYABLE]: 'PAYMENT_RETRYABLE',
  [ErrorType.NON_RETRYABLE]: 'PAYMENT_FAILED',
  [ErrorType.RATE_LIMITED]: 'PAYMENT_RATE_LIMITED',
  [ErrorType.AUTH_ERROR]: 'PAYMENT_AUTH_ERROR',
  [ErrorType.VALIDATION_ERROR]: 'PAYMENT_VALIDATION_ERROR',
  [ErrorType.NETWORK_ERROR]: 'PAYMENT_NETWORK_ERROR',
  [ErrorType.TIMEOUT]: 'PAYMENT_TIMEOUT',
  [ErrorType.PROVIDER_ERROR]: 'PAYMENT_PROVIDER_ERROR',
  [ErrorType.CONFIGURATION_ERROR]: 'PAYMENT_CONFIG_ERROR',
  [ErrorType.UNKNOWN]: 'PAYMENT_UNKNOWN_ERROR',
};
