"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { isValidUid, isValidServerId, formatUsd } from "@/lib/utils";
import { useCurrency } from "@/lib/currency";
import Link from "next/link";
import { QrCode, ArrowRight, Lock, Check, Smartphone, Search, UserRoundCheck, ShieldCheck, AlertCircle, Tag, Loader2, Crown, Zap, Dices, Heart } from "lucide-react";
import Countdown from "./Countdown";
import SquadPoolUI from "./SquadPoolUI";

  // Games that support automatic nickname lookup via /api/games/check-id
// Note: honkai-star-rail is NOT supported by camrapidx.com
const LOOKUP_SLUGS = new Set(["mobile-legends", "free-fire", "genshin-impact"]);
// MLBB & similar games that use a separate "Zone ID" instead of a server dropdown
const ZONE_ID_SLUGS = new Set(["mobile-legends"]);

interface Product {
  id: string;
  name: string;
  amount: number;
  bonus: number;
  priceUsd: number;
  resellerPriceUsd: number | null;
  officialPriceUsd: number | null;
  salePriceUsd: number | null;
  saleEndsAt: string | null;
  isMysteryBox: boolean;
  badge: string | null;
  imageUrl: string | null;
}

interface Game {
  id: string;
  slug: string;
  name: string;
  currencyName: string;
  uidLabel: string;
  uidExample: string | null;
  requiresServer: boolean;
  servers: string[];
}

export default function TopUpForm({ game, products }: { game: Game; products: Product[] }) {
  const { format, currency, toKhr } = useCurrency();
  const [user, setUser] = useState<any>(null);
  const [boughtProductIds, setBoughtProductIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(products[0]?.id ?? null);
  const [uid, setUid] = useState("");
  const [serverId, setServerId] = useState(
    ZONE_ID_SLUGS.has(game.slug) ? "" : (game.servers[0] ?? "")
  );
  const [method, setMethod] = useState<"BAKONG" | "ABA" | "WALLET">("BAKONG");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check for user session
  useEffect(() => {
    fetch("/api/user/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.user) {
          setUser(data.user);
          setBoughtProductIds(data.boughtProductIds || []);
        }
      })
      .catch(() => {});
  }, []);

  // Promo code state
  const [promoInput, setPromoInput] = useState("");
  const [promoApplied, setPromoApplied] = useState<{
    code: string;
    discountUsd: number;
    finalAmountUsd: number;
    discountType: string;
    discountValue: number;
  } | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [pointsInput, setPointsInput] = useState("");
  const [walletActive, setWalletActive] = useState(false);

  useEffect(() => {
    fetch("/api/user/wishlist")
      .then(r => r.json())
      .then(data => setWishlist(data.map((w: any) => w.productId)))
      .catch(() => {});
  }, []);

  async function toggleWishlist(productId: string) {
    if (!user) return;
    if (wishlist.includes(productId)) {
      await fetch("/api/user/wishlist", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      setWishlist(prev => prev.filter(id => id !== productId));
    } else {
      await fetch("/api/user/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      setWishlist(prev => [...prev, productId]);
    }
  }

  // ── Nickname auto-lookup (debounced 800 ms) ──
  const supportsLookup = LOOKUP_SLUGS.has(game.slug);
  const useZoneField = ZONE_ID_SLUGS.has(game.slug);

  type NicknameStatus = "idle" | "checking" | "verified" | "not_found";
  const [nicknameStatus, setNicknameStatus] = useState<NicknameStatus>("idle");
  const [nickname, setNickname] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Track if we need to refresh based on input change to avoid loop
  const [needsRefresh, setNeedsRefresh] = useState(false);

  useEffect(() => {
    setNeedsRefresh(true);
  }, [uid, serverId]);

  useEffect(() => {
    if (!supportsLookup || !needsRefresh) {
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();

    const uidValid = isValidUid(uid);
    const serverValid = !useZoneField || serverId.trim().length > 0;

    if (!uidValid || !serverValid) {
      setNicknameStatus("idle");
      setNickname(null);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setNicknameStatus("checking");
      setNeedsRefresh(false);
      setNickname(null);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/games/check-id", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug: game.slug,
            uid: uid.trim(),
            serverId: serverId.trim() || undefined,
          }),
          signal: controller.signal,
        });
        const data = await res.json();
        if (controller.signal.aborted) return;

        if (data.success && data.name) {
          setNickname(data.name);
          setNicknameStatus("verified");
        } else {
          setNicknameStatus("not_found");
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setNicknameStatus("not_found");
        }
      }
    }, 800);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [uid, serverId, game.slug, supportsLookup, useZoneField, needsRefresh]);

  const selectedProduct = products.find((p) => p.id === selected);
  const needsServer = game.requiresServer || useZoneField;
  const canSubmit = !!selected && isValidUid(uid) && (!needsServer || serverId.trim().length > 0);

  async function applyPromo() {
    if (!promoInput.trim() || !selectedProduct) return;
    setPromoLoading(true);
    setPromoError(null);
    setPromoApplied(null);
    try {
      const res = await fetch("/api/promo-codes/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: promoInput.trim(),
          orderAmountUsd: selectedProduct.priceUsd,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Invalid promo code");
      setPromoApplied(data);
    } catch (err: any) {
      setPromoError(err.message);
    } finally {
      setPromoLoading(false);
    }
  }

  function removePromo() {
    setPromoApplied(null);
    setPromoInput("");
    setPromoError(null);
  }

  const basePrice = selectedProduct?.priceUsd ?? 0;
  const priceAfterPromo = promoApplied ? promoApplied.finalAmountUsd : basePrice;
  
  // Reseller logic
  const isReseller = user?.role === "RESELLER";
  const resellerPrice = selectedProduct?.resellerPriceUsd;
  
  // Member discount logic: only if logged in, NOT a reseller, and HAS NOT bought THIS product before
  const canGetMemberDiscount = !isReseller && user && selected && !boughtProductIds.includes(selected);
  const memberDiscountUsd = canGetMemberDiscount ? priceAfterPromo * 0.02 : 0;
  
  let effectivePrice = priceAfterPromo - memberDiscountUsd;
  if (isReseller && resellerPrice) {
    effectivePrice = resellerPrice;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);

    const paymentMethod = walletActive ? "WALLET" : method;
    const usePoints = walletActive && pointsInput ? Math.min(Number(pointsInput) || 0, user?.pointsBalance || 0) : 0;

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId: game.id,
          productId: selected,
          playerUid: uid.trim(),
          serverId: needsServer ? serverId.trim() : undefined,
          paymentMethod,
          currency: currency,
          promoCode: promoApplied?.code || undefined,
          playerNickname: nickname || undefined,
          usePoints,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create order");

      if (data.walletPaid) {
        window.location.href = data.redirectUrl;
      } else if (data.pendingWalletPayment) {
        setMethod("BAKONG");
        setWalletActive(false);
        setError("Insufficient wallet balance. Please add funds or use KHQR payment.");
        setSubmitting(false);
      } else {
        window.location.href = data.redirectUrl;
      }
    } catch (err: any) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="lg:grid lg:grid-cols-[1fr_340px] lg:gap-8">
        <div className="space-y-8">
          {/* Step 1: Pick package */}
          <div className="fade-up">
            <div className="flex items-center gap-3 mb-4">
              <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-royal-primary to-royal-accent font-display font-bold text-black shadow-lg shadow-royal-primary/40">
                <span className="absolute inset-0 rounded-full bg-royal-primary/40 animate-ping" />
                <span className="relative">1</span>
              </div>
              <h2 className="font-display text-xl font-bold">Choose Package</h2>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {products.map((p) => {
                const isSelected = selected === p.id;
                const hasSale = p.salePriceUsd && p.saleEndsAt && new Date(p.saleEndsAt) > new Date();
                const currentPrice = hasSale ? p.salePriceUsd! : p.priceUsd;

                return (
                  <div
                    key={p.id}
                    onClick={() => setSelected(p.id)}
                    className={`group relative overflow-hidden text-left rounded-lg border p-2.5 transition-all duration-300 hover:-translate-y-0.5 flex flex-col items-center justify-center text-center cursor-pointer ${
                      isSelected
                        ? "border-royal-primary bg-royal-primary/10 shadow-lg shadow-royal-primary/20 ring-1 ring-royal-primary/30"
                        : "border-royal-border bg-royal-card hover:border-royal-primary/30"
                    }`}
                  >
                    {isSelected && (
                      <span className="absolute top-1 left-1 flex h-4 w-4 items-center justify-center rounded-full bg-royal-primary text-black shadow-md z-10">
                        <Check className="h-2.5 w-2.5" strokeWidth={5} />
                      </span>
                    )}

                    <div className="absolute -top-0.5 right-1 z-10 flex flex-col items-end gap-1">
                      {hasSale && <Countdown targetDate={p.saleEndsAt!} />}
                      {p.badge && (
                        <span className="rounded-full bg-gradient-to-r from-royal-accent to-royal-gold px-1.5 py-0.5 text-[7px] font-black uppercase tracking-tighter text-black shadow-sm">
                          {p.badge}
                        </span>
                      )}
                      {user && (
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleWishlist(p.id); }}
                          className={`p-1 rounded-full transition-all ${wishlist.includes(p.id) ? "text-red-500 bg-red-500/20" : "text-royal-muted hover:text-red-400 bg-royal-bg/50"}`}
                        >
                          <Heart className={`h-3.5 w-3.5 ${wishlist.includes(p.id) ? "fill-current" : ""}`} />
                        </button>
                      )}
                    </div>

                    {p.imageUrl && (
                      <div className="flex justify-center mb-2">
                        <img src={p.imageUrl} alt="" className="h-8 w-8 object-contain group-hover:scale-110 transition-transform duration-300" />
                      </div>
                    )}

                    <div className={`font-display font-bold text-lg sm:text-xl leading-none transition-colors ${
                      isSelected ? "text-royal-primary" : "text-royal-text"
                    }`}>
                      {p.amount > 0 ? p.amount.toLocaleString() : p.name}
                    </div>
                    
                    {p.amount > 0 && (
                      <div className="text-[8px] text-royal-muted uppercase tracking-wider mt-0.5 mb-1">
                        {game.currencyName}
                      </div>
                    )}

                    {p.bonus > 0 && (
                      <div className="text-[8px] text-royal-accent font-black uppercase mb-1">
                        + {p.bonus} bonus
                      </div>
                    )}

                    {p.officialPriceUsd && p.officialPriceUsd > currentPrice && (
                      <div className="mb-1 px-1.5 py-0.5 rounded bg-royal-primary/10 border border-royal-primary/20 text-[7px] font-black text-royal-primary uppercase tracking-tighter">
                        Save {Math.round(((p.officialPriceUsd - currentPrice) / p.officialPriceUsd) * 100)}% vs Official
                      </div>
                    )}

                    <div className={`mt-auto w-full pt-1.5 border-t font-mono font-bold text-xs transition-colors ${
                      isSelected ? "border-royal-primary/20 text-royal-primary" : "border-royal-border/40 text-royal-primary"
                    }`}>
                      {hasSale && (
                        <span className="text-[10px] text-royal-muted line-through mr-2 opacity-50">
                          ${p.priceUsd.toFixed(2)}
                        </span>
                      )}
                      {format(currentPrice)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Step 2: UID */}
          <div className="fade-up" style={{ animationDelay: "80ms" }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-royal-primary to-royal-accent font-display font-bold text-black shadow-lg shadow-royal-primary/40">
                2
              </div>
              <h2 className="font-display text-xl font-bold">Enter Account Info</h2>
            </div>

            <div className="card p-5 sm:p-6 space-y-4">
              <div className={useZoneField ? "grid grid-cols-[1fr_120px] sm:grid-cols-[1fr_140px] gap-3" : ""}>
                <div>
                  <label className="label">{useZoneField ? "User ID" : game.uidLabel}</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={uid}
                    onChange={(e) => setUid(e.target.value)}
                    placeholder={useZoneField ? "12345678" : (game.uidExample || "Enter your player ID")}
                    className="input font-mono text-lg py-3.5"
                    required
                  />
                  {uid && !isValidUid(uid) && (
                    <p className="text-xs text-red-400 mt-1">UID should be 4–64 characters (letters, numbers, dash, underscore).</p>
                  )}
                </div>
                {useZoneField && (
                  <div>
                    <label className="label">Zone ID</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={serverId}
                      onChange={(e) => setServerId(e.target.value)}
                      placeholder="1234"
                      className="input font-mono text-lg py-3.5"
                      required
                    />
                  </div>
                )}
              </div>

              {game.requiresServer && !useZoneField && (
                <div>
                  <label className="label">Server</label>
                  <select value={serverId} onChange={(e) => setServerId(e.target.value)} className="input" required>
                    {game.servers.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              )}

                {supportsLookup && nicknameStatus !== "idle" && (
                  <div className="pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
                    {nicknameStatus === "checking" && (
                      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-royal-primary/5 border border-royal-primary/20">
                        <Loader2 className="h-4 w-4 text-royal-primary animate-spin" strokeWidth={3} />
                        <span className="text-sm font-bold text-royal-primary tracking-wide uppercase italic">
                          Synchronizing with {game.name} Servers...
                        </span>
                      </div>
                    )}
                    {nicknameStatus === "verified" && nickname && (
                      <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/30 shadow-[0_0_15px_-5px_rgba(34,197,94,0.3)]">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                            <UserRoundCheck className="h-5 w-5 text-green-400" />
                          </div>
                          <div>
                            <div className="text-[10px] font-black text-green-500/60 uppercase tracking-widest">Account Verified</div>
                            <div className="font-display font-black text-green-100 text-lg leading-tight uppercase tracking-tight">{nickname}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-green-500 text-black font-black text-[9px] uppercase tracking-tighter">
                          <ShieldCheck className="h-3 w-3" strokeWidth={3} />
                          Active
                        </div>
                      </div>
                    )}
                    {nicknameStatus === "not_found" && (
                      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30">
                        <AlertCircle className="h-5 w-5 text-red-400" />
                        <div>
                          <div className="text-[10px] font-black text-red-500/60 uppercase tracking-widest">Verification Failed</div>
                          <div className="text-xs text-red-200 font-medium italic">Player not found. Please verify your ID & Zone.</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}


            </div>
          </div>

          {/* Promo Code */}
          <div className="fade-up" style={{ animationDelay: "140ms" }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-royal-surface border border-royal-border text-royal-muted">
                <Tag className="h-3.5 w-3.5" strokeWidth={2.5} />
              </div>
              <h3 className="font-display text-sm font-semibold text-royal-muted">Have a promo code?</h3>
            </div>
            {promoApplied ? (
              <div className="flex items-center gap-3 rounded-xl border border-green-500/40 bg-green-500/10 p-3">
                <Tag className="h-4 w-4 text-green-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="font-mono font-bold text-green-400 text-sm">{promoApplied.code}</span>
                  <span className="text-xs text-green-400/80 ml-2">−{format(promoApplied.discountUsd)} off</span>
                </div>
                <button type="button" onClick={removePromo} className="text-xs text-royal-muted hover:text-red-400">Remove</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={promoInput}
                  onChange={(e) => { setPromoInput(e.target.value.toUpperCase()); setPromoError(null); }}
                  placeholder="Enter code"
                  className="input font-mono uppercase text-sm flex-1"
                />
                <button type="button" onClick={applyPromo} disabled={promoLoading || !promoInput.trim() || !selectedProduct} className="btn-ghost text-sm">
                  {promoLoading ? "..." : "Apply"}
                </button>
              </div>
            )}
            {promoError && <p className="mt-2 text-xs text-red-400">{promoError}</p>}
          </div>

          {/* Step 3: Payment */}
          <div className="fade-up" style={{ animationDelay: "160ms" }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-royal-primary to-royal-accent font-display font-bold text-black shadow-lg shadow-royal-primary/40">
                3
              </div>
              <h2 className="font-display text-xl font-bold">Choose Payment</h2>
            </div>
            {selectedProduct && !selectedProduct.isMysteryBox && (
              <div className="flex items-center gap-2 px-3 py-2 mb-4 rounded-lg bg-blue-500/10 border border-blue-500/30 text-sm text-blue-300">
                <Zap size={14} className="text-blue-400" />
                <span>Estimated delivery: <strong>~60 seconds</strong> after payment</span>
              </div>
            )}
            {user && (user.walletBalance > 0 || user.pointsBalance > 0) && (
              <button
                type="button"
                onClick={() => { setWalletActive(!walletActive); setMethod(walletActive ? "BAKONG" : "WALLET"); }}
                className={`group relative rounded-xl border-2 p-4 sm:p-5 text-left transition-all duration-300 w-full mb-4 ${
                  walletActive
                    ? "border-royal-accent bg-gradient-to-br from-royal-accent/15 to-royal-gold/5 shadow-lg shadow-royal-accent/20"
                    : "border-royal-border bg-royal-card hover:border-royal-accent/50"
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-royal-accent/20 to-royal-gold/10 border border-royal-accent/30 text-royal-accent transition-transform group-hover:scale-110">
                    <Crown className="h-6 w-6" strokeWidth={2} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">Wallet</span>
                      <span className="rounded-full bg-royal-accent/10 px-2 py-0.5 text-[10px] font-bold text-royal-accent">BEST DEAL</span>
                    </div>
                    <div className="text-xs text-royal-muted">
                      Balance: ${user.walletBalance?.toFixed(2) || "0.00"} · {user.pointsBalance || 0} points
                    </div>
                  </div>
                  <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${walletActive ? "border-royal-accent bg-royal-accent" : "border-royal-border"}`}>
                    {walletActive && <Check className="h-3 w-3 text-black" strokeWidth={3} />}
                  </div>
                </div>
              </button>
            )}

            {walletActive && (
              <div className="mb-4 p-4 rounded-xl bg-royal-surface/50 border border-royal-border">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-royal-muted">Use Points (100 pts = $1)</span>
                  <span className="text-xs text-royal-muted">Max: {user?.pointsBalance || 0} pts</span>
                </div>
                <input
                   type="number"
                   value={pointsInput}
                   onChange={(e) => {
                     const val = parseInt(e.target.value);
                     if (val < 0) return;
                     setPointsInput(e.target.value);
                   }}
                   placeholder="Enter points to redeem"
                   className="input font-mono text-sm"
                   min={0}
                   max={user?.pointsBalance || 0}
                   step={1}
                 />
                {pointsInput && Number(pointsInput) > 0 && (
                  <div className="mt-2 text-xs text-royal-accent font-bold">
                    −${(Number(pointsInput) / 100).toFixed(2)} discount
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => { setMethod("BAKONG"); setWalletActive(false); }}
              className={`group relative rounded-xl border-2 p-4 sm:p-5 text-left transition-all duration-300 w-full mb-4 ${
                !walletActive && method === "BAKONG"
                  ? "border-royal-primary bg-gradient-to-br from-royal-primary/15 to-royal-accent/5 shadow-lg shadow-royal-primary/20"
                  : "border-royal-border bg-royal-card hover:border-royal-primary/50"
              }`}
             >
               <div className="flex items-center gap-4">
                 <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white border border-royal-primary/30 overflow-hidden transition-transform group-hover:scale-110 shrink-0">
                   <img 
                     src="/bakong-logo.png?v=1" 
                     alt="Bakong KHQR" 
                     className="h-10 w-10 object-contain"
                   />
                 </div>
                 <div className="flex-1 min-w-0">
                   <div className="flex items-center gap-2">
                     <span className="font-semibold text-base">KHQR · Bakong Payment</span>
                     <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-bold text-green-400 whitespace-nowrap">INSTANT</span>
                   </div>
                   <div className="text-xs text-royal-muted mt-0.5">Scan QR with Bakong, ABA, Wing & more.</div>
                 </div>
                 <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 ${method === "BAKONG" ? "border-royal-primary bg-royal-primary" : "border-royal-border"}`}>
                   {method === "BAKONG" && <Check className="h-3 w-3 text-black" strokeWidth={3} />}
                 </div>
               </div>
             </button>

              {/* ABA PayWay Payment Option - COMING SOON */}
              <button
                type="button"
                disabled={true}
                className={`group relative rounded-xl border-2 p-4 sm:p-5 text-left transition-all duration-300 w-full opacity-60 cursor-not-allowed ${
                  method === "ABA"
                    ? "border-royal-border bg-royal-card/50"
                    : "border-royal-border bg-royal-card"
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gray-400 border border-gray-500/30 overflow-hidden shrink-0">
                    <img 
                      src="/aba-logo.png?v=2" 
                      alt="ABA PayWay" 
                      className="h-10 w-10 object-contain grayscale opacity-50"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-base text-gray-400">ABA PayWay</span>
                      <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-400 whitespace-nowrap">COMING SOON</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">This payment method will be available soon.</div>
                  </div>
                  <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 border-gray-500 bg-gray-500/20`}>
                  </div>
                </div>
              </button>
          </div>
        </div>

        {/* Desktop Sticky Summary */}
        <div className="hidden lg:block">
          <div className="sticky top-24">
            <div className="card p-6 border border-royal-primary/20">
              <h3 className="font-display text-sm font-bold uppercase tracking-wider text-royal-muted mb-4">Order Summary</h3>
              {selectedProduct ? (
                <div className="space-y-3">
                  <div className="flex justify-between text-sm"><span className="text-royal-muted">{game.name}</span></div>
                  <div className="flex justify-between text-sm">
                    <span className="text-royal-muted">Package</span>
                    <span className="font-medium">{selectedProduct.amount > 0 ? `${selectedProduct.amount.toLocaleString()} ${game.currencyName}` : selectedProduct.name}</span>
                  </div>
                  {user ? (
                    <div className="flex justify-between text-sm text-royal-primary font-bold">
                      <span className="flex items-center gap-1.5">
                        <Crown size={14} /> Member 2% 
                        <span className="text-[8px] opacity-60 uppercase bg-royal-primary/10 px-1 rounded">One-time</span>
                      </span>
                      <span>{canGetMemberDiscount ? `−${format(memberDiscountUsd)}` : "Used"}</span>
                    </div>
                  ) : (
                    <Link href="/login" className="block p-2 rounded-lg bg-royal-primary/10 border border-royal-primary/20 text-[10px] text-royal-primary font-bold text-center uppercase tracking-widest hover:bg-royal-primary/20 transition-colors mt-2">
                      Login for 2% discount
                    </Link>
                  )}
                  <div className="border-t border-royal-border pt-3 flex justify-between items-center">
                    <span className="text-royal-muted text-sm">Total</span>
                    <div className="text-right">
                      <div className="font-display text-3xl font-bold text-gradient">{format(effectivePrice)}</div>
                      <div className="text-[10px] text-royal-muted font-mono">≈ {toKhr(effectivePrice).toLocaleString()} ៛</div>
                    </div>
                  </div>
                  <button type="submit" disabled={!canSubmit || submitting} className="btn-primary w-full mt-4">
                    {submitting ? "Deploying..." : selectedProduct.isMysteryBox ? "Try your luck" : "Initialize Payment"}
                    {!submitting && (selectedProduct.isMysteryBox ? <Dices size={18} /> : <ArrowRight size={18} />)}
                  </button>

                  {!selectedProduct.isMysteryBox && (
                    <div className="mt-8 pt-6 border-t border-royal-border">
                       {/* SquadPoolUI temporarily disabled - database connection issue */}
                       {/* <SquadPoolUI productId={selectedProduct.id} /> */}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-royal-muted">Select a package to continue.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Sticky Bottom */}
      <div className="lg:hidden card p-5 sticky bottom-4 mt-8 border-royal-primary/30 shadow-2xl backdrop-blur-md">
        <div className="flex justify-between items-center mb-4">
          <div>
            <div className="text-[10px] uppercase text-royal-muted">Final Total</div>
            <div className="font-display text-2xl font-bold text-gradient">{format(effectivePrice)}</div>
          </div>
          <button type="submit" disabled={!canSubmit || submitting} className="btn-primary px-8">
            {submitting ? "..." : selectedProduct?.isMysteryBox ? "Try your luck" : "Pay Now"}
          </button>
        </div>
      </div>
    </form>
  );
}
