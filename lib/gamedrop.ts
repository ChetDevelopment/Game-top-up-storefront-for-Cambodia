export type BalanceResponse = {
  balance: number;
  draftBalance: number;
  isPostpaid: boolean;
  currency: { id: number; code: string };
  partnerId: number;
};

export type GameDropProduct = {
  offerId: number;
  productName: string;
  offerName: string;
  count: number;
  price: number;
  currency: string;
  isReturnDataForCustomer: boolean;
};

export type PlayerCheckRequest = {
  offerId: number;
  gameUserId: string;
  gameServerId?: string;
};

export type CreateOrderRequest = {
  offerId: number;
  gameUserId: string;
  gameServerId?: string;
  idempotencyKey?: string;
  customerEmail?: string;
};

export type CreateOrderResponse = {
  status: string;
  transactionId?: string;
  key?: string;
  message?: string;
};

export async function checkGameDropBalance(token: string): Promise<BalanceResponse> {
  if (!token) throw new Error("GameDrop token not configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch("https://partner.gamesdrop.io/api/v1/offers/balance", {
      headers: { Authorization: token },
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const errorText = await res.text().catch(() => "Unknown error");
      console.error("[gamedrop-balance] API error:", res.status, errorText);
      throw new Error(`GameDrop API error: ${res.status} - ${errorText}`);
    }
    
    const data = await res.json();
    console.log("[gamedrop-balance] Response:", data);
    
    // Handle different response formats
    if (typeof data.balance === 'undefined') {
      console.warn("[gamedrop-balance] No balance field in response");
    }
    
    return data;
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error("GameDrop API timeout (5s)");
    }
    throw err;
  }
}

/**
 * Validate player UID with GameDrop
 * Returns player nickname if valid
 */
export async function validatePlayerId(
  token: string,
  offerId: number,
  gameUserId: string,
  gameServerId?: string
): Promise<{ valid: boolean; playerName?: string; message?: string }> {
  if (!token) throw new Error("GameDrop token not configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch("https://partner.gamesdrop.io/api/v1/offers/check-game-data", {
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        offerId,
        gameUserId,
        gameServerId,
      } as PlayerCheckRequest),
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const error = await res.text().catch(() => "Unknown error");
      return { valid: false, message: error };
    }

    const data = await res.json();
    return {
      valid: data.status === "VALID",
      playerName: data.playerName || data.nickname,
      message: data.message,
    };
  } catch (err) {
    clearTimeout(timeout);
    return {
      valid: false,
      message: err instanceof Error ? err.message : "Network error",
    };
  }
}

/**
 * Create order (deliver top-up to player)
 * This is how GameDrop gets the player UID and delivers to their account
 */
export async function createGameDropOrder(
  token: string,
  offerId: number,
  gameUserId: string,
  gameServerId?: string,
  idempotencyKey?: string,
  customerEmail?: string
): Promise<CreateOrderResponse> {
  if (!token) throw new Error("GameDrop token not configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const payload: CreateOrderRequest = {
      offerId,
      gameUserId,  // ← THIS IS HOW GAMEDROP GETS THE PLAYER UID
      gameServerId,
      idempotencyKey, // Prevent duplicate deliveries
      customerEmail,
    };

    console.log("[gamedrop] Creating order:", { offerId, gameUserId, gameServerId });

    const res = await fetch("https://partner.gamesdrop.io/api/v1/offers/create-order", {
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);

    const data = await res.json();
    
    if (!res.ok) {
      console.error("[gamedrop] Order failed:", data);
      return {
        status: "FAILED",
        message: data.message || `API error: ${res.status}`,
      };
    }

    console.log("[gamedrop] Order created:", { status: data.status, transactionId: data.transactionId });
    return {
      status: data.status,
      transactionId: data.transactionId,
      key: data.key, // For gift cards
      message: data.message,
    };
  } catch (err) {
    clearTimeout(timeout);
    console.error("[gamedrop] Order error:", err);
    return {
      status: "FAILED",
      message: err instanceof Error ? err.message : "Network error",
    };
  }
}
