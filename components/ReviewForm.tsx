"use client";

import { useState } from "react";
import { Star, Send, Loader2, CheckCircle2 } from "lucide-react";

interface ReviewFormProps {
  orderId: string;
  orderNumber: string;
  productId: string;
  productName: string;
  onSuccess?: () => void;
}

export default function ReviewForm({ orderId, orderNumber, productId, productName, onSuccess }: ReviewFormProps) {
  const [rating, setRating] = useState(5);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderNumber,
          rating,
          comment,
          customerName: name || "Anonymous Player"
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to submit review");
      }

      setSubmitted(true);
      if (onSuccess) setTimeout(onSuccess, 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="p-8 text-center animate-in fade-in zoom-in duration-500">
        <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="text-green-500 w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Review Submitted!</h3>
        <p className="text-royal-muted text-sm">Thank you for your feedback, Player.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-bold text-white mb-1">Rate your experience</h3>
        <p className="text-xs text-royal-muted uppercase tracking-widest">{productName}</p>
      </div>

      <div className="flex justify-center gap-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => setRating(star)}
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(0)}
            className="focus:outline-none transition-transform hover:scale-125"
          >
            <Star
              size={32}
              className={`transition-colors ${
                (hover || rating) >= star ? "fill-yellow-400 text-yellow-400" : "text-royal-muted opacity-30"
              }`}
            />
          </button>
        ))}
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-royal-muted mb-2 block">Display Name</label>
          <input
            type="text"
            className="input"
            placeholder="e.g. ProGamer99 (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-royal-muted mb-2 block">Comment</label>
          <textarea
            className="input min-h-[100px] py-3 resize-none"
            placeholder="How was the delivery speed? Anything else to share?"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>
      </div>

      {error && <p className="text-red-400 text-xs text-center">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full btn-primary py-4 flex items-center justify-center gap-2"
      >
        {loading ? <Loader2 className="animate-spin h-5 w-5" /> : <Send size={18} />}
        {loading ? "Transmitting..." : "Submit Mission Report"}
      </button>
    </form>
  );
}
