"use client";

import { useState, useEffect } from "react";

export function useCsrfToken() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/csrf")
      .then((res) => res.json())
      .then((data) => {
        setToken(data.csrfToken || null);
      })
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  return { token, loading };
}
