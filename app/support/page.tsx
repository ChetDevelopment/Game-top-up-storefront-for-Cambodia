"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { MessageSquare, Plus, Loader2, Send, AlertCircle, CheckCircle2 } from "lucide-react";

export default function SupportPage() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<"ORDER_ISSUE" | "REFUND" | "GENERAL" | "BUG">("GENERAL");
  const [sent, setSent] = useState(false);

  async function loadTickets() {
    setLoading(true);
    try {
      const res = await fetch("/api/user/tickets");
      if (res.ok) setTickets(await res.json());
    } catch {}
    setLoading(false);
  }

  useEffect(() => { loadTickets(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const res = await fetch("/api/user/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, category, message }),
    });
    setSubmitting(false);
    if (res.ok) {
      setSent(true);
      setShowForm(false);
      loadTickets();
    }
  }

  return (
    <div className="min-h-screen bg-royal-bg text-royal-text">
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-3xl font-bold">Support</h1>
            <p className="text-royal-muted">We're here to help</p>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="btn-primary">
            <Plus className="h-4 w-4 mr-2" /> New Ticket
          </button>
        </div>

        {showForm && !sent && (
          <form onSubmit={handleSubmit} className="card p-6 mb-8">
            <h3 className="font-bold mb-4">Create New Ticket</h3>
            <div className="space-y-4">
              <div>
                <label className="label">Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="input"
                  required
                />
              </div>
              <div>
                <label className="label">Category</label>
                <select value={category} onChange={(e) => setCategory(e.target.value as any)} className="input">
                  <option value="GENERAL">General</option>
                  <option value="ORDER_ISSUE">Order Issue</option>
                  <option value="REFUND">Refund</option>
                  <option value="BUG">Bug Report</option>
                </select>
              </div>
              <div>
                <label className="label">Message</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="input min-h-[150px]"
                  required
                />
              </div>
              <button type="submit" disabled={submitting} className="btn-primary w-full">
                {submitting ? <Loader2 className="h-5 w-5 animate-spin mx-auto" /> : "Submit Ticket"}
              </button>
            </div>
          </form>
        )}

        {sent && (
          <div className="card p-8 mb-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-400 mx-auto mb-4" />
            <h3 className="font-bold text-lg mb-2">Ticket Submitted!</h3>
            <p className="text-royal-muted">We'll respond within 24 hours.</p>
            <button onClick={() => setSent(false)} className="btn-ghost mt-4">Submit Another</button>
          </div>
        )}

        <div className="space-y-4">
          {loading ? (
            <div className="flex justify-center p-12">
              <Loader2 className="h-8 w-8 text-royal-primary animate-spin" />
            </div>
          ) : tickets.length === 0 ? (
            <div className="card p-12 text-center text-royal-muted">
              No tickets yet. We're here to help!
            </div>
          ) : (
            tickets.map((ticket: any) => (
              <div key={ticket.id} className="card p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="font-bold">{ticket.subject}</h4>
                    <div className="flex gap-2 mt-1 text-xs text-royal-muted">
                      <span className={`px-2 py-0.5 rounded ${
                        ticket.priority === "URGENT" ? "bg-red-500/20 text-red-400" :
                        ticket.priority === "HIGH" ? "bg-orange-500/20 text-orange-400" :
                        "bg-royal-surface text-royal-muted"
                      }`}>{ticket.priority}</span>
                      <span>{ticket.category}</span>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs ${
                    ticket.status === "RESOLVED" ? "bg-green-500/20 text-green-400" :
                    ticket.status === "IN_PROGRESS" ? "bg-blue-500/20 text-blue-400" :
                    "bg-royal-surface text-royal-muted"
                  }`}>{ticket.status}</span>
                </div>
                <p className="text-sm text-royal-muted mb-2">{ticket.message}</p>
                {ticket.response && (
                  <div className="mt-3 pt-3 border-t border-royal-border">
                    <p className="text-sm"><span className="font-bold">Response:</span> {ticket.response}</p>
                  </div>
                )}
                <p className="text-xs text-royal-muted mt-3">{new Date(ticket.createdAt).toLocaleString()}</p>
              </div>
            ))
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}