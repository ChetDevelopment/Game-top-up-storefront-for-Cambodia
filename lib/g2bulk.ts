export type G2BulkUserResponse = {
  success: boolean;
  user_id: number;
  username: string;
  first_name: string;
  balance: number;
};

export type G2BulkCatalogueItem = {
  id: number;
  name: string;
  amount: number;
};

export type G2BulkPlayerCheckRequest = {
  game: string;
  user_id: string;
  server_id?: string;
};

export type G2BulkPlayerCheckResponse = {
  valid: string;
  name?: string;
  openid?: string;
};

export type G2BulkCreateOrderRequest = {
  catalogue_name: string;
  player_id: string;
  server_id?: string;
  remark?: string;
  callback_url?: string;
};

export type G2BulkCreateOrderResponse = {
  success: boolean;
  message?: string;
  order?: {
    order_id: number;
    game: string;
    catalogue: string;
    player_id: string;
    player_name?: string;
    price: number;
    status: string;
    callback_url?: string;
  };
};

export type G2BulkOrderStatusRequest = {
  order_id: number;
  game: string;
};

export type G2BulkOrderStatusResponse = {
  success: boolean;
  order?: {
    order_id: number;
    game_code: string;
    game_name: string;
    player_id: string;
    player_name?: string;
    server_id?: string;
    denom_id: string;
    price: number;
    status: string;
    is_refunded: boolean;
    remark?: string;
    message?: string;
    created_at: string;
    completed_at?: string;
  };
};

const G2BULK_API_BASE = process.env.G2BULK_API_BASE || "https://api.g2bulk.com/v1";

// Free Fire game code for G2Bulk API
const FREE_FIRE_GAME_CODE = "freefire_sgmy";

export async function checkG2BulkBalance(token: string): Promise<{ balance: number; userId: number }> {
  if (!token) throw new Error("G2Bulk token not configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(`${G2BULK_API_BASE}/getMe`, {
      headers: { "X-API-Key": token },
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const errorText = await res.text().catch(() => "Unknown error");
      console.error("[g2bulk-balance] API error:", res.status, errorText);
      throw new Error(`G2Bulk API error: ${res.status} - ${errorText}`);
    }

    const data: G2BulkUserResponse = await res.json();
    console.log("[g2bulk-balance] Response:", data);
    
    if (!data.success) {
      throw new Error("Failed to get user info from G2Bulk");
    }

    return { balance: data.balance, userId: data.user_id };
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error("G2Bulk API timeout (5s)");
    }
    throw err;
  }
}

export async function getFreeFireCatalogue(token: string): Promise<G2BulkCatalogueItem[]> {
  if (!token) throw new Error("G2Bulk token not configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(`${G2BULK_API_BASE}/games/${FREE_FIRE_GAME_CODE}/catalogue`, {
      headers: { "X-API-Key": token },
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`G2Bulk API error: ${res.status}`);

    const data = await res.json();
    if (!data.success) throw new Error("Failed to get catalogue");

    return data.catalogues || [];
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

export async function validateG2BulkPlayerId(
  token: string,
  playerId: string,
  serverId?: string
): Promise<{ valid: boolean; playerName?: string; message?: string }> {
  if (!token) throw new Error("G2Bulk token not configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(`${G2BULK_API_BASE}/games/checkPlayerId`, {
      method: "POST",
      headers: {
        "X-API-Key": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        game: FREE_FIRE_GAME_CODE,
        user_id: playerId,
        server_id: serverId,
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const error = await res.text().catch(() => "Unknown error");
      return { valid: false, message: error };
    }

    const data: G2BulkPlayerCheckResponse = await res.json();
    return {
      valid: data.valid === "valid",
      playerName: data.name,
      message: data.valid === "valid" ? undefined : "Invalid player ID",
    };
  } catch (err) {
    clearTimeout(timeout);
    return {
      valid: false,
      message: err instanceof Error ? err.message : "Network error",
    };
  }
}

export async function createG2BulkOrder(
  token: string,
  catalogueName: string,
  playerId: string,
  serverId?: string,
  idempotencyKey?: string
): Promise<{ success: boolean; orderId?: number; status?: string; message?: string }> {
  if (!token) throw new Error("G2Bulk token not configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const headers: Record<string, string> = {
      "X-API-Key": token,
      "Content-Type": "application/json",
    };

    if (idempotencyKey) {
      headers["X-Idempotency-Key"] = idempotencyKey;
    }

    const payload: G2BulkCreateOrderRequest = {
      catalogue_name: catalogueName,
      player_id: playerId,
      server_id: serverId,
    };

    console.log("[g2bulk] Creating order:", { catalogueName, playerId, serverId });

    const res = await fetch(`${G2BULK_API_BASE}/games/${FREE_FIRE_GAME_CODE}/order`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);

    const data: G2BulkCreateOrderResponse = await res.json();

    if (!data.success) {
      console.error("[g2bulk] Order failed:", data);
      return {
        success: false,
        message: data.message || `API error: ${res.status}`,
      };
    }

    console.log("[g2bulk] Order created:", { orderId: data.order?.order_id, status: data.order?.status });
    return {
      success: true,
      orderId: data.order?.order_id,
      status: data.order?.status,
      message: data.message,
    };
  } catch (err) {
    clearTimeout(timeout);
    console.error("[g2bulk] Order error:", err);
    return {
      success: false,
      message: err instanceof Error ? err.message : "Network error",
    };
  }
}

export async function checkG2BulkOrderStatus(
  token: string,
  orderId: number
): Promise<{ success: boolean; status?: string; message?: string }> {
  if (!token) throw new Error("G2Bulk token not configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(`${G2BULK_API_BASE}/games/order/status`, {
      method: "POST",
      headers: {
        "X-API-Key": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        order_id: orderId,
        game: FREE_FIRE_GAME_CODE,
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);

    const data: G2BulkOrderStatusResponse = await res.json();

    if (!data.success) {
      return {
        success: false,
        message: "Failed to check order status",
      };
    }

    return {
      success: true,
      status: data.order?.status,
      message: data.order?.message,
    };
  } catch (err) {
    clearTimeout(timeout);
    return {
      success: false,
      message: err instanceof Error ? err.message : "Network error",
    };
  }
}
