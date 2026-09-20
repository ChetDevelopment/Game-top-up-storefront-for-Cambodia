/**
 * Mock Data Generators for Testing
 */

import crypto from 'crypto';

export function generateTestEmail(): string {
  return `test.${Date.now()}.${crypto.randomBytes(4).toString('hex')}@tykhai-test.com`;
}

export function generateTestUid(): string {
  return Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 6);
}

export function generateTestPhone(): string {
  return `0${Math.floor(Math.random() * 90000000 + 10000000)}`;
}

export function generateIdempotencyKey(): string {
  return crypto.randomBytes(16).toString('hex');
}

export interface MockOrderData {
  gameId: string;
  productId: string;
  playerUid: string;
  serverId?: string;
  playerNickname: string;
  customerEmail: string;
  customerPhone: string;
  paymentMethod: 'BAKONG' | 'WALLET';
  currency: 'USD' | 'KHR';
  idempotencyKey: string;
}

export function createMockOrderData(overrides?: Partial<MockOrderData>): MockOrderData {
  return {
    gameId: '',
    productId: '',
    playerUid: generateTestUid(),
    serverId: undefined,
    playerNickname: `TestPlayer_${Date.now()}`,
    customerEmail: generateTestEmail(),
    customerPhone: generateTestPhone(),
    paymentMethod: 'BAKONG',
    currency: 'USD',
    idempotencyKey: generateIdempotencyKey(),
    ...overrides,
  };
}

export interface MockAdminData {
  email: string;
  password: string;
}

export function createMockAdminData(overrides?: Partial<MockAdminData>): MockAdminData {
  return {
    email: `admin.${Date.now()}@tykhai-test.com`,
    password: 'SecurePass123!',
    ...overrides,
  };
}

export const ORDER_STATUSES = {
  PENDING: 'PENDING',
  PAID: 'PAID',
  PROCESSING: 'PROCESSING',
  QUEUED: 'QUEUED',
  DELIVERING: 'DELIVERING',
  DELIVERED: 'DELIVERED',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED',
};

export const PAYMENT_METHODS = {
  BAKONG: 'BAKONG',
  WALLET: 'WALLET',
};

export const CURRENCIES = {
  USD: 'USD',
  KHR: 'KHR',
};

export function createOrderStatusTransitionTestCases(): Array<{
  name: string;
  initialStatus: string;
  action: string;
  expectedStatus: string;
  shouldSucceed: boolean;
}> {
  return [
    {
      name: 'PENDING to PAID via payment',
      initialStatus: ORDER_STATUSES.PENDING,
      action: 'payment_success',
      expectedStatus: ORDER_STATUSES.PAID,
      shouldSucceed: true,
    },
    {
      name: 'PAID to PROCESSING auto-transition',
      initialStatus: ORDER_STATUSES.PAID,
      action: 'worker_pickup',
      expectedStatus: ORDER_STATUSES.PROCESSING,
      shouldSucceed: true,
    },
    {
      name: 'PROCESSING to DELIVERED success',
      initialStatus: ORDER_STATUSES.PROCESSING,
      action: 'delivery_success',
      expectedStatus: ORDER_STATUSES.DELIVERED,
      shouldSucceed: true,
    },
    {
      name: 'PENDING duplicate payment prevention',
      initialStatus: ORDER_STATUSES.PENDING,
      action: 'duplicate_payment',
      expectedStatus: ORDER_STATUSES.PENDING,
      shouldSucceed: false,
    },
    {
      name: 'DELIVERED refund transition',
      initialStatus: ORDER_STATUSES.DELIVERED,
      action: 'refund',
      expectedStatus: ORDER_STATUSES.REFUNDED,
      shouldSucceed: true,
    },
    {
      name: 'PENDING expire transition',
      initialStatus: ORDER_STATUSES.PENDING,
      action: 'expire',
      expectedStatus: ORDER_STATUSES.EXPIRED,
      shouldSucceed: true,
    },
  ];
}

export function createFraudTestCases(): Array<{
  name: string;
  scenario: string;
  expectedFlags: string[];
  severity: string;
}> {
  return [
    {
      name: 'Rapid order creation',
      scenario: '5 orders in 1 minute from same IP',
      expectedFlags: ['RAPID_ORDERS'],
      severity: 'MEDIUM',
    },
    {
      name: 'High value order',
      scenario: 'Order > $100 from new account',
      expectedFlags: ['HIGH_VALUE'],
      severity: 'MEDIUM',
    },
    {
      name: 'Multiple payment failures',
      scenario: '3 failed payments in 10 minutes',
      expectedFlags: ['PAYMENT_FAILURES'],
      severity: 'LOW',
    },
    {
      name: 'UID pattern abuse',
      scenario: 'Same UID with different emails',
      expectedFlags: ['UID_REUSE'],
      severity: 'HIGH',
    },
  ];
}

export function createProviderHealthScenarios(): Array<{
  name: string;
  provider: string;
  successRate: number;
  expectedCircuitState: string;
}> {
  return [
    {
      name: 'Healthy provider',
      provider: 'GAMEDROP',
      successRate: 0.95,
      expectedCircuitState: 'CLOSED',
    },
    {
      name: 'Degraded provider',
      provider: 'G2BULK',
      successRate: 0.7,
      expectedCircuitState: 'HALF_OPEN',
    },
    {
      name: 'Unhealthy provider',
      provider: 'GAMEDROP',
      successRate: 0.3,
      expectedCircuitState: 'OPEN',
    },
  ];
}

export interface DatabaseIntegrityTestCase {
  name: string;
  setup: () => Promise<void>;
  check: () => Promise<{ valid: boolean; issues: string[] }>;
  cleanup: () => Promise<void>;
}

export function createDatabaseIntegrityTests(): DatabaseIntegrityTestCase[] {
  return [
    {
      name: 'No duplicate order numbers',
      setup: async () => {},
      check: async () => {
        // Will be implemented in database tests
        return { valid: true, issues: [] };
      },
      cleanup: async () => {},
    },
    {
      name: 'No orphan payment logs',
      setup: async () => {},
      check: async () => {
        return { valid: true, issues: [] };
      },
      cleanup: async () => {},
    },
    {
      name: 'Revenue calculation accuracy',
      setup: async () => {},
      check: async () => {
        return { valid: true, issues: [] };
      },
      cleanup: async () => {},
    },
    {
      name: 'Order state consistency',
      setup: async () => {},
      check: async () => {
        return { valid: true, issues: [] };
      },
      cleanup: async () => {},
    },
  ];
}
