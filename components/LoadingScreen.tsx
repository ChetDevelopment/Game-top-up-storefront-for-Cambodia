import { Loader2 } from "lucide-react";

interface Props {
  label?: string;
  fullscreen?: boolean;
}

export default function LoadingScreen({ label = "Loading...", fullscreen = true }: Props) {
  return (
    <div
      className={
        fullscreen
          ? "flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4"
          : "flex flex-col items-center justify-center gap-4 py-12"
      }
    >
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-royal-primary/20 blur-xl animate-pulse" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full border-2 border-royal-primary/40 bg-royal-card shadow-lg shadow-royal-primary/30">
          <Loader2 className="h-7 w-7 animate-spin text-royal-primary" strokeWidth={2.5} />
        </div>
      </div>
      <div className="flex flex-col items-center gap-1">
        <span className="font-display text-sm font-semibold tracking-wide text-royal-text">
          {label}
        </span>
        <div className="flex gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-royal-primary animate-bounce [animation-delay:-0.3s]" />
          <span className="h-1.5 w-1.5 rounded-full bg-royal-primary animate-bounce [animation-delay:-0.15s]" />
          <span className="h-1.5 w-1.5 rounded-full bg-royal-primary animate-bounce" />
        </div>
      </div>
    </div>
  );
}

