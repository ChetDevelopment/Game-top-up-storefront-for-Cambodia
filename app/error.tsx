"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[ErrorBoundary]", error.message);
  }, [error]);

  return (
    <div className="min-h-screen bg-royal-bg flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-royal-card rounded-2xl p-8 text-center border border-royal-border/30 shadow-xl">
        <div className="mx-auto w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
          <AlertTriangle className="h-8 w-8 text-red-400" />
        </div>
        <h2 className="text-xl font-bold text-royal-text mb-2">Something went wrong</h2>
        <p className="text-royal-text/60 text-sm mb-6">
          {error.message.includes("Can't reach database server")
            ? "Unable to connect to the database. Please ensure your database server is running and accessible."
            : "An unexpected error occurred. Please try again."}
        </p>
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-royal-primary hover:bg-royal-primary/80 text-white font-semibold transition-all"
        >
          <RefreshCw className="h-4 w-4" />
          Try again
        </button>
      </div>
    </div>
  );
}
