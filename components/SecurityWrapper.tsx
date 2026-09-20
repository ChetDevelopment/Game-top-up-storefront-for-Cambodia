"use client";

import React, { useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

const SENSITIVE_PATHS = [
  "/admin",
  "/account",
  "/checkout",
  "/order",
  "/api/admin",
];

export default function SecurityWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [isBlurred, setIsBlurred] = useState(false);
  const [showWarning, setShowWarning] = useState(false);

  const isSensitive = SENSITIVE_PATHS.some((path) => pathname?.startsWith(path));

  const triggerWarning = useCallback(() => {
    setShowWarning(true);
    setTimeout(() => setShowWarning(false), 3000);
  }, []);

  const handleCopy = useCallback((e: ClipboardEvent) => {
    if (isSensitive) {
      e.preventDefault();
      triggerWarning();
      return false;
    }
  }, [isSensitive, triggerWarning]);

  const handleContextMenu = useCallback((e: MouseEvent) => {
    if (isSensitive) {
      e.preventDefault();
      triggerWarning();
      return false;
    }
  }, [isSensitive, triggerWarning]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isSensitive) return;

    // Block PrintScreen only (allow DevTools and other shortcuts)
    if (e.key === "PrintScreen") {
      e.preventDefault();
      try {
        if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText("Screenshots are restricted.");
        }
      } catch (err) {}
      triggerWarning();
    }

    // Allow F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U for debugging
    // Only block screenshot-related shortcuts
    const metaOrCtrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;
    const key = e.key.toLowerCase();

    if (
      (metaOrCtrl && (key === "c" || key === "u" || key === "p" || key === "s")) ||
      (metaOrCtrl && shift && (key === "s"))
    ) {
      e.preventDefault();
      triggerWarning();
      
      // If they hit a screenshot shortcut, blur the screen immediately as a precaution
      if (key === "s" && shift) {
        setIsBlurred(true);
      }
      
      return false;
    }
  }, [isSensitive, triggerWarning]);

  const handleVisibilityChange = useCallback(() => {
    if (isSensitive && document.visibilityState === "hidden") {
      setIsBlurred(true);
    }
  }, [isSensitive]);

  const handleBlur = useCallback(() => {
    if (isSensitive) {
      setIsBlurred(true);
    }
  }, [isSensitive]);

  const handleFocus = useCallback(() => {
    setIsBlurred(false);
  }, []);

  const handleDragStart = useCallback((e: DragEvent) => {
    if (isSensitive) {
      const target = e.target as HTMLElement;
      if (target.tagName === "IMG" || target.tagName === "VIDEO") {
        e.preventDefault();
        return false;
      }
    }
  }, [isSensitive]);

  useEffect(() => {
    if (isSensitive) {
      window.addEventListener("keydown", handleKeyDown);
      window.addEventListener("contextmenu", handleContextMenu);
      window.addEventListener("copy", handleCopy);
      window.addEventListener("visibilitychange", handleVisibilityChange);
      window.addEventListener("blur", handleBlur);
      window.addEventListener("focus", handleFocus);
      window.addEventListener("dragstart", handleDragStart);

      // DevTools detection - DISABLED for debugging
      // const checkDevTools = () => {
      //   const threshold = 160;
      //   if (window.outerWidth - window.innerWidth > threshold || window.outerHeight - window.innerHeight > threshold) {
      //     setIsBlurred(true);
      //   }
      // };
      // const interval = setInterval(checkDevTools, 1000);

      return () => {
        window.removeEventListener("keydown", handleKeyDown);
        window.removeEventListener("contextmenu", handleContextMenu);
        window.removeEventListener("copy", handleCopy);
        window.removeEventListener("visibilitychange", handleVisibilityChange);
        window.removeEventListener("blur", handleBlur);
        window.removeEventListener("focus", handleFocus);
        window.removeEventListener("dragstart", handleDragStart);
        // clearInterval(interval);
      };
    }
  }, [isSensitive, handleKeyDown, handleContextMenu, handleCopy, handleVisibilityChange, handleBlur, handleFocus, handleDragStart]);

  const watermarkText = session?.user 
    ? `${(session.user as any).id || session.user.email} · ${new Date().toLocaleDateString()}`
    : "Protected Content · Unauthorized access restricted";

  return (
    <div className={`relative ${isSensitive ? "select-none" : ""}`}>
      {isSensitive && (
        <style dangerouslySetInnerHTML={{ __html: `
          img, video {
            -webkit-user-drag: none !important;
            user-drag: none !important;
            pointer-events: none !important;
          }
          a img, button img, .allow-interaction img {
            pointer-events: auto !important;
          }
        `}} />
      )}
      
      {/* Content */}
      <div 
        className={`transition-all duration-500 ${isBlurred && isSensitive ? "blur-2xl grayscale brightness-50 pointer-events-none" : ""}`}
      >
        {children}
      </div>

      {/* Watermark Overlay */}
      {isSensitive && (
        <div className="fixed inset-0 pointer-events-none z-[60] overflow-hidden opacity-[0.04] select-none grid grid-cols-4 grid-rows-5 gap-10 p-10">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="text-[10px] md:text-xs font-bold whitespace-nowrap uppercase tracking-widest flex items-center justify-center border border-black/10 rounded"
              style={{ transform: "rotate(-35deg)" }}
            >
              {watermarkText}
            </div>
          ))}
        </div>
      )}

      {/* Warning Message */}
      {showWarning && (
        <div className="fixed top-10 left-1/2 -translate-x-1/2 z-[100] bg-black/90 text-white px-6 py-3 rounded-xl shadow-2xl border border-white/20 backdrop-blur-md animate-in fade-in zoom-in duration-300">
          <div className="flex items-center gap-3">
            <span className="bg-red-500 w-2 h-2 rounded-full animate-pulse" />
            <p className="text-sm font-medium">Screenshots and copying are restricted on this platform.</p>
          </div>
        </div>
      )}

      {/* Blur Overlay Message */}
      {isBlurred && isSensitive && (
        <div 
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 backdrop-blur-md cursor-pointer"
          onClick={() => setIsBlurred(false)}
        >
          <div className="bg-white dark:bg-zinc-900 p-8 rounded-2xl shadow-2xl text-center max-w-sm border border-white/10 scale-in-center">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m11 3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Security Protection</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              Content is hidden to protect sensitive information. Click anywhere or focus the window to resume.
            </p>
            <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors">
              Continue Viewing
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
