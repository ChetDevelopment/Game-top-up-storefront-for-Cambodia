type EnvVar = {
  key: string;
  required: boolean;
  minLength?: number;
  pattern?: RegExp;
  description: string;
};

const ENV_VARS: EnvVar[] = [
  // Database
  { key: "DATABASE_URL", required: true, description: "PostgreSQL connection string" },

  // Encryption
  { key: "ENCRYPTION_KEY", required: true, minLength: 32, description: "AES-256-GCM encryption key (min 32 chars)" },
  { key: "TOKEN_ENCRYPTION_KEY", required: false, minLength: 32, description: "Separate key for provider token encryption" },

  // Auth
  { key: "JWT_SECRET", required: true, minLength: 32, description: "JWT signing secret (min 32 chars)" },
  { key: "NEXTAUTH_SECRET", required: true, minLength: 32, description: "NextAuth secret (min 32 chars)" },
  { key: "NEXTAUTH_URL", required: true, description: "NextAuth base URL" },
  { key: "CSRF_SECRET", required: false, minLength: 32, description: "CSRF token secret" },

  // Bakong
  { key: "BAKONG_API_BASE", required: true, description: "Bakong API base URL" },
  { key: "BAKONG_ACCOUNT", required: true, description: "Bakong merchant account ID" },
  { key: "BAKONG_MERCHANT_NAME", required: true, description: "Bakong merchant name" },
  { key: "BAKONG_TOKEN", required: true, description: "Bakong API token" },
  { key: "BAKONG_WEBHOOK_SECRET", required: true, minLength: 16, description: "Bakong webhook HMAC secret" },
  { key: "BAKONG_IP_RANGES", required: false, description: "Comma-separated CIDR ranges for Bakong webhooks" },

  // ABA
  { key: "ABA_API_BASE", required: false, description: "ABA PayWay API base URL" },
  { key: "ABA_MERCHANT_ID", required: false, description: "ABA PayWay merchant ID" },
  { key: "ABA_API_KEY", required: false, description: "ABA PayWay API key" },
  { key: "ABA_WEBHOOK_SECRET", required: false, minLength: 16, description: "ABA webhook HMAC secret" },
  { key: "ABA_IP_RANGES", required: false, description: "Comma-separated CIDR ranges for ABA webhooks" },

  // Game providers
  { key: "GAMEDROP_TOKEN", required: false, description: "GameDrop API token" },
  { key: "G2BULK_TOKEN", required: false, description: "G2Bulk API token" },

  // Redis (Upstash)
  { key: "UPSTASH_REDIS_REST_URL", required: false, description: "Upstash Redis REST URL" },
  { key: "UPSTASH_REDIS_REST_TOKEN", required: false, description: "Upstash Redis REST token" },
  { key: "UPSTASH_REDIS_URL", required: false, description: "Upstash Redis URL (legacy)" },
  { key: "UPSTASH_REDIS_TOKEN", required: false, description: "Upstash Redis token (legacy)" },

  // Vercel/Deployment
  { key: "NEXT_PUBLIC_BASE_URL", required: true, description: "Public base URL of the application" },

  // Telegram
  { key: "TELEGRAM_BOT_TOKEN", required: false, description: "Telegram bot token for notifications" },
  { key: "TELEGRAM_CHAT_ID", required: false, description: "Telegram chat ID for notifications" },

  // Google OAuth
  { key: "GOOGLE_CLIENT_ID", required: false, description: "Google OAuth client ID" },
  { key: "GOOGLE_CLIENT_SECRET", required: false, description: "Google OAuth client secret" },
];

export function validateEnv(): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const envVar of ENV_VARS) {
    const value = process.env[envVar.key];

    if (!value || value.trim().length === 0) {
      if (envVar.required) {
        errors.push(`MISSING REQUIRED: ${envVar.key} — ${envVar.description}`);
      }
      continue;
    }

    if (envVar.minLength && value.length < envVar.minLength) {
      if (envVar.required) {
        errors.push(`TOO SHORT: ${envVar.key} — must be at least ${envVar.minLength} characters (currently ${value.length})`);
      } else {
        warnings.push(`${envVar.key} is shorter than recommended ${envVar.minLength} characters`);
      }
    }

    if (envVar.pattern && !envVar.pattern.test(value)) {
      warnings.push(`${envVar.key} does not match expected pattern`);
    }

    if (value === "development_secret_key_at_least_32_characters_long") {
      errors.push(`INSECURE DEFAULT: ${envVar.key} is using the development default value. Set a unique production value.`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function getEnvStatus(): Record<string, { set: boolean; length: number }> {
  const status: Record<string, { set: boolean; length: number }> = {};
  for (const envVar of ENV_VARS) {
    const value = process.env[envVar.key];
    status[envVar.key] = {
      set: !!value && value.length > 0,
      length: value?.length || 0,
    };
  }
  return status;
}

export const ENV_VERSION = 1;
