/**
 * Webhook Secret Rotation System
 * 
 * Supports multiple active secrets for graceful key rotation.
 * Validates against all configured secrets using timing-safe comparison.
 * 
 * WHY: Single secret creates operational risk:
 * - Cannot rotate without downtime
 * - Compromise requires immediate emergency rotation
 * - No audit trail of secret usage
 * 
 * AFTER: Multiple secrets with versioning and usage tracking
 */

import crypto from 'crypto';

/**
 * Get all configured webhook secrets
 * Supports primary + fallback secrets for rotation
 */
export function getWebhookSecrets(provider: 'BAKONG' | 'ABA'): { secret: string; version: string }[] {
  const secrets: { secret: string; version: string }[] = [];
  
  if (provider === 'BAKONG') {
    // Primary secret (current)
    const primarySecret = process.env.BAKONG_WEBHOOK_SECRET;
    if (primarySecret) {
      secrets.push({
        secret: primarySecret,
        version: 'v1', // Default version
      });
    }
    
    // Old secret (during rotation period)
    const oldSecret = process.env.BAKONG_WEBHOOK_SECRET_OLD;
    if (oldSecret) {
      secrets.push({
        secret: oldSecret,
        version: 'v0',
      });
    }
    
    // Future secret (pre-provisioned)
    const futureSecret = process.env.BAKONG_WEBHOOK_SECRET_NEXT;
    if (futureSecret) {
      secrets.push({
        secret: futureSecret,
        version: 'v2',
      });
    }
  } else if (provider === 'ABA') {
    // Primary secret
    const primarySecret = process.env.ABA_WEBHOOK_SECRET;
    if (primarySecret) {
      secrets.push({
        secret: primarySecret,
        version: 'v1',
      });
    }
    
    // Old secret
    const oldSecret = process.env.ABA_WEBHOOK_SECRET_OLD;
    if (oldSecret) {
      secrets.push({
        secret: oldSecret,
        version: 'v0',
      });
    }
  }
  
  return secrets;
}

/**
 * Verify webhook signature against all configured secrets
 * Returns which secret version was used (for audit/rotation tracking)
 * 
 * Uses timing-safe comparison to prevent timing attacks
 */
export function verifyWebhookSignatureRotating(
  payload: string,
  signature: string,
  provider: 'BAKONG' | 'ABA'
): {
  valid: boolean;
  secretVersion?: string;
  error?: string;
} {
  const secrets = getWebhookSecrets(provider);
  
  if (secrets.length === 0) {
    return {
      valid: false,
      error: 'No webhook secrets configured',
    };
  }
  
  // Try each secret until one matches
  for (const { secret, version } of secrets) {
    try {
      const isValid = verifyWebhookSignature(payload, signature, secret);
      
      if (isValid) {
        return {
          valid: true,
          secretVersion: version,
        };
      }
    } catch (error) {
      console.error(`[WebhookSecret] Verification error for ${version}:`, error);
      // Continue to next secret
    }
  }
  
  return {
    valid: false,
    error: 'No matching secret found',
  };
}

/**
 * Timing-safe HMAC signature verification
 * Prevents timing attacks by always taking constant time
 */
export function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  if (!payload || !signature || !secret) {
    return false;
  }
  
  try {
    // Create expected signature
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    const expectedSignature = hmac.digest('hex');
    
    // Convert to buffers for timing-safe comparison
    const signatureBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    
    // Ensure same length before comparison
    if (signatureBuffer.length !== expectedBuffer.length) {
      return false;
    }
    
    // Timing-safe comparison
    return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
  } catch (error) {
    console.error('[WebhookSecret] Signature verification error:', error);
    return false;
  }
}

/**
 * Create webhook signature with version header
 * Used for testing or sending webhooks
 */
export function createWebhookSignatureWithVersion(
  payload: string,
  secret: string,
  version: string = 'v1'
): {
  signature: string;
  version: string;
  timestamp: string;
} {
  const timestamp = Date.now().toString();
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(`${timestamp}.${payload}`);
  const signature = hmac.digest('hex');
  
  return {
    signature,
    version,
    timestamp,
  };
}

/**
 * Generate a new secure webhook secret
 * Use this for secret rotation
 */
export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Validate secret strength
 * Ensures secrets meet security requirements
 */
export function validateWebhookSecret(secret: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (!secret || secret.length === 0) {
    errors.push('Secret cannot be empty');
  }
  
  if (secret.length < 32) {
    errors.push('Secret must be at least 32 characters (256 bits)');
  }
  
  // Check entropy (hex should be 64 chars for 32 bytes)
  if (!/^[a-fA-F0-9]+$/.test(secret)) {
    errors.push('Secret should be hexadecimal encoded');
  }
  
  // Check for common weak patterns
  const weakPatterns = [
    'secret',
    'password',
    'key',
    'test',
    'example',
    'demo',
  ];
  
  const lowerSecret = secret.toLowerCase();
  for (const pattern of weakPatterns) {
    if (lowerSecret.includes(pattern) && secret.length < 64) {
      errors.push('Secret contains weak pattern');
      break;
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get secret rotation status
 * For admin dashboard monitoring
 */
export function getSecretRotationStatus(provider: 'BAKONG' | 'ABA'): {
  hasPrimary: boolean;
  hasOld: boolean;
  hasNext: boolean;
  totalSecrets: number;
  recommendations: string[];
} {
  const secrets = getWebhookSecrets(provider);
  const recommendations: string[] = [];
  
  const hasPrimary = secrets.some(s => s.version === 'v1');
  const hasOld = secrets.some(s => s.version === 'v0');
  const hasNext = secrets.some(s => s.version === 'v2');
  
  if (!hasPrimary) {
    recommendations.push('Configure primary webhook secret');
  }
  
  if (hasOld && !hasNext) {
    recommendations.push('Consider removing old secret after rotation period');
  }
  
  if (secrets.length === 0) {
    recommendations.push('CRITICAL: No webhook secrets configured');
  }
  
  if (secrets.length > 3) {
    recommendations.push('Too many active secrets - clean up old secrets');
  }
  
  return {
    hasPrimary,
    hasOld,
    hasNext,
    totalSecrets: secrets.length,
    recommendations,
  };
}
