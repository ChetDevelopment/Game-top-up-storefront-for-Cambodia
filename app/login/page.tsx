"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Mail, Lock, User, LogIn, UserPlus, Ghost, ShieldCheck, Sparkles, Zap, Clock } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const modeParam = searchParams?.get("mode");
  const [mode, setMode] = useState<"login" | "register">(
    modeParam === "register" ? "register" : "login"
  );
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [form, setForm] = useState({ email: "", password: "", name: "" });
  const [error, setError] = useState<string | null>(null);

  // Check if user is already logged in
  useEffect(() => {
    fetch("/api/user/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.user) {
          router.replace("/");
        } else {
          setChecking(false);
        }
      })
      .catch(() => setChecking(false));
  }, [router]);

  useEffect(() => {
    setMode(modeParam === "register" ? "register" : "login");
  }, [modeParam]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const endpoint = mode === "login" ? "/api/user/auth/login" : "/api/user/auth/register";
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");

      router.push("/");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-royal-bg flex items-center justify-center">
        <div className="h-12 w-12 border-4 border-royal-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-royal-bg flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 royal-grid opacity-30 pointer-events-none" />
      <div className="absolute top-1/4 left-1/4 h-[500px] w-[500px] bg-royal-primary/10 blur-[120px] rounded-full animate-float" />
      <div className="absolute bottom-1/4 right-1/4 h-[500px] w-[500px] bg-royal-accent/10 blur-[120px] rounded-full animate-float-slow" />

      <Link href="/" className="absolute top-8 left-8 flex items-center gap-2 text-royal-muted hover:text-royal-primary transition-colors font-bold uppercase tracking-widest text-xs">
        <ArrowLeft className="h-4 w-4" />
        Back to Portal
      </Link>

      <div className="w-full max-w-[1000px] grid lg:grid-cols-2 gap-8 relative z-10">
        {/* Left Side: Brand & Perks */}
        <div className="hidden lg:flex flex-col justify-center p-8">
          <div className="mb-12">
            <h1 className="text-5xl font-black text-white mb-4 leading-tight">
              JOIN THE <span className="text-transparent bg-clip-text bg-gradient-to-r from-royal-primary to-royal-accent">ELITE.</span>
            </h1>
            <p className="text-royal-muted text-lg">Elevate your gaming experience with a Ty Khai account.</p>
          </div>

          <div className="grid gap-6">
            {[
              { icon: ShieldCheck, title: "Secure Vault", desc: "Save multiple Game IDs and never type them again." },
              { icon: Zap, title: "Priority Drops", desc: "Members get processed first during peak event hours." },
              { icon: Sparkles, title: "Royal Rewards", desc: "Earn points on every top-up for future discounts." },
            ].map((perk, i) => (
              <div key={i} className="flex gap-4 p-4 rounded-2xl bg-royal-card/30 border border-royal-border/50 backdrop-blur-sm">
                <div className="h-12 w-12 rounded-xl bg-royal-primary/10 flex items-center justify-center shrink-0">
                  <perk.icon className="h-6 w-6 text-royal-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-royal-text">{perk.title}</h3>
                  <p className="text-sm text-royal-muted">{perk.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Side: Auth Box */}
        <div className="flex flex-col gap-6">
          <div className="card p-8 sm:p-10 relative overflow-hidden border-royal-primary/30 shadow-2xl shadow-royal-primary/10">
            {/* Form Header */}
            <div className="text-center mb-8">
              <div className="h-16 w-16 bg-gradient-to-br from-royal-primary to-royal-accent rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-lg shadow-royal-primary/40">
                {mode === "login" ? <LogIn className="h-8 w-8 text-black" /> : <UserPlus className="h-8 w-8 text-black" />}
              </div>
              <h2 className="text-2xl font-black uppercase tracking-tighter text-white">
                {mode === "login" ? "Welcome Back" : "Recruit Account"}
              </h2>
              <p className="text-sm text-royal-muted mt-1">Enter your coordinates to proceed</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "register" && (
                <div className="space-y-1.5">
                  <label className="label">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-royal-muted" />
                    <input
                      type="text"
                      required
                      className="input pl-11"
                      placeholder="Master Chief"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="label">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-royal-muted" />
                  <input
                    type="email"
                    required
                    className="input pl-11"
                    placeholder="gamer@example.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="label">Password</label>
                  {mode === "login" && (
                    <button type="button" className="text-[10px] font-bold text-royal-primary hover:underline uppercase tracking-widest">Forgot?</button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-royal-muted" />
                  <input
                    type="password"
                    required
                    className="input pl-11"
                    placeholder="••••••••"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-medium">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full py-4 mt-4"
              >
                {loading ? "Syncing..." : mode === "login" ? "INITIALIZE SESSION" : "CREATE PROFILE"}
              </button>
            </form>

            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-royal-border"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-royal-card px-4 text-royal-muted font-bold tracking-widest">Connect With Gamer ID</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => signIn("google", { callbackUrl: "/" })}
                className="flex items-center justify-center gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all group"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 12-4.53z" fill="#EA4335"/>
                </svg>
                <span className="text-xs font-bold text-white uppercase tracking-tighter">Google</span>
              </button>
              <button 
                onClick={() => signIn("discord", { callbackUrl: "/" })}
                className="flex items-center justify-center gap-3 px-4 py-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20 transition-all group"
              >
                <svg className="h-5 w-5 text-[#5865F2]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.074 0 0 0-.079-.037 19.736 19.736 0 0 0-4.885 1.515.069.069 0 0 0-.032.027C.533 9.048-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                </svg>
                <span className="text-xs font-bold text-white uppercase tracking-tighter">Discord</span>
              </button>
            </div>

            <div className="mt-8 pt-8 border-t border-royal-border text-center">
              <p className="text-sm text-royal-muted">
                {mode === "login" ? "New to the hub?" : "Already a member?"}
                <button
                  onClick={() => setMode(mode === "login" ? "register" : "login")}
                  className="ml-2 text-royal-primary font-bold hover:underline uppercase tracking-tighter"
                >
                  {mode === "login" ? "Register Now" : "Sign In"}
                </button>
              </p>
            </div>
          </div>

          {/* Guest Choice */}
          <div className="card p-6 border-dashed border-royal-muted/30 bg-transparent flex flex-col sm:flex-row items-center justify-between gap-4 group hover:border-royal-primary/50 transition-all">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-royal-muted/10 flex items-center justify-center text-royal-muted group-hover:text-royal-primary transition-colors">
                <Ghost className="h-6 w-6" />
              </div>
              <div>
                <h4 className="font-bold text-royal-text">Guest Checkout</h4>
                <p className="text-xs text-royal-muted">Fast & anonymous top-up</p>
              </div>
            </div>
            <Link href="/#games" className="btn-ghost py-2.5 px-6 text-xs font-black uppercase whitespace-nowrap">
              Continue as Guest
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
