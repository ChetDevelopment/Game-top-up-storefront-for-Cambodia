"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type CurrencyCode = "USD" | "KHR";

interface CurrencyContextValue {
  currency: CurrencyCode;
  exchangeRate: number; // KHR per 1 USD
  setCurrency: (c: CurrencyCode) => void;
  toggle: () => void;
  /** Format a USD amount as the active display currency. */
  format: (usd: number) => string;
  /** Convert USD → KHR (rounded to nearest 100). */
  toKhr: (usd: number) => number;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

const STORAGE_KEY = "tykhai:currency";

export function CurrencyProvider({
  children,
  exchangeRate,
}: {
  children: React.ReactNode;
  exchangeRate: number;
}) {
  const [currency, setCurrencyState] = useState<CurrencyCode>("USD");
  const [hydrated, setHydrated] = useState(false);

  // Restore from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "USD" || saved === "KHR") {
        setCurrencyState(saved);
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  const setCurrency = useCallback((c: CurrencyCode) => {
    setCurrencyState(c);
    try {
      localStorage.setItem(STORAGE_KEY, c);
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback(() => {
    setCurrency(currency === "USD" ? "KHR" : "USD");
  }, [currency, setCurrency]);

  const toKhr = useCallback(
    (usd: number) => Math.round((usd * exchangeRate) / 100) * 100,
    [exchangeRate]
  );

  const format = useCallback(
    (usd: number) => {
      if (currency === "KHR") {
        return `${toKhr(usd).toLocaleString("en-US")} ៛`;
      }
      return `$${usd.toFixed(2)}`;
    },
    [currency, toKhr]
  );

  const value = useMemo<CurrencyContextValue>(
    () => ({ currency, exchangeRate, setCurrency, toggle, format, toKhr }),
    [currency, exchangeRate, setCurrency, toggle, format, toKhr]
  );

  // Avoid a flash of wrong currency before hydration — render with USD default,
  // the transition to the stored currency happens in one tick post-mount.
  void hydrated;

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext);
  if (!ctx) {
    // Return a default context value for SSR
    // This prevents errors during server-side rendering
    return {
      currency: "USD",
      exchangeRate: 4100,
      setCurrency: () => {},
      toggle: () => {},
      format: (usd: number) => `$${usd.toFixed(2)}`,
      toKhr: (usd: number) => Math.round((usd * 4100) / 100) * 100,
    };
  }
  return ctx;
}
