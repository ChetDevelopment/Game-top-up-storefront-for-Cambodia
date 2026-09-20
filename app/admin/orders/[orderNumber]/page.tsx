"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { 
  ArrowLeft, 
  RotateCw, 
  FileText, 
  Zap, 
  Clock, 
  Check, 
  Copy, 
  AlertTriangle,
  Mail,
  Phone,
  Monitor,
  Gamepad2,
  Package,
  User,
  CreditCard,
  Calendar,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Loader2,
  Save
} from "lucide-react";

const STATUSES = ["PENDING", "PAID", "PROCESSING", "DELIVERED", "FAILED", "REFUNDED", "CANCELLED"];

export default function AdminOrderDetailPage() {
  const params = useParams() as { orderNumber: string };
  const router = useRouter();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  async function copyToClipboard(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* ignore */
    }
  }

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/admin/orders/${params.orderNumber}`);
    if (res.ok) {
      const data = await res.json();
      setOrder(data);
      setNote(data.deliveryNote || "");
      setReason(data.failureReason || "");
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.orderNumber]);

  async function updateStatus(newStatus: string) {
    setUpdating(true);
    await fetch(`/api/admin/orders/${params.orderNumber}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: newStatus,
        deliveryNote: note,
        failureReason: newStatus === "FAILED" ? reason : undefined,
      }),
    });
    await load();
    setUpdating(false);
  }

  async function refreshFromGateway() {
    setUpdating(true);
    const res = await fetch(`/api/admin/orders/${params.orderNumber}/refresh`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      const msg = `Status: ${data.remote?.status ?? "unknown"}` +
        (data.expectedAmount ? ` | Expected: $${data.expectedAmount}` : "") +
        (data.paidAmount ? ` | Paid: $${data.paidAmount}` : "") +
        (data.updated ? " — Order UPDATED!" : "");
      alert(msg);
      await load();
    } else {
      const d = await res.json().catch(() => null);
      alert(d?.error || "Refresh failed");
    }
    setUpdating(false);
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 text-royal-primary animate-spin" />
      </div>
    );
  }
  if (!order) {
    return <div className="p-8 text-royal-muted">Order not found.</div>;
  }

  return (
    <div className="p-8 max-w-5xl">
      <Link href="/admin/orders" className="inline-flex items-center gap-2 text-sm text-royal-muted hover:text-royal-primary mb-6 transition-colors">
        <ArrowLeft className="h-4 w-4" />
        Back to orders
      </Link>

      <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="font-display text-3xl font-bold font-mono tracking-tight">{order.orderNumber}</h1>
            <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider border ${
              order.status === "DELIVERED" ? "bg-green-500/10 text-green-400 border-green-500/20" :
              order.status === "PAID" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
              "bg-royal-surface text-royal-muted border-royal-border"
            }`}>
              {order.status}
            </span>
          </div>
          <p className="text-royal-muted text-sm flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            Created {new Date(order.createdAt).toLocaleString()}
          </p>
        </div>
        
        {order.paymentRef && order.status === "PENDING" && (
          <button
            onClick={refreshFromGateway}
            disabled={updating}
            className="btn-ghost text-xs inline-flex items-center gap-2"
          >
            <RotateCw className={`h-3.5 w-3.5 ${updating ? "animate-spin" : ""}`} />
            Sync with KHPay
          </button>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="grid sm:grid-cols-2 gap-6">
            <div className="card p-5">
              <h3 className="text-[10px] uppercase font-bold tracking-[0.1em] text-royal-muted mb-4 flex items-center gap-2">
                <User className="h-3.5 w-3.5 text-royal-primary" />
                Customer
              </h3>
              <dl className="space-y-4 text-sm">
                <div className="flex justify-between items-center">
                  <dt className="text-royal-muted flex items-center gap-2"><Mail className="h-3.5 w-3.5" /> Email</dt>
                  <dd className="font-medium">{order.customerEmail || "—"}</dd>
                </div>
                <div className="flex justify-between items-center">
                  <dt className="text-royal-muted flex items-center gap-2"><Phone className="h-3.5 w-3.5" /> Phone</dt>
                  <dd className="font-medium">{order.customerPhone || "—"}</dd>
                </div>
                <div className="flex justify-between items-center">
                  <dt className="text-royal-muted flex items-center gap-2"><Monitor className="h-3.5 w-3.5" /> IP Address</dt>
                  <dd className="font-mono text-xs text-royal-muted">{order.ipAddress || "—"}</dd>
                </div>
              </dl>
            </div>

            <div className="card p-5">
              <h3 className="text-[10px] uppercase font-bold tracking-[0.1em] text-royal-muted mb-4 flex items-center gap-2">
                <Gamepad2 className="h-3.5 w-3.5 text-royal-primary" />
                Top-up Details
              </h3>
              <dl className="space-y-4 text-sm">
                <div className="flex justify-between items-center">
                  <dt className="text-royal-muted">Game</dt>
                  <dd className="font-semibold">{order.game.name}</dd>
                </div>
                <div className="flex justify-between items-center">
                  <dt className="text-royal-muted">Package</dt>
                  <dd className="font-semibold text-royal-primary">{order.product.name}</dd>
                </div>
                <div className="flex justify-between items-center">
                  <dt className="text-royal-muted">Player UID</dt>
                  <dd className="font-mono font-bold text-royal-accent px-2 py-1 rounded bg-royal-accent/10">{order.playerUid}</dd>
                </div>
                {order.serverId && (
                  <div className="flex justify-between items-center">
                    <dt className="text-royal-muted">Server</dt>
                    <dd className="font-medium">{order.serverId}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>

          <div className="card p-5">
            <h3 className="text-[10px] uppercase font-bold tracking-[0.1em] text-royal-muted mb-4 flex items-center gap-2">
              <CreditCard className="h-3.5 w-3.5 text-royal-primary" />
              Payment & Finance
            </h3>
            <div className="grid sm:grid-cols-2 gap-8">
              <dl className="space-y-4 text-sm">
                <div className="flex justify-between items-center">
                  <dt className="text-royal-muted">Method</dt>
                  <dd className="font-medium bg-royal-surface px-2 py-1 rounded border border-royal-border">{order.paymentMethod.replace("_", " ")}</dd>
                </div>
                <div className="flex justify-between items-center">
                  <dt className="text-royal-muted">Amount (USD)</dt>
                  <dd className="font-bold text-lg text-royal-primary">${order.amountUsd.toFixed(2)}</dd>
                </div>
                {order.amountKhr && (
                  <div className="flex justify-between items-center">
                    <dt className="text-royal-muted">Amount (KHR)</dt>
                    <dd className="text-royal-muted font-medium">{order.amountKhr.toLocaleString()} ៛</dd>
                  </div>
                )}
              </dl>
              <dl className="space-y-4 text-sm">
                <div className="flex flex-col gap-1.5">
                  <dt className="text-royal-muted">Gateway Reference</dt>
                  <dd className="font-mono text-xs p-2 rounded bg-black/50 border border-royal-border break-all">{order.paymentRef || "No reference"}</dd>
                </div>
                {["PAID", "PROCESSING", "DELIVERED"].includes(order.status) && (
                  <a
                    href={`/api/orders/${encodeURIComponent(order.orderNumber)}/invoice`}
                    className="btn-ghost text-xs w-full inline-flex items-center justify-center gap-2"
                  >
                    <FileText className="h-4 w-4" />
                    Download Invoice (PDF)
                  </a>
                )}
              </dl>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-5">
            <h3 className="text-[10px] uppercase font-bold tracking-[0.1em] text-royal-muted mb-4 flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-royal-primary" />
              Timeline
            </h3>
            <div className="space-y-4">
              {[
                { label: "Created", time: order.createdAt, icon: Calendar, color: "text-royal-muted" },
                { label: "Paid", time: order.paidAt, icon: ShieldCheck, color: "text-blue-400" },
                { label: "Delivered", time: order.deliveredAt, icon: CheckCircle2, color: "text-green-400" },
              ].map((step, i) => (
                <div key={step.label} className="relative flex gap-3">
                  {i < 2 && <div className="absolute left-[11px] top-6 w-0.5 h-6 bg-royal-border" />}
                  <div className={`h-6 w-6 rounded-full flex items-center justify-center bg-royal-surface border border-royal-border ${step.time ? step.color : "text-royal-muted/30"}`}>
                    <step.icon className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-bold tracking-wider text-royal-muted">{step.label}</div>
                    <div className={`text-xs ${step.time ? "font-medium" : "text-royal-muted italic"}`}>
                      {step.time ? new Date(step.time).toLocaleString() : "Pending"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <h3 className="text-[10px] uppercase font-bold tracking-[0.1em] text-royal-muted mb-4 flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-royal-primary" />
              Update Status
            </h3>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {["PROCESSING", "DELIVERED", "FAILED", "CANCELLED"].map((s) => (
                  <button
                    key={s}
                    disabled={updating || order.status === s}
                    onClick={() => updateStatus(s)}
                    className={`flex-1 min-w-[100px] px-3 py-2 text-[10px] rounded-lg font-bold transition-all disabled:opacity-40 border ${
                      s === "DELIVERED" ? "bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/20" :
                      s === "FAILED" ? "bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20" :
                      "bg-royal-surface text-royal-muted border-royal-border hover:bg-royal-card"
                    }`}
                  >
                    {order.status === s ? `✓ ${s}` : `Set ${s}`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {(order.status === "PAID" || order.status === "PROCESSING") && (() => {
        const needsAction = order.status === "PAID";
        return (
          <div className={`mb-8 rounded-2xl border p-6 shadow-xl transition-all ${
            needsAction
              ? "border-royal-primary/50 bg-royal-primary/5 shadow-royal-primary/5"
              : "border-yellow-500/40 bg-yellow-500/5"
          }`}>
            <div className="flex items-center gap-4 mb-6">
              <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${needsAction ? "bg-royal-primary text-black" : "bg-yellow-500 text-black"}`}>
                {needsAction ? <Zap className="h-6 w-6" /> : <Clock className="h-6 w-6" />}
              </div>
              <div>
                <h3 className="font-display text-xl font-bold text-royal-text">
                  {needsAction ? "Fulfillment Required" : "Fulfillment In Progress"}
                </h3>
                <p className="text-sm text-royal-muted mt-0.5">
                  {needsAction
                    ? "Customer payment verified. Complete the top-up and mark as delivered."
                    : "Finish the top-up process and notify the customer."}
                </p>
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-4 mb-6">
              {[
                { label: "Player UID", value: order.playerUid, icon: Copy, key: "UID", accent: true },
                ...(order.serverId ? [{ label: "Server", value: order.serverId, icon: Copy, key: "Server" }] : []),
                { label: "Package", value: order.product.name, icon: Copy, key: "Package" },
              ].map((field) => (
                <button
                  key={field.key}
                  onClick={() => copyToClipboard(field.value, field.key)}
                  className="group flex flex-col items-start gap-1.5 rounded-xl border border-royal-border bg-royal-surface/80 p-4 text-left transition-all hover:border-royal-primary/60 hover:bg-royal-card hover:shadow-lg"
                >
                  <div className="w-full flex justify-between items-center">
                    <span className="text-[10px] uppercase font-bold tracking-widest text-royal-muted">{field.label}</span>
                    <field.icon className="h-3 w-3 text-royal-muted group-hover:text-royal-primary" />
                  </div>
                  <span className={`font-mono text-lg font-bold truncate w-full ${field.accent ? "text-royal-accent" : "text-royal-text"}`}>
                    {field.value}
                  </span>
                  <div className="h-4">
                    {copied === field.key ? (
                      <span className="text-[10px] text-green-400 flex items-center gap-1 font-semibold animate-in fade-in slide-in-from-bottom-1">
                        <Check className="h-3 w-3" /> Copied to clipboard
                      </span>
                    ) : (
                      <span className="text-[10px] text-royal-primary opacity-0 transition-opacity group-hover:opacity-100 font-semibold">
                        Click to copy
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {order.playerNickname && (
              <div className="mb-6 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-green-400" />
                <div className="text-sm">
                  <span className="text-royal-muted">Verified Nickname: </span>
                  <span className="font-bold text-green-300">{order.playerNickname}</span>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-4">
              {needsAction && (
                <button
                  onClick={() => updateStatus("PROCESSING")}
                  disabled={updating}
                  className="px-6 py-3 rounded-xl border border-yellow-500/40 bg-yellow-500/10 text-sm font-bold text-yellow-300 transition-all hover:bg-yellow-500/20 hover:border-yellow-500/60 disabled:opacity-50"
                >
                  Mark as Processing
                </button>
              )}

              <button
                onClick={() => updateStatus("DELIVERED")}
                disabled={updating}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-xl bg-royal-primary px-8 py-3 text-sm font-bold text-black shadow-lg shadow-royal-primary/20 transition-all hover:shadow-royal-primary/40 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50"
              >
                {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Confirm Delivery
              </button>

              <button
                onClick={() => updateStatus("FAILED")}
                disabled={updating}
                className="px-6 py-3 rounded-xl border border-red-500/40 bg-red-500/10 text-sm font-bold text-red-300 transition-all hover:bg-red-500/20 hover:border-red-500/60 disabled:opacity-50"
              >
                Mark Failed
              </button>
            </div>
          </div>
        );
      })()}

      <div className="grid md:grid-cols-2 gap-6">
        <div className="card p-6">
          <h3 className="text-[10px] uppercase font-bold tracking-[0.1em] text-royal-muted mb-4 flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 text-royal-primary" />
            Internal Delivery Note
          </h3>
          <textarea
            className="input text-sm min-h-[100px]"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add internal notes about this order (e.g. 'Topped up via official shop')..."
          />
          <button 
            onClick={() => updateStatus(order.status)}
            disabled={updating}
            className="mt-3 text-xs font-bold text-royal-primary hover:underline inline-flex items-center gap-1.5"
          >
            <Save className="h-3 w-3" /> Save Note Only
          </button>
        </div>

        {(order.status === "FAILED" || order.failureReason) && (
          <div className="card p-6 border-red-500/30 bg-red-500/5">
            <h3 className="text-[10px] uppercase font-bold tracking-[0.1em] text-red-400 mb-4 flex items-center gap-2">
              <XCircle className="h-3.5 w-3.5" />
              Failure Information
            </h3>
            <label className="text-[10px] font-bold text-red-400/70 uppercase mb-1.5 block">Reason for failure</label>
            <input
              className="input border-red-500/30 bg-black/30 text-sm mb-4"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Invalid UID / Server Mismatch"
            />
            <div className="flex items-start gap-2 text-xs text-red-400/80">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <p>Failure reasons are visible to customers if provided.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
