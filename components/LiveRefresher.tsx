"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * This component automatically refreshes the server data every 30 seconds
 * without a full page reload. This ensures that when the admin adds new
 * games, banners, or products, they appear for users without them needing
 * to manually press the refresh button.
 */
export default function LiveRefresher() {
  const router = useRouter();

  useEffect(() => {
    // Refresh every 30 seconds
    const interval = setInterval(() => {
      router.refresh();
    }, 30000);

    return () => clearInterval(interval);
  }, [router]);

  return null;
}
