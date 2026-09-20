import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;

  if (!secret) {
    throw new Error("FATAL: ENCRYPTION_KEY environment variable is required");
  }

  if (secret.length < 32) {
    throw new Error("FATAL: ENCRYPTION_KEY must be at least 32 characters long");
  }

  if (secret === "development_secret_key_at_least_32_characters_long") {
    throw new Error("FATAL: Default development ENCRYPTION_KEY detected. Set a unique key for production");
  }

  return crypto.createHash("sha256").update(secret).digest();
}

export interface EncryptedData {
  iv: string;
  encrypted: string;
  tag: string;
  salt: string;
}

export function encrypt(text: string): EncryptedData {
  if (typeof text !== "string" || !text) {
    throw new Error("Invalid input for encryption");
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const salt = crypto.randomBytes(SALT_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString("hex"),
    encrypted: encrypted,
    tag: tag.toString("hex"),
    salt: salt.toString("hex"),
  };
}

export function decrypt(encryptedData: EncryptedData): string {
  if (!encryptedData || typeof encryptedData !== "object") {
    throw new Error("Invalid encrypted data format");
  }

  const { iv, encrypted, tag } = encryptedData;

  if (!iv || !encrypted || !tag) {
    throw new Error("Missing required encryption fields");
  }

  const key = getEncryptionKey();

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(iv, "hex")
  );

  decipher.setAuthTag(Buffer.from(tag, "hex"));

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

export function encryptField(value: string | null | undefined): string | null {
  if (!value) return null;
  const encrypted = encrypt(value);
  return JSON.stringify(encrypted);
}

export function decryptField(encryptedStr: string | null | undefined): string | null {
  if (!encryptedStr) return null;
  try {
    const encryptedData = JSON.parse(encryptedStr) as EncryptedData;
    if (encryptedData.iv && encryptedData.encrypted && encryptedData.tag) {
      return decrypt(encryptedData);
    }
    return encryptedStr;
  } catch {
    return encryptedStr;
  }
}

export function generateSecureRef(length: number = 32): string {
  return crypto.randomBytes(length).toString("hex");
}

export function generateSecureToken(length: number = 64): string {
  return crypto.randomBytes(length).toString("hex");
}

export function hashSha256(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

export function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payload);
  const expectedSignature = hmac.digest("hex");
  if (signature.length !== expectedSignature.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(expectedSignature, "hex")
  );
}

export function createWebhookSignature(payload: string, secret: string): string {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payload);
  return hmac.digest("hex");
}

export function md5ToSha256(md5Hash: string): string {
  return crypto.createHash("sha256").update(md5Hash).digest("hex");
}

/**
 * Encrypt provider tokens (gameDropToken, g2bulkToken, etc.) for DB storage.
 * Uses a dedicated token encryption key separate from field-level encryption.
 */
function getTokenEncryptionKey(): Buffer {
  const secret = process.env.TOKEN_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    throw new Error("FATAL: TOKEN_ENCRYPTION_KEY (or ENCRYPTION_KEY) must be at least 32 characters");
  }
  return crypto.createHash("sha256").update(secret + ":tokens").digest();
}

export function encryptToken(token: string): string {
  const key = getTokenEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(token, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag();
  return JSON.stringify({ iv: iv.toString("hex"), encrypted, tag: tag.toString("hex") });
}

export function decryptToken(encryptedStr: string): string {
  try {
    const data = JSON.parse(encryptedStr) as { iv: string; encrypted: string; tag: string };
    const key = getTokenEncryptionKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(data.iv, "hex"));
    decipher.setAuthTag(Buffer.from(data.tag, "hex"));
    let decrypted = decipher.update(data.encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    throw new Error("Token decryption failed");
  }
}
