/**
 * ABA PayWay Payment Integration
 * 
 * ABA Bank Cambodia Payment Gateway
 * Docs: https://developer.payway.com.kh/
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

// ABA PayWay Configuration
const ABA_PAYWAY_API = process.env.ABA_PAYWAY_API || "https://checkout.payway.com.kh";
const ABA_MERCHANT_ID = process.env.ABA_MERCHANT_ID;
const ABA_SECRET_KEY = process.env.ABA_SECRET_KEY;
const ABA_PUBLIC_KEY = process.env.ABA_PUBLIC_KEY;
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

/**
 * Initiate ABA PayWay Payment
 */
export async function initiateABAPayment(args: InitiatePaymentArgs): Promise<PaymentInitResult> {
  console.log("[ABA] Initiating payment...");
  console.log("[ABA] MERCHANT_ID:", ABA_MERCHANT_ID ? "SET" : "MISSING");
  console.log("[ABA] SECRET_KEY:", ABA_SECRET_KEY ? "SET" : "MISSING");

  if (!ABA_MERCHANT_ID || !ABA_SECRET_KEY) {
    console.error("[ABA] Configuration error - missing credentials!");
    throw new PaymentError("ABA PayWay not configured", "ABA_NOT_CONFIGURED", 500);
  }

  const isKhr = args.currency === "KHR";
  const amount = isKhr ? args.amountKhr : args.amountUsd;

  if (!amount || amount <= 0) {
    throw new PaymentError("Invalid amount", "INVALID_AMOUNT", 400);
  }

  const paymentRef = `ABA${Date.now()}`;
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  // ABA PayWay requires specific fields
  const paymentData = {
    merchant_id: ABA_MERCHANT_ID,
    reference_id: paymentRef,
    amount: Number(amount).toFixed(2),
    currency: isKhr ? "KHR" : "USD",
    customer_email: args.customerEmail || "",
    customer_phone: args.customerPhone || "",
    return_url: `${BASE_URL}/checkout/${args.orderNumber}`,
    cancel_url: `${BASE_URL}/checkout/${args.orderNumber}`,
    ipn_url: `${BASE_URL}/api/payment/webhook/aba`,
    description: `Order ${args.orderNumber} - ${args.productName}`,
  };

  // Generate signature for ABA PayWay
  const signature = generateABASignature(paymentData, ABA_SECRET_KEY);

  try {
    // Request payment URL from ABA PayWay
    const response = await fetch(`${ABA_PAYWAY_API}/api/v1/payment/request`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ABA_SECRET_KEY}`,
      },
      body: JSON.stringify({
        ...paymentData,
        signature,
      }),
    });

    const result = await response.json();

    if (!response.ok || result.status !== "success") {
      throw new Error(result.message || "ABA PayWay API error");
    }

    // ABA returns payment URL and QR code
    const paymentUrl = result.payment_url;
    const qrString = result.qr_code || result.khqr;

    // Generate MD5 for verification
    const md5String = crypto.createHash("md5").update(qrString || paymentRef).digest("hex");
    const qrStringEnc = encryptField(qrString || "");

    return {
      paymentRef,
      redirectUrl: paymentUrl || `${BASE_URL}/checkout/${args.orderNumber}`,
      qrString: qrString || null,
      qrStringEnc,
      md5String,
      expiresAt,
      instructions: `Scan QR with ABA Mobile or pay via ABA PayWay`,
      metadata: {
        abaPaymentUrl: paymentUrl,
        abaOrderId: result.order_id,
      },
    };
  } catch (err: any) {
    console.error("[ABA] Payment initiation error:", err);
    throw new PaymentError(`ABA PayWay error: ${err.message}`, "ABA_INIT_ERROR", 500);
  }
}

/**
 * Verify ABA PayWay Payment
 */
export async function checkABAPayment(paymentRef: string, orderId?: string): Promise<PaymentVerificationResult> {
  console.log("[ABA] Checking payment status for:", paymentRef);

  if (!ABA_MERCHANT_ID || !ABA_SECRET_KEY) {
    throw new PaymentError("ABA PayWay not configured", "ABA_NOT_CONFIGURED", 500);
  }

  try {
    // Query ABA PayWay for payment status
    const response = await fetch(`${ABA_PAYWAY_API}/api/v1/payment/status/${paymentRef}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${ABA_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "ABA PayWay API error");
    }

    const status = result.status?.toUpperCase() || "";
    const isPaid = status === "SUCCESS" || status === "PAID" || status === "COMPLETED";

    return {
      status: isPaid ? "PAID" : "PENDING",
      paid: isPaid,
      paidAt: result.paid_at ? new Date(result.paid_at) : undefined,
      transactionId: result.transaction_id || paymentRef,
      amount: result.amount ? parseFloat(result.amount) : undefined,
      currency: result.currency || "USD",
      rawResponse: result,
    };
  } catch (err: any) {
    console.error("[ABA] Payment verification error:", err);
    return {
      status: "FAILED",
      paid: false,
      message: err.message || "ABA PayWay verification failed",
    };
  }
}

/**
 * Generate ABA PayWay Signature
 */
function generateABASignature(data: any, secretKey: string): string {
  // Sort keys alphabetically
  const sortedKeys = Object.keys(data).sort();
  
  // Create signature string
  const signatureString = sortedKeys
    .map(key => `${key}=${data[key]}`)
    .join("&");
  
  // Generate HMAC-SHA256 signature
  const signature = crypto
    .createHmac("sha256", secretKey)
    .update(signatureString)
    .digest("hex")
    .toUpperCase();
  
  return signature;
}

/**
 * Verify ABA Webhook Signature
 */
export function verifyABAWebhookSignature(payload: string, signature: string): boolean {
  if (!ABA_SECRET_KEY) return false;
  
  const expectedSignature = crypto
    .createHmac("sha256", ABA_SECRET_KEY)
    .update(payload)
    .digest("hex")
    .toUpperCase();
  
  return signature === expectedSignature;
}
