/**
 * KHPay / KHQRPay Payment Integration
 * 
 * KHPay Cambodia Payment Gateway
 * Docs: https://khpay.site
 * 
 * Supports:
 * - KHQR code generation (EMV-compliant)
 * - Payment verification via API
 * - Webhook signature verification (HMAC-SHA256)
 * - Auto-payment confirmation
 */

import crypto from "crypto";
import {
  PaymentMethod,
  PaymentCurrency,
  InitiatePaymentArgs,
  PaymentInitResult,
  PaymentVerificationResult,
  PaymentError,
} from "./payment-types";
import { encryptField } from "./encryption";

// KHPay Configuration
const KHPAY_BASE_URL = process.env.KHPAY_BASE_URL || "https://khpay.site/api/v1";
const KHPAY_API_KEY = process.env.KHPAY_API_KEY;
const KHPAY_WEBHOOK_SECRET = process.env.KHPAY_WEBHOOK_SECRET;
const KHPAY_IP_RANGES = process.env.KHPAY_IP_RANGES;
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
const MERCHANT_NAME = process.env.BAKONG_MERCHANT_NAME || "Ty Khai TopUp";
const MERCHANT_CITY = process.env.BAKONG_MERCHANT_CITY || "Phnom Penh";

/**
 * Generate KHQR Code (EMV-compliant)
 * 
 * This generates a KHQR code that can be scanned by:
 * - ABA Mobile
 * - ACLEDA Pay
 * - Wing
 * - TrueMoney
 * - Chip Mong
 * - Prince Bank
 * - All KHQR-enabled Cambodian banking apps
 */
function generateKHQR(args: {
  account: string;
  merchantName: string;
  merchantCity: string;
  amount: number;
  currency: "USD" | "KHR";
  paymentRef: string;
  expiresAt: Date;
}): { qrString: string; md5Hash: string } {
  const { account, merchantName, merchantCity, amount, currency, paymentRef, expiresAt } = args;
  
  // EMV QR Code Data Objects
  const tl = (tag: string, value: string): string => {
    return tag + value.length.toString().padStart(2, "0") + value;
  };

  // CRC16 Calculation for QR Code
  const crc16 = (data: string): string => {
    let crc = 0xffff;
    for (let i = 0; i < data.length; i++) {
      crc ^= data.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) {
        crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      }
      crc &= 0xffff;
    }
    return crc.toString(16).toUpperCase().padStart(4, "0");
  };

  // Currency codes (EMV standard)
  const currencyCode = currency === "KHR" ? "116" : "840";
  const amountStr = Number(amount).toFixed(2).replace(/\.?0+$/, "");
  
  // Timestamps for QR validity
  const creationTimestamp = Date.now().toString();
  const expirationTimestamp = expiresAt.getTime().toString();

  // Build QR Code Data (EMV-compliant KHQR format)
  let qrString = "";
  qrString += tl("00", "01"); // Payload Format Indicator
  qrString += tl("01", "12"); // Payment System Indicator (KHQR)
  qrString += tl("29", tl("00", account)); // Account Information
  qrString += tl("52", "5999"); // Merchant Category Code
  qrString += tl("53", currencyCode); // Transaction Currency
  qrString += tl("54", amountStr.padStart(11, "0")); // Transaction Amount
  qrString += tl("58", "KH"); // Country Code
  qrString += tl("59", merchantName.padEnd(15, " ").slice(0, 15)); // Merchant Name
  qrString += tl("60", merchantCity.padEnd(10, " ").slice(0, 10)); // City
  
  // Additional Data (timestamp, reference)
  const timestampInner = tl("00", creationTimestamp) + tl("01", expirationTimestamp);
  qrString += tl("99", timestampInner);
  
  if (paymentRef) {
    qrString += tl("62", tl("01", paymentRef)); // Bill Number
  }

  // Add CRC16
  const crcPrefix = "6304";
  qrString += crcPrefix + crc16(qrString + crcPrefix);

  // Generate MD5 hash for verification
  const md5Hash = crypto.createHash("md5").update(qrString).digest("hex");

  return { qrString, md5Hash };
}

/**
 * Initiate KHPay Payment
 * 
 * Creates a payment session and generates KHQR code
 */
export async function initiateKHPayPayment(args: InitiatePaymentArgs): Promise<PaymentInitResult> {
  console.log("[KHPay] Initiating payment...");
  console.log("[KHPay] API Key:", KHPAY_API_KEY ? "SET" : "MISSING");
  console.log("[KHPay] Webhook Secret:", KHPAY_WEBHOOK_SECRET ? "SET" : "MISSING");
  console.log("[KHPay] Base URL:", KHPAY_BASE_URL);

  if (!KHPAY_API_KEY) {
    console.error("[KHPay] Configuration error - missing API key!");
    throw new PaymentError("KHPay not configured", "KHPAY_NOT_CONFIGURED", 500);
  }

  const isKhr = args.currency === "KHR";
  const amount = isKhr ? args.amountKhr : args.amountUsd;

  if (!amount || amount <= 0) {
    throw new PaymentError("Invalid amount", "INVALID_AMOUNT", 400);
  }

  // Generate payment reference
  const paymentRef = `KH${Date.now()}`;
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  try {
    // Generate KHQR code
    const bakongAccount = process.env.BAKONG_ACCOUNT;
    if (!bakongAccount) {
      throw new PaymentError("BAKONG_ACCOUNT environment variable is required", "CONFIGURATION_ERROR", 500);
    }

    const { qrString, md5Hash } = generateKHQR({
      account: bakongAccount,
      merchantName: MERCHANT_NAME,
      merchantCity: MERCHANT_CITY,
      amount: Number(amount),
      currency: args.currency,
      paymentRef,
      expiresAt,
    });

    // Encrypt QR for storage
    const qrStringEnc = encryptField(qrString);

    // Log payment initiation
    await logPaymentEvent({
      orderNumber: args.orderNumber,
      paymentRef,
      event: "INITIATED",
      provider: "KHPAY",
      amount: Number(amount),
      currency: args.currency,
    });

    console.log("[KHPay] Payment initiated successfully:", {
      paymentRef,
      amount,
      currency: args.currency,
      md5Hash: md5Hash.slice(0, 8) + "...",
    });

    return {
      paymentRef,
      redirectUrl: `${BASE_URL}/checkout/${args.orderNumber}`,
      qrString,
      qrStringEnc,
      md5String: md5Hash,
      expiresAt,
      instructions: `Scan this KHQR code with any Cambodian banking app to pay ${amount} ${args.currency}`,
      metadata: {
        provider: "KHPAY",
        account: process.env.BAKONG_ACCOUNT,
      },
    };
  } catch (err: any) {
    console.error("[KHPay] Payment initiation error:", err);
    throw new PaymentError(`KHPay error: ${err.message}`, "KHPAY_INIT_ERROR", 500);
  }
}

/**
 * Verify KHPay Payment via API
 * 
 * Checks payment status with KHPay servers
 */
export async function checkKHPayPayment(md5Hash: string): Promise<PaymentVerificationResult> {
  const startTime = Date.now();
  console.log("\n" + "=".repeat(60));
  console.log("[KHPay Check] Starting payment verification");
  console.log("[KHPay Check] MD5 Hash:", md5Hash);
  console.log("[KHPay Check] API Key:", KHPAY_API_KEY ? "SET" : "MISSING");
  console.log("=".repeat(60) + "\n");

  if (!KHPAY_API_KEY) {
    console.error("[KHPay Check] Missing KHPAY_API_KEY");
    throw new PaymentError("KHPay not configured", "KHPAY_NOT_CONFIGURED", 500);
  }

  if (!md5Hash || md5Hash.length !== 32) {
    console.error("[KHPay Check] Invalid MD5 hash:", md5Hash);
    const failedResult: PaymentVerificationResult = { 
      status: "FAILED", 
      paid: false, 
      message: "Invalid MD5 hash" 
    };
    return failedResult;
  }

  const maxRetries = 3;
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[KHPay Check] Attempt ${attempt}/${maxRetries}...`);

      // Query KHPay API for payment status
      const response = await fetch(`${KHPAY_BASE_URL}/payment/check`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${KHPAY_API_KEY}`,
        },
        body: JSON.stringify({ md5: md5Hash }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "KHPay API error");
      }

      console.log("[KHPay Check] API Response:", JSON.stringify(result, null, 2));

      // Parse response
      const status = String(result.status || result.payment_status || "").toUpperCase();
      const isPaid = 
        status === "PAID" || 
        status === "COMPLETED" || 
        status === "SUCCESS" ||
        (result.paid === true) ||
        (result.acknowledged_date_ms && typeof result.acknowledged_date_ms === 'number');

      if (isPaid) {
        console.log("\n✅ [KHPay Check] PAYMENT CONFIRMED!");
        const successResult: PaymentVerificationResult = {
          status: "PAID",
          paid: true,
          paidAt: result.paid_at ? new Date(result.paid_at) : undefined,
          transactionId: result.transaction_id || result.hash || md5Hash,
          amount: result.amount ? parseFloat(String(result.amount)) : undefined,
          currency: result.currency || "USD",
          rawResponse: result,
        };
        return successResult;
      }

      // Payment not yet confirmed
      console.log("[KHPay Check] Payment not confirmed, status:", status);
      
      if (status === "PENDING" || status === "PROCESSING") {
        if (attempt < maxRetries) {
          const baseDelay = Math.min(1000 * Math.pow(2, attempt), 5000);
          const jitter = (Math.random() - 0.5) * 0.6 * baseDelay;
          const delay = baseDelay + jitter;
          console.log(`[KHPay Check] Waiting ${delay}ms before retry...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
      }

      const pendingResult: PaymentVerificationResult = { 
        status: "PENDING", 
        paid: false, 
        rawResponse: result 
      };
      return pendingResult;

    } catch (err: any) {
      lastError = err;
      console.error(`[KHPay Check] Attempt ${attempt} failed:`, err.message);

      if (attempt < maxRetries) {
        const baseDelay = Math.min(2000 * Math.pow(2, attempt), 8000);
        const jitter = (Math.random() - 0.5) * 0.6 * baseDelay;
        const delay = baseDelay + jitter;
        console.log(`[KHPay Check] Waiting ${delay}ms before retry...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
    }
  }

  console.error("[KHPay Check] All retries exhausted");
  return { 
    status: "PENDING", 
    paid: false, 
    message: lastError?.message || "Max retries reached" 
  };
}

/**
 * Verify KHPay Webhook Signature
 * 
 * KHPay sends HMAC-SHA256 signatures in x-khpay-signature header
 */
export function verifyKHPayWebhookSignature(payload: string, signature: string): boolean {
  if (!KHPAY_WEBHOOK_SECRET) {
    console.warn("[KHPay Webhook] No webhook secret configured - skipping verification");
    return false;
  }

  const expectedSignature = crypto
    .createHmac("sha256", KHPAY_WEBHOOK_SECRET)
    .update(payload)
    .digest("hex");

  // Constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(expectedSignature, "hex")
  );
}

/**
 * Generate KHPay Webhook Signature (for testing)
 */
export function generateKHPayWebhookSignature(payload: string): string {
  if (!KHPAY_WEBHOOK_SECRET) {
    throw new Error("KHPAY_WEBHOOK_SECRET not configured");
  }

  return crypto
    .createHmac("sha256", KHPAY_WEBHOOK_SECRET)
    .update(payload)
    .digest("hex");
}

/**
 * Validate Payment Amount
 * 
 * Ensures paid amount matches expected amount (with small tolerance)
 */
export function validateKHPayAmount(
  expectedUsd: number,
  expectedKhr: number | null | undefined,
  paidAmount: number,
  currency: string
): { valid: boolean; message?: string } {
  const tolerance = 0.01; // 1 cent tolerance
  
  if (currency === "KHR") {
    if (typeof expectedKhr !== "number") {
      return { valid: false, message: "KHR amount not set" };
    }
    if (Math.abs(paidAmount - expectedKhr) > tolerance) {
      return { 
        valid: false, 
        message: `Expected ${expectedKhr} KHR, got ${paidAmount} KHR` 
      };
    }
  } else {
    if (Math.abs(paidAmount - expectedUsd) > tolerance) {
      return { 
        valid: false, 
        message: `Expected ${expectedUsd} USD, got ${paidAmount} USD` 
      };
    }
  }
  
  return { valid: true };
}

/**
 * Log Payment Event
 */
async function logPaymentEvent(entry: {
  orderNumber: string;
  paymentRef: string;
  event: string;
  provider: string;
  amount?: number;
  currency?: string;
  status?: string;
  details?: unknown;
}) {
  try {
    const { logSecurityEvent } = await import("./security");
    await logSecurityEvent("KHPAY_PAYMENT_EVENT", entry, {} as any);
  } catch (err) {
    console.error("[KHPay] Failed to log payment event:", err);
  }
}

/**
 * Check if KHPay is Configured
 */
export function isKHPayConfigured(): boolean {
  return !!(KHPAY_API_KEY && KHPAY_BASE_URL);
}

/**
 * Get KHPay Configuration Status
 */
export function getKHPayConfigStatus(): {
  configured: boolean;
  apiKey: boolean;
  webhookSecret: boolean;
  baseUrl: boolean;
  ipRanges: boolean;
} {
  return {
    configured: isKHPayConfigured(),
    apiKey: !!KHPAY_API_KEY,
    webhookSecret: !!KHPAY_WEBHOOK_SECRET,
    baseUrl: !!KHPAY_BASE_URL,
    ipRanges: !!KHPAY_IP_RANGES,
  };
}
