// Generate human-friendly order number: TY-XXXXXX
export function generateOrderNumber(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let n = "";
  for (let i = 0; i < 6; i++) {
    n += chars[Math.floor(Math.random() * chars.length)];
  }
  return `TY-${n}`;
}

export function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export function formatKhr(amount: number): string {
  return `${Math.round(amount).toLocaleString("en-US")} ៛`;
}

export function calcKhr(usd: number, rate: number = 4100): number {
  return Math.round(usd * rate / 100) * 100; // round to nearest 100 KHR
}

  // Validate UID format - VERY LENIENT: accept almost anything 4-64 chars
  // This prevents false negatives while still blocking empty/too-short inputs
  export function isValidUid(uid: string): boolean {
    if (typeof uid !== "string") return false;
    const trimmed = uid.trim();
    // Accept any characters, 4-64 length (very permissive)
    // Only reject if empty or too short (< 4 chars)
    return trimmed.length >= 4 && trimmed.length <= 64;
  }

// Validate server zone id
export function isValidServerId(sid: string): boolean {
  return /^\d{1,5}$/.test(sid.trim());
}

// Validate player nickname - prevent XSS/injection
// Allow: letters, numbers, spaces, common gaming characters
// Length: 2-30 characters
export function isValidNickname(nickname: string): boolean {
  if (typeof nickname !== "string") return false;
  const trimmed = nickname.trim();
  if (trimmed.length < 2 || trimmed.length > 30) return false;
  
  // Only allow safe characters for nicknames
  // Letters (any language), numbers, spaces, dots, dashes, underscores
  // NO < > " ' ; ( ) & + \ etc.
  return /^[\w\s.\-]{2,30}$/.test(trimmed);
}
