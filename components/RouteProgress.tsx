"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";

function RouteProgressInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Trigger on every route change
    setVisible(true);
    setProgress(15);

    const step1 = setTimeout(() => setProgress(55), 80);
    const step2 = setTimeout(() => setProgress(85), 220);
    const done = setTimeout(() => {
      setProgress(100);
    }, 380);
    const hide = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 620);

    return () => {
      clearTimeout(step1);
      clearTimeout(step2);
      clearTimeout(done);
      clearTimeout(hide);
    };
  }, [pathname, searchParams]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[2px]"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 200ms" }}
    >
      <div
        className="h-full bg-gradient-to-r from-royal-primary via-royal-accent to-royal-gold shadow-[0_0_8px_rgba(255,107,26,0.7)]"
        style={{
          width: `${progress}%`,
          transition: "width 200ms ease-out",
        }}
      />
    </div>
  );
}

export default function RouteProgress() {
  return (
    <Suspense fallback={null}>
      <RouteProgressInner />
    </Suspense>
  );
}

