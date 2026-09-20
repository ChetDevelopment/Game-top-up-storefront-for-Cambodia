"use client";

import { useEffect, useState } from "react";
import { Save, Pause, Play, TestTube } from "lucide-react";

export default function AdminSettingsPage() {
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [testingG2Bulk, setTestingG2Bulk] = useState(false);
  const [testG2BulkResult, setTestG2BulkResult] = useState<any>(null);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then(setForm);
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
        await fetch("/api/admin/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            siteName: form.siteName,
            exchangeRate: Number(form.exchangeRate),
            supportTelegram: form.supportTelegram,
            supportEmail: form.supportEmail,
            maintenanceMode: form.maintenanceMode,
            maintenanceMessage: form.maintenanceMessage || null,
            announcement: form.announcement || null,
            announcementTone: form.announcementTone || "info",
            telegramBotToken: form.telegramBotToken || null,
            telegramChatId: form.telegramChatId || null,
            gameDropToken: form.gameDropToken || null,
            g2bulkToken: form.g2bulkToken || null,
            systemMode: form.systemMode || "AUTO",
            warningThreshold: form.warningThreshold || 20,
            criticalThreshold: form.criticalThreshold || 5,
            balanceCheckInterval: form.balanceCheckInterval || 5,
            alertCooldownMinutes: form.alertCooldownMinutes || 15,
          }),
        });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function testGameDrop() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/gamedrop/test", { method: "POST" });
      const data = await res.json();
      setTestResult(data);
    } catch (err: any) {
      setTestResult({ error: err.message });
    } finally {
      setTesting(false);
    }
  }

  async function testG2Bulk() {
    setTestingG2Bulk(true);
    setTestG2BulkResult(null);
    try {
      const res = await fetch("/api/admin/g2bulk/test", { method: "POST" });
      const data = await res.json();
      setTestG2BulkResult(data);
    } catch (err: any) {
      setTestG2BulkResult({ error: err.message });
    } finally {
      setTestingG2Bulk(false);
    }
  }

  async function toggleSystem(action: "pause" | "resume") {
    await fetch("/api/admin/system/" + action, { method: "POST" });
    const updated = await fetch("/api/admin/settings").then((r) => r.json());
    setForm(updated);
  }

  if (!form) return <div className="p-8 text-royal-muted">Loading...</div>;

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="font-display text-3xl font-bold mb-2">Settings</h1>
      <p className="text-royal-muted mb-6">Site-wide configuration.</p>

      <form onSubmit={save} className="card p-6 space-y-5">
        <div>
          <label className="label">Site Name</label>
          <input className="input" value={form.siteName || ""} onChange={(e) => setForm({ ...form, siteName: e.target.value })} />
        </div>

        <div>
          <label className="label">Exchange Rate (KHR per 1 USD)</label>
          <input className="input" type="number" value={form.exchangeRate || 4100} onChange={(e) => setForm({ ...form, exchangeRate: e.target.value })} />
          <p className="text-xs text-royal-muted mt-1">Used to show KHR equivalents alongside USD prices.</p>
        </div>

        <div>
          <label className="label">Support Telegram Handle</label>
          <input className="input" value={form.supportTelegram || ""} onChange={(e) => setForm({ ...form, supportTelegram: e.target.value })} placeholder="@yourhandle" />
        </div>

        <div>
          <label className="label">Support Email</label>
          <input className="input" type="email" value={form.supportEmail || ""} onChange={(e) => setForm({ ...form, supportEmail: e.target.value })} />
        </div>

        <div>
          <label className="label">Site-wide Announcement (optional)</label>
          <textarea
            className="input"
            rows={2}
            value={form.announcement || ""}
            onChange={(e) => setForm({ ...form, announcement: e.target.value })}
            placeholder="e.g. Special 10% bonus on Genshin top-ups this weekend!"
          />
          <div className="mt-2 flex gap-2">
            {(["info", "warning", "promo"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setForm({ ...form, announcementTone: t })}
                className={`text-xs px-3 py-1 rounded-full border ${
                  (form.announcementTone || "info") === t
                    ? "border-royal-primary bg-royal-primary/10 text-royal-primary"
                    : "border-royal-border text-royal-muted"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-3 p-4 rounded-lg border border-royal-border bg-royal-surface">
          <input
            type="checkbox"
            checked={form.maintenanceMode}
            onChange={(e) => setForm({ ...form, maintenanceMode: e.target.checked })}
          />
          <div className="flex-1">
            <div className="font-medium">Maintenance Mode</div>
            <div className="text-xs text-royal-muted">Blocks all new orders. Existing orders still process.</div>
          </div>
        </label>

        {form.maintenanceMode && (
          <div>
            <label className="label">Maintenance message (shown to customers)</label>
            <input
              className="input"
              value={form.maintenanceMessage || ""}
              onChange={(e) => setForm({ ...form, maintenanceMessage: e.target.value })}
              placeholder="We'll be back in 30 minutes — scheduled maintenance."
            />
          </div>
        )}

        <div className="pt-4 border-t border-royal-border">
          <h2 className="font-semibold mb-1">Telegram Notifications</h2>
          <p className="text-xs text-royal-muted mb-3">Get a message when an order is paid or delivered. Leave empty to disable.</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Bot token</label>
              <input
                className="input font-mono text-xs"
                value={form.telegramBotToken || ""}
                onChange={(e) => setForm({ ...form, telegramBotToken: e.target.value })}
                placeholder="123456:ABC-DEF..."
              />
            </div>
            <div>
              <label className="label">Chat ID</label>
              <input
                className="input font-mono text-xs"
                value={form.telegramChatId || ""}
                onChange={(e) => setForm({ ...form, telegramChatId: e.target.value })}
                placeholder="-1001234567890"
              />
            </div>
          </div>
        </div>

        {/* GameDrop API Config */}
        <div className="pt-4 border-t border-royal-border">
          <h2 className="font-semibold mb-1">GameDrop API</h2>
          <p className="text-xs text-royal-muted mb-3">Configure GameDrop reseller API for balance monitoring.</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">API Token</label>
              <input
                className="input font-mono text-xs"
                type="text"
                value={form.gameDropToken || ""}
                onChange={(e) => setForm({ ...form, gameDropToken: e.target.value })}
                placeholder="Enter GameDrop Shop API Token"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={testGameDrop}
                disabled={testing}
                className="btn-secondary text-xs"
              >
                {testing ? "Testing..." : "Test Connection"}
              </button>
              {testResult && (
                <span className={`text-xs ml-2 ${testResult.success ? "text-green-400" : "text-red-400"}`}>
                  {testResult.success ? `✓ Balance: $${testResult.balance}` : `✗ ${testResult.error}`}
                </span>
              )}
              {testResult?.details && (
                <pre className="text-xs text-red-400 mt-2 bg-royal-surface p-2 rounded overflow-auto max-h-32">
                  {JSON.stringify(testResult.details, null, 2)}
                </pre>
              )}
            </div>
          </div>
        </div>

        {/* G2Bulk API Config */}
        <div className="pt-4 border-t border-royal-border">
          <h2 className="font-semibold mb-1">G2Bulk API (Free Fire SGMY)</h2>
          <p className="text-xs text-royal-muted mb-3">Configure G2Bulk API for Free Fire Singapore/Malaysia top-ups.</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">API Token</label>
              <input
                className="input font-mono text-xs"
                type="text"
                value={form.g2bulkToken || ""}
                onChange={(e) => setForm({ ...form, g2bulkToken: e.target.value })}
                placeholder="Enter G2Bulk API Token"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={testG2Bulk}
                disabled={testingG2Bulk}
                className="btn-secondary text-xs"
              >
                {testingG2Bulk ? "Testing..." : "Test Connection"}
              </button>
              {testG2BulkResult && (
                <span className={`text-xs ml-2 ${testG2BulkResult.success ? "text-green-400" : "text-red-400"}`}>
                  {testG2BulkResult.success ? `✓ Balance: $${testG2BulkResult.balance}` : `✗ ${testG2BulkResult.error}`}
                </span>
              )}
              {testG2BulkResult?.details && (
                <pre className="text-xs text-red-400 mt-2 bg-royal-surface p-2 rounded overflow-auto max-h-32">
                  {JSON.stringify(testG2BulkResult.details, null, 2)}
                </pre>
              )}
            </div>
          </div>
        </div>

        {/* System Control */}
        <div className="pt-4 border-t border-royal-border">
          <h2 className="font-semibold mb-1">System Control</h2>
          <div className="card p-4 mb-3">
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="font-medium">System Status</div>
                <div className="text-xs text-royal-muted">
                  {form.systemStatus === "ACTIVE" ? "✅ Active — Accepting orders" : "⚠️ Paused — No new orders"}
                </div>
              </div>
              <div className="flex gap-2">
                {form.systemStatus === "ACTIVE" ? (
                  <button type="button" onClick={() => toggleSystem("pause")} className="btn-secondary text-xs">
                    <Pause className="w-3 h-3 mr-1" /> Pause
                  </button>
                ) : (
                  <button type="button" onClick={() => toggleSystem("resume")} className="btn-primary text-xs">
                    <Play className="w-3 h-3 mr-1" /> Resume
                  </button>
                )}
              </div>
            </div>
            {form.pauseReason && (
              <div className="text-xs text-royal-muted">Pause reason: {form.pauseReason}</div>
            )}
            {form.currentBalance !== null && (
              <div className="text-xs text-royal-muted mt-1">
                Current Balance: ${form.currentBalance?.toFixed(2) || "0.00"}
                {form.lastBalanceCheck && (
                  <span className="ml-2">(checked {new Date(form.lastBalanceCheck).toLocaleTimeString()})</span>
                )}
              </div>
            )}
          </div>

          <div className="grid sm:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="label">System Mode</label>
              <select
                className="input"
                value={form.systemMode || "AUTO"}
                onChange={(e) => setForm({ ...form, systemMode: e.target.value })}
              >
                <option value="AUTO">Auto (react to balance)</option>
                <option value="FORCE_OPEN">Force Open (ignore balance)</option>
                <option value="FORCE_CLOSE">Force Close (always paused)</option>
              </select>
            </div>
            <div>
              <label className="label">Warning Threshold ($)</label>
              <input
                className="input"
                type="number"
                step="0.01"
                value={form.warningThreshold || 20}
                onChange={(e) => setForm({ ...form, warningThreshold: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Critical Threshold ($)</label>
              <input
                className="input"
                type="number"
                step="0.01"
                value={form.criticalThreshold || 5}
                onChange={(e) => setForm({ ...form, criticalThreshold: e.target.value })}
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Balance Check Interval (minutes)</label>
              <input
                className="input"
                type="number"
                value={form.balanceCheckInterval || 5}
                onChange={(e) => setForm({ ...form, balanceCheckInterval: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Alert Cooldown (minutes)</label>
              <input
                className="input"
                type="number"
                value={form.alertCooldownMinutes || 15}
                onChange={(e) => setForm({ ...form, alertCooldownMinutes: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "Saving..." : "Save Settings"}
          </button>
          {saved && <span className="text-sm text-green-400">✓ Saved</span>}
        </div>
      </form>
    </div>
  );
}