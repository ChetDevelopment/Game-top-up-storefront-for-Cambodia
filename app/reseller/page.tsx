"use client";

import { useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Store, Send, Loader2, CheckCircle2, Users, TrendingUp, Gift } from "lucide-react";

export default function ResellerPage() {
  const [form, setForm] = useState({ name: "", phone: "", website: "", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"info" | "register">("info");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/reseller/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, email: "reseller@application" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-royal-bg text-royal-text">
        <Header />
        <main className="max-w-2xl mx-auto px-4 py-24 text-center">
          <div className="card p-12">
            <CheckCircle2 className="h-16 w-16 text-green-400 mx-auto mb-6" />
            <h1 className="font-display text-3xl font-bold mb-4">Application Submitted!</h1>
            <p className="text-royal-muted">
              We'll review your application and get back to you within 24-48 hours.
            </p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (step === "info") {
    return (
      <div className="min-h-screen bg-royal-bg text-royal-text">
        <Header />
        <main className="max-w-4xl mx-auto px-4 py-16">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-royal-primary/30 bg-royal-primary/5 mb-4">
              <Store className="h-3 w-3 text-royal-primary" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-royal-primary">Partner Program</span>
            </div>
            <h1 className="font-display text-4xl md:text-5xl font-black mb-4">
              Become a <span className="text-gradient">Reseller</span>
            </h1>
            <p className="text-royal-muted text-lg max-w-xl mx-auto">
              Start earning with wholesale pricing, bulk orders, and dedicated support.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-12">
            {[
              { icon: TrendingUp, title: "Wholesale Pricing", desc: "Get up to 30% off retail prices" },
              { icon: Users, title: "Sub-Resellers", desc: "Build your own network" },
              { icon: Gift, title: "Priority Support", desc: "Dedicated account manager" },
            ].map((item, i) => (
              <div key={i} className="card p-6 text-center">
                <item.icon className="h-8 w-8 text-royal-primary mx-auto mb-4" />
                <h3 className="font-bold mb-2">{item.title}</h3>
                <p className="text-sm text-royal-muted">{item.desc}</p>
              </div>
            ))}
          </div>

          <div className="text-center">
            <button onClick={() => setStep("register")} className="btn-primary px-10 py-5 text-lg">
              Apply Now <Send className="h-5 w-5 ml-2" />
            </button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-royal-bg text-royal-text">
      <Header />
      <main className="max-w-xl mx-auto px-4 py-16">
        <h1 className="font-display text-3xl font-bold mb-8">Reseller Application</h1>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="label">Business / Your Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input"
              required
            />
          </div>
          
          <div>
            <label className="label">Phone Number</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="input"
              required
            />
          </div>
          
          <div>
            <label className="label">Website (optional)</label>
            <input
              type="url"
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
              className="input"
              placeholder="https://"
            />
          </div>
          
          <div>
            <label className="label">Message (optional)</label>
            <textarea
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              className="input min-h-[100px]"
              placeholder="Tell us about your business..."
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button type="submit" disabled={submitting} className="btn-primary w-full py-4">
            {submitting ? <Loader2 className="h-5 w-5 animate-spin mx-auto" /> : "Submit Application"}
          </button>
        </form>
      </main>
      <Footer />
    </div>
  );
}