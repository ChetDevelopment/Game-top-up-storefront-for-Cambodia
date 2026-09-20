"use client";

import { useState, useEffect, useCallback } from "react";

export function useCsrfToken() {
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchToken = useCallback(async () => {
    try {
      const res = await fetch("/api/csrf");
      if (res.ok) {
        const data = await res.json();
        setCsrfToken(data.csrfToken);
      }
    } catch (err) {
      console.error("Failed to fetch CSRF token", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchToken();
  }, [fetchToken]);

  return { csrfToken, loading, refetch: fetchToken };
}

export async function apiFetch(url: string, options: RequestInit = {}) {
  const res = await fetch("/api/csrf");
  let csrfToken: string | null = null;
  if (res.ok) {
    const data = await res.json();
    csrfToken = data.csrfToken;
  }

  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
    },
    credentials: "include",
  });
}
