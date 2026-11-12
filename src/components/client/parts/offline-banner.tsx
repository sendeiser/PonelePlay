import { WifiOff } from "lucide-react";

export function OfflineBanner() {
  return (
    <div
      role="alert"
      className="flex items-center justify-center gap-2 bg-th-danger px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-white shadow-md"
    >
      <WifiOff className="size-3.5" aria-hidden="true" />
      <span>Sin conexión. Reintentando automáticamente...</span>
    </div>
  );
}

