/**
 * Graceful Shutdown Handler
 * 
 * Ensures clean shutdown of:
 * - Active payment processing
 * - Database connections
 * - Redis connections
 * - Background workers
 * 
 * WHY: Prevents:
 * - Orphaned transactions
 * - Data corruption
 * - Resource leaks
 * - Incomplete deliveries
 */

import { prisma } from './prisma';
import { shutdownRedis } from './redis';

interface ShutdownOptions {
  timeout?: number; // Max time to wait for cleanup (ms)
  onShutdown?: () => void; // Callback when shutdown starts
  onComplete?: () => void; // Callback when shutdown completes
}

let isShuttingDown = false;
let activeJobs = new Set<string>();

/**
 * Register a job as active (for shutdown tracking)
 */
export function registerActiveJob(jobId: string): void {
  if (isShuttingDown) {
    console.warn(`[Shutdown] Job ${jobId} rejected - shutting down`);
    throw new Error('SHUTDOWN_IN_PROGRESS');
  }
  activeJobs.add(jobId);
}

/**
 * Unregister a completed job
 */
export function unregisterActiveJob(jobId: string): void {
  activeJobs.delete(jobId);
}

/**
 * Check if system is shutting down
 */
export function isSystemShuttingDown(): boolean {
  return isShuttingDown;
}

/**
 * Get count of active jobs
 */
export function getActiveJobCount(): number {
  return activeJobs.size;
}

/**
 * Initialize graceful shutdown handlers
 */
export function initializeGracefulShutdown(options: ShutdownOptions = {}): void {
  const {
    timeout = 30000, // 30 seconds default
    onShutdown,
    onComplete,
  } = options;
  
  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      console.log(`[Shutdown] Already shutting down, ignoring signal: ${signal}`);
      return;
    }
    
    isShuttingDown = true;
    console.log(`[Shutdown] Received ${signal}, starting graceful shutdown...`);
    
    if (onShutdown) {
      onShutdown();
    }
    
    const shutdownStart = Date.now();
    
    try {
      // 1. Stop accepting new jobs
      console.log(`[Shutdown] Stopping new job acceptance...`);
      
      // 2. Wait for active jobs to complete (with timeout)
      const waitForJobs = async () => {
        const checkInterval = 100; // Check every 100ms
        const maxWait = timeout;
        let waited = 0;
        
        while (activeJobs.size > 0 && waited < maxWait) {
          console.log(`[Shutdown] Waiting for ${activeJobs.size} active jobs...`);
          await new Promise(r => setTimeout(r, checkInterval));
          waited += checkInterval;
        }
        
        if (activeJobs.size > 0) {
          console.warn(`[Shutdown] Timeout reached, ${activeJobs.size} jobs still active`);
        } else {
          console.log(`[Shutdown] All active jobs completed`);
        }
      };
      
      await waitForJobs();
      
      // 3. Close Redis connections
      console.log(`[Shutdown] Closing Redis connections...`);
      await shutdownRedis();
      
      // 4. Close database connections
      console.log(`[Shutdown] Closing database connections...`);
      await prisma.$disconnect();
      console.log(`[Shutdown] Database connections closed`);
      
      // 5. Final cleanup
      const shutdownDuration = Date.now() - shutdownStart;
      console.log(`[Shutdown] Graceful shutdown completed in ${shutdownDuration}ms`);
      
      if (onComplete) {
        onComplete();
      }
      
      // Exit with success code
      process.exit(0);
    } catch (error) {
      console.error(`[Shutdown] Error during shutdown:`, error);
      
      // Force exit on error
      process.exit(1);
    }
  };
  
  // Register signal handlers
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  
  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    console.error('[Shutdown] Uncaught exception:', error);
    shutdown('uncaughtException');
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('[Shutdown] Unhandled rejection at:', promise, 'reason:', reason);
    shutdown('unhandledRejection');
  });
  
  console.log(`[Shutdown] Graceful shutdown handlers registered (timeout: ${timeout}ms)`);
}

/**
 * Force shutdown after timeout
 */
export function forceShutdown(timeout: number = 5000): NodeJS.Timeout {
  return setTimeout(() => {
    console.error(`[Shutdown] Force shutdown after ${timeout}ms timeout`);
    process.exit(1);
  }, timeout);
}
