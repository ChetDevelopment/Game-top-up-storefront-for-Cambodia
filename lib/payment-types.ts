/**
 * Unified Payment Types for Ty Khai TopUp
 * Defines all payment-related types, states, and interfaces
 * Restricted to Bakong KHQR only as requested
 */

import { z } from "zod";

// ===================== Payment Method & Currency =====================
export type PaymentMethod = "BAKONG" | "ABA" | "WALLET"; // Bakong KHQR + ABA PayWay + Wallet
export type PaymentCurrency = "USD" | "KHR";

// ===================== Payment Status State Machine =====================
/**
 * Payment Status Flow:
 * PENDING → PROCESSING → DELIVERED
 *      ↓              ↓
 *   CANCELLED      FAILED
 *      ↓              ↓
 *   REFUNDED       REFUNDED
 */
export type PaymentStatus =
  | "PENDING"      // Order created, awaiting payment
  | "PROCESSING"   // Payment confirmed, processing delivery
  | "DELIVERED"    // Successfully delivered
  | "FAILED"       // Payment failed
  | "CANCELLED"    // User cancelled
  | "REFUNDED";    // Payment refunded

export const PAYMENT_STATUS_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  PENDING: ["PROCESSING", "FAILED", "CANCELLED"],
  PROCESSING: ["DELIVERED", "FAILED", "REFUNDED"],
  DELIVERED: ["REFUNDED"],
  FAILED: [],
  CANCELLED: [],
  REFUNDED: [],
};

export function canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  return PAYMENT_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

// ===================== Payment Initialization =====================
export interface InitiatePaymentArgs {
  orderNumber: string;
  amountUsd: number;
  amountKhr?: number | null;
  currency: PaymentCurrency;
  method: PaymentMethod;
  returnUrl: string;
  cancelUrl: string;
  callbackUrl: string;
  note?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerName?: string;
  metadata?: Record<string, string>;
}

export interface PaymentInitResult {
  paymentRef: string;
  redirectUrl?: string;
  qrString?: string | null;
  qrStringEnc?: string | null; // Encrypted QR for storage
  md5String?: string | null; // MD5 hash for Bakong verification
  expiresAt: Date;
  instructions?: string | null;
  deepLink?: string | null; // For mobile app deep linking
}

// ===================== Payment Verification =====================
export interface PaymentVerificationResult {
  status: PaymentStatus;
  paid: boolean;
  amount?: number;
  currency?: string;
  receiverAccount?: string;
  transactionId?: string;
  paidAt?: Date;
  rawResponse?: unknown;
  message?: string;
}

// ===================== Payment Webhook =====================
export interface WebhookPayload {
  paymentRef: string;
  transactionId?: string;
  status: PaymentStatus;
  amount?: number;
  currency?: string;
  paidAt?: string;
  signature?: string;
  raw: unknown;
}

// ===================== Payment Configuration =====================
export interface PaymentProviderConfig {
  enabled: boolean;
  displayName: string;
  currencies: PaymentCurrency[];
  minAmount?: number;
  maxAmount?: number;
  instructions?: string;
}

export const PAYMENT_PROVIDERS: Record<PaymentMethod, PaymentProviderConfig> = {
  BAKONG: {
    enabled: true,
    displayName: "Bakong (KHQR)",
    currencies: ["USD", "KHR"],
    minAmount: 0.50,
  },
  ABA: {
    enabled: true,
    displayName: "ABA PayWay",
    currencies: ["USD", "KHR"],
    minAmount: 0.50,
  },
  WALLET: {
    enabled: true,
    displayName: "Ty Khai Wallet",
    currencies: ["USD", "KHR"],
    minAmount: 0.10,
  },
};

// ===================== Validation Schemas =====================
export const CreateOrderSchema = z.object({
  gameId: z.string().min(1, "Game is required"),
  productId: z.string().min(1, "Product is required"),
  playerUid: z.string().min(4, "UID must be at least 4 characters").max(20, "UID too long"),
  serverId: z.string().optional(),
  customerEmail: z.string().email().optional(),
  customerPhone: z.string().optional(),
  paymentMethod: z.enum(["WALLET", "BAKONG", "ABA"]), // Bakong + Wallet + ABA
  currency: z.enum(["USD", "KHR"]).optional().default("USD"),
  promoCode: z.string().optional(),
  playerNickname: z.string().max(100).optional(),
  usePoints: z.number().min(0).optional().default(0),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

export const PaymentCallbackSchema = z.object({
  paymentRef: z.string().min(10, "Invalid payment reference"),
  transactionId: z.string().optional(),
  status: z.enum(["PAID", "FAILED", "PENDING", "UNPAID"]).optional(),
  amount: z.number().positive().optional(),
  currency: z.string().optional(),
});

// ===================== Error Types =====================
export class PaymentError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400,
    public details?: unknown
  ) {
    super(message);
    this.name = "PaymentError";
  }

  static configurationError(method: string): PaymentError {
    return new PaymentError(
      `${method} payment is not configured`,
      "CONFIGURATION_ERROR",
      503,
      { method }
    );
  }

  static verificationFailed(reason: string): PaymentError {
    return new PaymentError(
      `Payment verification failed: ${reason}`,
      "VERIFICATION_FAILED",
      400
    );
  }

  static amountMismatch(expected: number, paid: number, currency: string): PaymentError {
    return new PaymentError(
      `Payment amount mismatch. Expected: ${expected} ${currency}, Paid: ${paid}`,
      "AMOUNT_MISMATCH",
      400,
      { expected, paid, currency }
    );
  }
}

// ===================== Payment Logger =====================
export interface PaymentLogEntry {
  orderNumber: string;
  paymentRef: string;
  event: string;
  status?: PaymentStatus;
  amount?: number;
  currency?: string;
  provider?: string;
  details?: unknown;
  timestamp: Date;
}

export type PaymentLogger = (entry: PaymentLogEntry) => void | Promise<void>;
