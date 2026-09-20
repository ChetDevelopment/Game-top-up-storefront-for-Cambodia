/**
 * API Test Client for Ty Khai TopUp
 * Provides typed methods for all API endpoints
 */

import crypto from 'crypto';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || 'admin@tykhai.com';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'admin123';

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
}

export interface ApiResponse<T = unknown> {
  status: number;
  data: T;
  headers: Record<string, string>;
  duration: number;
}

export interface OrderCreateRequest {
  gameId: string;
  productId: string;
  playerUid: string;
  serverId?: string;
  playerNickname?: string;
  customerEmail: string;
  customerPhone?: string;
  paymentMethod: 'BAKONG' | 'WALLET';
  currency: 'USD' | 'KHR';
  promoCode?: string;
  usePoints?: number;
  idempotencyKey?: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  gameId: string;
  productId: string;
  playerUid: string;
  customerEmail: string;
  amountUsd: number;
  status: string;
  paymentMethod: string;
  paymentRef?: string;
  qrString?: string;
  createdAt: string;
  paidAt?: string;
  deliveredAt?: string;
}

export interface AdminLoginResponse {
  token: string;
  admin: {
    id: string;
    email: string;
    role: string;
  };
}

export class TestClient {
  private adminToken: string | null = null;
  private requestCount = 0;
  private totalDuration = 0;

  async request<T>(endpoint: string, options: ApiRequestOptions = {}): Promise<ApiResponse<T>> {
    const startTime = Date.now();
    const url = `${BASE_URL}${endpoint}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.adminToken && endpoint.startsWith('/api/admin')) {
      headers['Authorization'] = `Bearer ${this.adminToken}`;
    }

    const config: RequestInit = {
      method: options.method || 'GET',
      headers,
    };

    if (options.body && options.method !== 'GET') {
      config.body = JSON.stringify(options.body);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout || 30000);

    try {
      const response = await fetch(url, { ...config, signal: controller.signal });
      clearTimeout(timeout);

      const data = await response.json();
      const duration = Date.now() - startTime;

      this.requestCount++;
      this.totalDuration += duration;

      return {
        status: response.status,
        data: data as T,
        headers: Object.fromEntries(response.headers.entries()),
        duration,
      };
    } catch (error) {
      clearTimeout(timeout);
      throw new Error(`Request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async adminLogin(email = ADMIN_EMAIL, password = ADMIN_PASSWORD): Promise<AdminLoginResponse> {
    const response = await this.request<AdminLoginResponse>('/api/admin/auth', {
      method: 'POST',
      body: { email, password },
    });

    if (response.status !== 200) {
      throw new Error(`Admin login failed: ${response.status}`);
    }

    this.adminToken = response.data.token;
    return response.data;
  }

  async createOrder(orderData: OrderCreateRequest): Promise<ApiResponse<{
    orderNumber: string;
    redirectUrl: string;
    qr?: string;
    qrEnc?: string | null;
    paymentRef: string;
    md5Hash?: string;
    expiresAt: string;
    instructions: string;
    amount: number;
    currency: string;
  }>> {
    return this.request('/api/orders', {
      method: 'POST',
      body: orderData,
      timeout: 15000,
    });
  }

  async getOrder(orderNumber: string): Promise<ApiResponse<Order>> {
    return this.request(`/api/orders/${orderNumber}`);
  }

  async verifyPayment(md5Hash: string): Promise<ApiResponse<{
    status: string;
    paid: boolean;
    message?: string;
    amount?: number;
    currency?: string;
    transactionId?: string;
  }>> {
    return this.request('/api/payment/status', {
      method: 'POST',
      body: { md5Hash },
    });
  }

  async simulatePayment(orderNumber: string, amount: number): Promise<ApiResponse<{
    success: boolean;
    orderId: string;
    newStatus: string;
    message?: string;
  }>> {
    return this.request('/api/payment/simulate', {
      method: 'POST',
      headers: {
        'x-allow-test-payment': 'true', // Allow test payments
      },
      body: { orderNumber, amount },
    });
  }

  async getAdminOrders(params?: {
    status?: string;
    q?: string;
    page?: number;
    perPage?: number;
  }): Promise<ApiResponse<{
    orders: Order[];
    total: number;
    page: number;
    perPage: number;
    totalPages: number;
  }>> {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.q) searchParams.set('q', params.q);
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.perPage) searchParams.set('perPage', params.perPage.toString());

    const queryString = searchParams.toString();
    return this.request(`/api/admin/orders${queryString ? `?${queryString}` : ''}`);
  }

  async refundOrder(orderNumber: string, reason?: string): Promise<ApiResponse<{
    success: boolean;
    refundId: string;
  }>> {
    return this.request(`/api/admin/orders/${orderNumber}`, {
      method: 'PATCH',
      body: { action: 'refund', reason },
    });
  }

  async getDashboardStats(): Promise<ApiResponse<{
    totalRevenue: number;
    todayRevenue: number;
    totalOrders: number;
    pendingOrders: number;
    deliveredOrders: number;
    failedOrders: number;
  }>> {
    return this.request('/api/admin/stats/revenue');
  }

  async getAuditLogs(params?: {
    page?: number;
    perPage?: number;
    action?: string;
  }): Promise<ApiResponse<{
    logs: Array<{
      id: string;
      adminEmail?: string;
      action: string;
      targetType?: string;
      targetId?: string;
      details?: string;
      createdAt: string;
    }>;
    total: number;
  }>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.perPage) searchParams.set('perPage', params.perPage.toString());
    if (params?.action) searchParams.set('action', params.action);

    const queryString = searchParams.toString();
    return this.request(`/api/admin/audit-logs${queryString ? `?${queryString}` : ''}`);
  }

  async getGames(): Promise<ApiResponse<Array<{
    id: string;
    slug: string;
    name: string;
    active: boolean;
    featured: boolean;
  }>>> {
    return this.request('/api/games');
  }

  async getProducts(gameId: string): Promise<ApiResponse<Array<{
    id: string;
    gameId: string;
    name: string;
    amount: number;
    priceUsd: number;
    active: boolean;
  }>>> {
    return this.request(`/api/products?gameId=${gameId}`);
  }

  generateIdempotencyKey(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  generateTestEmail(): string {
    return `test.${Date.now()}@tykhai-test.com`;
  }

  generateTestUid(): string {
    return Math.random().toString(36).substring(2, 10);
  }

  getStats(): { requestCount: number; avgDuration: number } {
    return {
      requestCount: this.requestCount,
      avgDuration: this.requestCount > 0 ? this.totalDuration / this.requestCount : 0,
    };
  }

  resetStats(): void {
    this.requestCount = 0;
    this.totalDuration = 0;
  }
}

export const testClient = new TestClient();
