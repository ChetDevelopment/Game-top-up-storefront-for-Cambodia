"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import ReviewForm from "@/components/ReviewForm";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import {
  QrCode,
  Clock,
  CheckCircle2,
  Smartphone,
  Loader2,
  AlertCircle,
  ShieldCheck,
  Zap,
  Terminal,
  Activity,
  X,
  Download
} from "lucide-react";

interface OrderPayment {
  orderNumber: string;
  status: string;
  gameName: string;
  gameSlug: string;
  productName: string;
  playerUid: string;
  serverId: string | null;
  amountUsd: number;
  amountKhr: number | null;
  currency: string;
  paymentMethod: string;
  paymentRef: string | null;
  paymentUrl: string | null;
  qrString: string | null;
  paymentExpiresAt: string | null;
  createdAt: string;
  paidAt: string | null;
}

const TERMINAL = new Set(["DELIVERED", "FAILED", "CANCELLED", "REFUNDED", "FAILED_FINAL"]);
const SUCCESS_STATES = new Set(["PAID", "QUEUED", "DELIVERING", "DELIVERED"]);

function qrImageUrl(payload: string, size = 320): string {
  const enc = encodeURIComponent(payload);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&ecc=M&margin=4&data=${enc}`;
}

function truncateLabel(value: string, max = 26): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 3)).trim()}...`;
}

function getOrderCurrency(order: Pick<OrderPayment, "currency" | "amountKhr"> | null): "USD" | "KHR" {
  return order?.currency === "KHR" && typeof order.amountKhr === "number" && Number.isFinite(order.amountKhr)
    ? "KHR"
    : "USD";
}

function formatPrimaryAmount(order: Pick<OrderPayment, "amountUsd" | "amountKhr" | "currency"> | null): string {
  if (!order) return "0.00";
  return getOrderCurrency(order) === "KHR"
    ? Math.round(order.amountKhr ?? 0).toLocaleString("en-US")
    : order.amountUsd.toFixed(2);
}

function formatOrderTotal(order: Pick<OrderPayment, "amountUsd" | "amountKhr" | "currency"> | null): string {
  if (!order) return "$0.00";
  return getOrderCurrency(order) === "KHR"
    ? `${Math.round(order.amountKhr ?? 0).toLocaleString("en-US")} ៛`
    : `$${order.amountUsd.toFixed(2)}`;
}

function formatSecondaryAmount(order: Pick<OrderPayment, "amountUsd" | "amountKhr" | "currency"> | null): string | null {
  if (!order) return null;
  if (getOrderCurrency(order) === "KHR") {
    return `Approx. $${order.amountUsd.toFixed(2)}`;
  }
  if (typeof order.amountKhr === "number" && Number.isFinite(order.amountKhr)) {
    return `Approx. ${Math.round(order.amountKhr ?? 0).toLocaleString("en-US")} ៛`;
  }
  return null;
}

export default function CheckoutPage() {
  const router = useRouter();
  const params = useParams<{ orderNumber: string }>();
  const orderNumber = (params?.orderNumber || "").toUpperCase();

  const [order, setOrder] = useState<OrderPayment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollAttemptsRef = useRef(0);

  const [showReceipt, setShowReceipt] = useState(false);
  const [activeTab, setActiveTab] = useState<"receipt" | "review">("receipt");
  const [hasAutoOpened, setHasAutoOpened] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [checkResult, setCheckResult] = useState<string | null>(null);

  const MAX_POLL_ATTEMPTS = 200;
  const POLL_INTERVAL_MS = 5000;
  const INITIAL_DELAY_MS = 5000;

  useEffect(() => {
    fetch("/api/user/me", { cache: "no-store" })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          if (data.user) {
            setUser(data.user);
          }
        }
        setAuthReady(true);
      })
      .catch(() => setAuthReady(true));
  }, [router]);

  const fetchOrder = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderNumber)}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Order not found");
      const data = await res.json();

      const prevStatus = order?.status;
      const newStatus = data.status;

      if (SUCCESS_STATES.has(newStatus) && !SUCCESS_STATES.has(prevStatus || "")) {
        setShowReceipt(true);
        setHasAutoOpened(true);
        const toast = document.getElementById('success-toast');
        if (toast) {
          toast.classList.remove('hidden');
          toast.classList.add('animate-bounce');
          setTimeout(() => toast.classList.add('hidden'), 5000);
        }
      }

      setOrder(data);
      return data;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  }, [orderNumber, order?.status]);

  const verifyPaymentStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderNumber)}/verify`, {
        method: "POST",
        cache: "no-store",
      });
      if (!res.ok) return null;
      const data = await res.json();

      // Always refresh order data after verify (verify may have just changed status)
      if (data.isPaid || data.status === "QUEUED" || data.status === "DELIVERING" || data.status === "DELIVERED") {
        fetchOrder();
      }

      return data;
    } catch {
      return null;
    }
  }, [orderNumber, fetchOrder]);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderNumber)}/cancel`, { method: "POST" });
      if (res.ok) {
        setShowCancelModal(false);
        window.location.href = "/";
      }
    } catch {
      setError("Failed to cancel order");
    } finally {
      setCancelling(false);
    }
  };

  const handleManualCheck = async () => {
    setCheckingPayment(true);
    setCheckResult(null);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderNumber)}/verify`, {
        method: "POST",
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setCheckResult(data.isPaid ? "Payment confirmed! Refreshing..." : "Payment still pending. Please complete the payment.");
        if (data.isPaid) {
          await fetchOrder();
        }
      } else {
        setCheckResult("Failed to check payment status. Please try again.");
      }
    } catch {
      setCheckResult("Network error. Please check your connection.");
    } finally {
      setCheckingPayment(false);
      setTimeout(() => setCheckResult(null), 5000);
    }
  };

  useEffect(() => {
    if (!authReady) return;
    setLoading(true);
    fetchOrder().finally(() => setLoading(false));
  }, [authReady, fetchOrder]);

  useEffect(() => {
    if (!order) {
      console.log("[checkout] No order yet, waiting...");
      return;
    }

    // Don't poll if order is in terminal state
    if (TERMINAL.has(order.status) || order.status === "DELIVERED") {
      console.log("[checkout] Order in terminal state, not polling:", order.status);
      return;
    }

    // Don't poll if already paid
    if (SUCCESS_STATES.has(order.status)) {
      console.log("[checkout] Order already paid, not polling:", order.status);
      return;
    }

    console.log("[checkout] Starting poll for order:", order.orderNumber);

    // Start polling immediately, then every POLL_INTERVAL_MS
    verifyPaymentStatus();
    
    pollRef.current = setInterval(() => {
      pollAttemptsRef.current += 1;
      console.log("[checkout] Poll attempt:", pollAttemptsRef.current);

      if (pollAttemptsRef.current >= MAX_POLL_ATTEMPTS) {
        console.log("[checkout] Max poll attempts reached");
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        return;
      }

      verifyPaymentStatus();
    }, POLL_INTERVAL_MS);

    return () => {
      console.log("[checkout] Cleaning up poll");
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [order?.orderNumber]); // FIX: Only depend on orderNumber, not status (prevents poller reset)

  useEffect(() => {
    if (!order?.paymentExpiresAt) return;
    const tick = () => {
      const ms = new Date(order.paymentExpiresAt!).getTime() - Date.now();
      setRemainingMs(ms > 0 ? ms : 0);
      
      // Auto-refresh order when QR expires (if not already paid)
      if (ms <= 0 && !SUCCESS_STATES.has(order.status)) {
        console.log("[checkout] QR expired, refreshing order...");
        fetchOrder();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [order?.paymentExpiresAt, order?.status, fetchOrder]);

  const isExpired = remainingMs !== null && remainingMs <= 0 && !SUCCESS_STATES.has(order?.status ?? "");
  const isPaid = order ? SUCCESS_STATES.has(order.status) : false;
  const qrTitle = order ? truncateLabel(order.productName || order.gameName) : "";
  const qrSubtitle = order?.gameName ? `${order.gameName} top up` : "Secure KHQR payment";
  const paymentCurrency = getOrderCurrency(order);
  const primaryAmount = formatPrimaryAmount(order);
  const displayTotal = formatOrderTotal(order);
  const secondaryAmount = formatSecondaryAmount(order);

  return (
    <div className="min-h-screen bg-royal-bg text-royal-text flex flex-col relative overflow-hidden">
      {/* Dynamic Background */}
      <div className="absolute inset-0 royal-grid opacity-20 pointer-events-none" />
      <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-royal-primary/10 to-transparent pointer-events-none" />
      
      <Header />

      {/* Success Toast */}
      <div id="success-toast" className="hidden fixed top-24 left-1/2 -translate-x-1/2 z-[200] bg-green-500 text-white px-8 py-4 rounded-2xl shadow-2xl border-2 border-green-400 animate-bounce">
        <div className="flex items-center gap-3">
          <CheckCircle2 size={32} className="text-white" />
          <div>
            <div className="font-black text-lg">PAYMENT SUCCESSFUL!</div>
            <div className="text-sm text-green-100">Your order has been delivered</div>
          </div>
        </div>
      </div>

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-12 relative z-10">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 space-y-4">
            <Loader2 className="h-12 w-12 text-royal-primary animate-spin" />
            <p className="font-black uppercase tracking-[0.2em] text-royal-muted text-xs animate-pulse">Establishing Secure Link...</p>
          </div>
        ) : error ? (
          <div className="max-w-md mx-auto card p-10 text-center border-red-500/30">
            <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-black uppercase mb-2">Sync Error</h2>
            <p className="text-royal-muted text-sm mb-6">{error}</p>
            <Link href="/" className="btn-primary w-full">Return to Base</Link>
          </div>
        ) : order && (
          <div className="grid lg:grid-cols-[1fr_400px] gap-12 items-start">
            
            {/* Left: Interactive Payment Console */}
            <div className="space-y-8">
              {isPaid ? (
                <div className="rounded-[2.5rem] bg-gradient-to-br from-green-500/10 to-emerald-500/5 border border-green-500/30 p-12 text-center animate-scale-in">
                  <div className="h-24 w-24 rounded-3xl bg-green-500/20 flex items-center justify-center mx-auto mb-6">
                    <CheckCircle2 size={56} className="text-green-400" />
                  </div>
                  <h1 className="text-4xl font-black uppercase tracking-tighter mb-4">Mission Accomplished</h1>
                  <p className="text-royal-muted text-lg max-w-md mx-auto">Payment confirmed. Your credits are being beamed to your account right now.</p>
                  <div className="mt-8 flex items-center justify-center gap-3 text-royal-muted">
                    <Loader2 size={16} className="animate-spin" />
                    <span className="text-xs font-bold uppercase tracking-widest">Redirecting to Intel Hub...</span>
                  </div>
                </div>
              ) : isExpired ? (
                <div className="rounded-[2.5rem] bg-royal-card/30 border border-red-500/30 p-12 text-center">
                  <AlertCircle size={64} className="text-red-400 mx-auto mb-6" />
                  <h1 className="text-3xl font-black uppercase mb-4 tracking-tight">Signal Lost</h1>
                  <p className="text-royal-muted mb-8">This payment window has expired. Please re-initiate the request.</p>
                  <Link href={`/games/${order.gameSlug}`} className="btn-primary px-10">Start New Mission</Link>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Status Bar */}
                   <div className="flex items-center justify-between p-4 rounded-2xl bg-royal-card/50 border border-royal-border">
                     <div className="flex items-center gap-3">
                       <div className="h-2 w-2 rounded-full bg-royal-primary animate-ping" />
                       <span className="text-[10px] font-black uppercase tracking-[0.2em] text-royal-primary">KHQR Network Awaiting</span>
                     </div>
                     <div className="flex items-center gap-2">
                        <Activity size={14} className="text-royal-muted" />
                        <span className="text-[10px] font-bold text-royal-muted uppercase">KHQR Network Live</span>
                     </div>
                   </div>

                  <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] items-start">
                    <div className="relative mx-auto w-full max-w-[340px]">
                      <div className="absolute -inset-4 rounded-[2.25rem] bg-[radial-gradient(circle_at_top,_rgba(239,68,68,0.30),_rgba(255,255,255,0)_68%)] blur-xl" />
                      <div className="relative overflow-hidden rounded-[1.75rem] bg-white shadow-[0_20px_60px_rgba(15,23,42,0.2)]">
                        <div className="bg-[#E11D2E] px-6 py-4 text-center">
                          <div className="text-[1.75rem] font-black tracking-[-0.06em] text-white">KHQR</div>
                        </div>

                        <div className="relative bg-white px-6 pb-6 pt-5 text-slate-900">
                          <div className="absolute right-0 top-0 h-0 w-0 border-l-[24px] border-l-transparent border-t-[24px] border-t-[#E11D2E]" />

                          <div className="mb-1 text-sm font-medium text-slate-500">{qrTitle}</div>
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{qrSubtitle}</div>

                          <div className="mt-4 flex items-end gap-2">
                            <span className="text-4xl font-black leading-none tracking-[-0.06em] text-slate-950 sm:text-[2.7rem]">
                              {primaryAmount}
                            </span>
                            <span className="pb-1 text-sm font-semibold uppercase tracking-[0.22em] text-slate-500 khmer-currency">
                              {paymentCurrency}
                            </span>
                          </div>

                          {secondaryAmount && (
                            <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                              {secondaryAmount}
                            </div>
                          )}

                          <div className="my-5 border-t border-dashed border-slate-300" />

                          <div className="relative mx-auto aspect-square w-full max-w-[230px]">
                            {order.qrString ? (
                              <img
                                src={qrImageUrl(order.qrString, 360)}
                                alt={`KHQR payment for ${order.orderNumber}`}
                                className="h-full w-full object-contain"
                              />
                            ) : (
                              <div className="flex h-full w-full flex-col items-center justify-center rounded-[1.25rem] bg-slate-100 p-6 text-center text-slate-400">
                                <QrCode size={52} className="mb-3 opacity-20" />
                                <p className="text-xs font-bold uppercase tracking-widest">Dev Protocol Active</p>
                              </div>
                            )}

                            <div className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[3px] border-white bg-slate-950 text-2xl font-black text-white shadow-lg">
                              <span className="khmer-currency">{paymentCurrency === "KHR" ? "៛" : "$"}</span>
                            </div>
                          </div>

                     <div className="flex items-center justify-between gap-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                        <span>Verified KHQR</span>
                        <span>{order.orderNumber}</span>
                      </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="card p-6 border-royal-primary/20">
                        <div className="mb-3 flex items-center gap-2">
                          <ShieldCheck size={16} className="text-royal-primary" />
                          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-royal-primary">
                            Exact Payment Required
                          </span>
                        </div>
                        <div className="text-3xl font-black tracking-tight text-white sm:text-[2.1rem]">{displayTotal}</div>
                        <p className="mt-2 text-sm leading-relaxed text-royal-muted">
                          The QR above should be confirmed at this amount before the customer finishes payment.
                        </p>
                        {secondaryAmount && (
                          <div className="mt-4 rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-royal-muted">
                            Reference: <span className="font-bold text-royal-text">{secondaryAmount.replace(/^Approx\. /, "")}</span>
                          </div>
                        )}
                      </div>

                      {remainingMs !== null && (
                        <div className="card p-6 border-royal-accent/20 bg-royal-accent/5">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                              <Clock size={16} className="text-royal-accent" />
                              <span className="text-[10px] font-black uppercase tracking-widest text-royal-accent/70">Time Remaining</span>
                            </div>
                            <div className="font-mono text-2xl font-black text-royal-accent">
                              {Math.floor(remainingMs / 60000)}:{String(Math.floor((remainingMs % 60000) / 1000)).padStart(2, "0")}
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="rounded-[2rem] border border-royal-primary/20 bg-royal-primary/10 p-6">
                        <div className="flex items-start gap-4">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-royal-primary/15 text-royal-primary">
                            <Smartphone size={20} />
                          </div>
                          <div className="space-y-2">
                            <p className="text-sm font-bold text-royal-text">Scan with ABA Pay, ACLEDA, Wing, or any KHQR wallet.</p>
                            <p className="text-sm leading-relaxed text-royal-muted">
                              Ask the customer to review the exact {paymentCurrency} amount on their banking app, then confirm the transfer.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {/* DEV ONLY: Manual payment check button - hidden from users */}
                        {process.env.NODE_ENV === 'development' && (
                          <button
                            onClick={handleManualCheck}
                            disabled={checkingPayment || isPaid || isExpired}
                            className="w-full p-3 rounded-xl bg-royal-primary/10 border border-royal-primary/30 text-royal-primary text-xs font-bold uppercase tracking-widest hover:bg-royal-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                          >
                            {checkingPayment ? (
                              <>
                                <Loader2 size={16} className="animate-spin" />
                                CHECKING...
                              </>
                            ) : (
                              <>
                                <Activity size={16} />
                                CHECK PAYMENT STATUS NOW (DEV)
                              </>
                            )}
                          </button>
                        )}
                        
                        {checkResult && process.env.NODE_ENV === 'development' && (
                          <div className={`p-3 rounded-xl text-xs font-bold uppercase tracking-widest text-center ${checkResult.includes("confirmed") ? "bg-green-500/10 border border-green-500/30 text-green-400" : "bg-amber-500/10 border border-amber-500/30 text-amber-400"}`}>
                            {checkResult}
                          </div>
                        )}

                        <button
                          onClick={() => setShowCancelModal(true)}
                          disabled={cancelling || isPaid || isExpired}
                          className="w-full p-3 rounded-xl border border-red-500/30 text-red-400 text-xs font-bold uppercase tracking-widest hover:bg-red-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Cancel Payment
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right: Intel Dashboard */}
            <div className="space-y-6">
              <div className="card overflow-hidden border-white/5">
                <div className="bg-white/5 p-4 border-b border-white/5 flex items-center gap-2">
                  <Terminal size={16} className="text-royal-primary" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Order Manifest</span>
                </div>
                <div className="p-6 space-y-6">
                   <div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-royal-muted mb-3">Mission Details</div>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center text-sm">
                           <span className="text-royal-muted">Game</span>
                           <span className="font-bold uppercase tracking-tight">{order.gameName}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                           <span className="text-royal-muted">Package</span>
                           <span className="font-bold text-royal-primary">{order.productName}</span>
                        </div>
                      </div>
                   </div>

                   <div className="pt-6 border-t border-white/5">
                      <div className="text-[10px] font-black uppercase tracking-widest text-royal-muted mb-3">Account Sync</div>
                      <div className="flex flex-col gap-2">
                        <div className="p-4 rounded-xl bg-royal-bg border border-royal-border group relative overflow-hidden">
                           <div className="relative z-10 flex justify-between items-center">
                              <span className="text-[10px] font-bold text-royal-muted uppercase">Player UID</span>
                              <span className="font-mono font-bold text-royal-accent">{order.playerUid}</span>
                           </div>
                           <div className="absolute inset-0 bg-royal-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        {order.serverId && (
                          <div className="p-3 rounded-xl bg-royal-bg border border-royal-border flex justify-between items-center text-xs">
                             <span className="text-royal-muted uppercase font-bold">Server</span>
                             <span className="font-bold">{order.serverId}</span>
                          </div>
                        )}
                      </div>
                   </div>

                   <div className="pt-6 border-t border-white/5">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black uppercase tracking-widest text-royal-muted">Order Hash</span>
                        <span className="font-mono text-[10px] text-royal-muted/50">{order.orderNumber}</span>
                      </div>
                   </div>
                </div>
              </div>


             </div>
           </div>
         )}
      </main>

      {/* Cancel Modal */}
      {showCancelModal && order && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-sm card p-0 overflow-hidden">
            <div className="p-6 text-center">
              <div className="h-16 w-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                <AlertCircle size={32} className="text-red-400" />
              </div>
              <h2 className="text-xl font-black uppercase mb-2">Cancel Payment?</h2>
              <p className="text-royal-muted text-sm mb-6">
                Are you sure you want to cancel this order? Your payment will not be processed.
              </p>
              <div className="space-y-3">
                <button
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="w-full p-4 rounded-xl bg-red-500 text-white font-bold uppercase tracking-widest hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  {cancelling ? "Cancelling..." : "Yes, Cancel"}
                </button>
                <button
                  onClick={() => setShowCancelModal(false)}
                  disabled={cancelling}
                  className="w-full p-4 rounded-xl bg-royal-card border border-royal-border text-royal-text font-bold uppercase tracking-widest hover:bg-royal-bg transition-colors"
                >
                  No, Keep Order
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {showReceipt && order && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-lg card p-0 overflow-hidden shadow-[0_0_50px_rgba(99,102,241,0.3)] animate-scale-in">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-royal-primary to-indigo-600 p-0 text-center relative">
               <div className="p-6">
                 <div className="h-12 w-12 bg-white/20 rounded-xl flex items-center justify-center mx-auto mb-2 backdrop-blur-md">
                    <ShieldCheck size={24} className="text-white" />
                 </div>
                 <h2 className="text-xl font-black uppercase tracking-tight text-white italic">Order Manifest</h2>
                 <p className="text-white/70 text-[10px] font-bold uppercase tracking-[0.2em]">{order.orderNumber}</p>
               </div>
               
               <div className="flex bg-black/20 backdrop-blur-sm p-1 mx-6 mb-4 rounded-lg border border-white/10">
                  <button 
                    onClick={() => setActiveTab("receipt")}
                    className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-md transition-all ${activeTab === "receipt" ? "bg-white text-royal-bg shadow-lg" : "text-white/60 hover:text-white"}`}
                  >
                    Mission Intel
                  </button>
                  <button 
                    onClick={() => setActiveTab("review")}
                    className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-md transition-all ${activeTab === "review" ? "bg-white text-royal-bg shadow-lg" : "text-white/60 hover:text-white"}`}
                  >
                    Report Status
                  </button>
               </div>
               
               <button 
                 onClick={() => setShowReceipt(false)}
                 className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors"
               >
                 <X size={20} />
               </button>
            </div>

            <div className="overflow-y-auto max-h-[70vh]">
              {activeTab === "receipt" ? (
                <div className="p-8 space-y-6">
                  {/* Receipt Summary */}
                  <div className="space-y-4">
                    <div className="flex justify-between items-end border-b border-royal-border pb-3">
                      <div>
                        <div className="text-[10px] font-black uppercase text-royal-muted mb-1">Items Deployed</div>
                        <div className="font-bold text-royal-text">{order.productName}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] font-black uppercase text-royal-muted mb-1">Cost</div>
                        <div className="font-black text-royal-primary text-xl">{displayTotal}</div>
                      </div>
                    </div>

                    <div className="flex justify-between items-center text-sm">
                       <span className="text-royal-muted font-bold uppercase text-[10px]">Target Identity</span>
                       <span className="font-mono font-bold text-royal-accent">{order.playerUid}</span>
                    </div>
                    
                    <div className="flex justify-between items-center text-sm">
                       <span className="text-royal-muted font-bold uppercase text-[10px]">Timestamp</span>
                       <span className="text-royal-text font-medium">{new Date().toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Guest vs Member logic */}
                  {!order.paymentRef?.includes("USER-") && !user ? (
                    <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                      <div className="flex gap-3">
                        <AlertCircle className="text-amber-500 shrink-0" size={18} />
                        <div>
                          <h4 className="text-amber-500 text-xs font-black uppercase mb-1">Guest Warning</h4>
                          <p className="text-royal-muted text-[11px] leading-relaxed">
                            You are not logged in. <span className="text-royal-text font-bold underline">Download this receipt now.</span> Mission history is only archived for Elite Members. 
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-2xl bg-green-500/10 border border-green-500/30 text-center">
                      <div className="flex items-center justify-center gap-2 text-green-400 mb-1">
                        <Zap size={14} fill="currentColor" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Vault Sync Active</span>
                      </div>
                      <p className="text-royal-muted text-[11px]">This receipt is safely stored in your Battle History.</p>
                    </div>
                  )}

                  <div className="flex flex-col gap-3">
                    <a 
                      href={`/api/orders/${encodeURIComponent(order.orderNumber)}/invoice`}
                      className="btn-primary w-full py-4 flex items-center justify-center gap-3 group"
                    >
                      <Download size={20} className="group-hover:translate-y-0.5 transition-transform" />
                      DOWNLOAD RECEIPT
                    </a>
                    
                    <button 
                      onClick={() => setShowReceipt(false)}
                      className="text-[10px] font-black text-royal-muted uppercase tracking-[0.2em] hover:text-royal-primary transition-colors"
                    >
                      Dismiss Console
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-2">
                  <ReviewForm 
                    orderId={order.orderNumber} // actually using orderNumber as identifier in API
                    orderNumber={order.orderNumber}
                    productId="" // will be found by API
                    productName={order.productName}
                    onSuccess={() => {}}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
