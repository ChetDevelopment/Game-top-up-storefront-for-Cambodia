"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

interface HomePopupProps {
  settings: {
    popupActive: boolean;
    popupTitle?: string | null;
    popupContent?: string | null;
    popupImageUrl?: string | null;
    updatedAt?: string | Date;
  } | null;
  forceShow?: boolean;
  onClose?: () => void;
}

export default function HomePopup({ settings, forceShow, onClose }: HomePopupProps) {
  const [isOpen, setIsOpen] = useState(false);

useEffect(() => {
    if (!settings?.popupActive && !forceShow) return;
    if (forceShow) {
      setIsOpen(true);
      return;
    }

    const popupKey = "home_popup_closed";
    const lastUpdate = settings?.updatedAt ? new Date(settings.updatedAt).getTime().toString() : "0";
    
    // Show popup on every page refresh - use sessionStorage so it resets on new session
    // User closes popup -> stores lastUpdate -> next refresh shows again if active
    // Unless admin just disabled popup (different flow)
    const seenData = sessionStorage.getItem(popupKey);
    
    // Show if never closed this session OR if settings were updated since last close
    if (!seenData || seenData !== lastUpdate) {
      const timer = setTimeout(() => setIsOpen(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [settings, forceShow]);

  const closePopup = () => {
    setIsOpen(false);
    if (onClose) onClose();
    // Store timestamp when closed - next refresh will show popup again
    sessionStorage.setItem("home_popup_closed", Date.now().toString());
  };

  if (!isOpen || !settings) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 backdrop-blur-sm bg-black/60 animate-in fade-in duration-300">
      <div 
        className="relative w-full max-w-lg bg-royal-bg border border-royal-border rounded-[2rem] overflow-hidden shadow-2xl shadow-royal-primary/20 animate-in zoom-in-95 slide-in-from-bottom-4 duration-500"
      >
        {/* Close Button */}
        <button 
          onClick={closePopup}
          className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/40 text-white/70 hover:text-white transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Content */}
        <div className="flex flex-col">
          {settings.popupImageUrl && (
            <div className="relative h-48 sm:h-64 w-full">
              <img 
                src={settings.popupImageUrl} 
                alt="Announcement" 
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-royal-bg via-transparent to-transparent" />
            </div>
          )}

          <div className="p-8 pt-6">
            <h2 className="font-display text-2xl sm:text-3xl font-black mb-3 tracking-tight text-gradient">
              {settings.popupTitle || "Announcement"}
            </h2>
            <div className="text-royal-muted leading-relaxed whitespace-pre-wrap text-sm sm:text-base mb-8">
              {settings.popupContent}
            </div>

            <button 
              onClick={closePopup}
              className="w-full btn-primary py-4 text-sm font-black uppercase tracking-widest"
            >
              GOT IT, MISSION START
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
