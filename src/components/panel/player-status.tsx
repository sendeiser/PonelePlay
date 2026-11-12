import { AlertTriangle, Monitor, Wifi } from "lucide-react";
import { isPlayerOnline } from "@/lib/domain/night";

interface PlayerStatusProps {
  lastSeenAt?: string | null;
  onPair?: () => void;
}

export function PlayerStatus({ lastSeenAt, onPair }: PlayerStatusProps) {
  const online = isPlayerOnline(lastSeenAt);

  return (
    <div className="flex items-center justify-between rounded-xl border border-th-border bg-th-recessed p-3">
      <div className="flex items-center gap-2.5">
        <div
          className={`grid size-8 place-items-center rounded-lg ${
            online ? "bg-th-emerald-soft text-th-emerald" : "bg-th-danger-soft text-th-danger"
          }`}
        >
          <Monitor className="size-4" aria-hidden="true" />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-th-text-2">
              Reproductor TV
            </span>
            <span
              className={`size-1.5 rounded-full ${
                online ? "bg-th-emerald animate-pulse" : "bg-th-danger"
              }`}
            />
          </div>
          <p className="text-xs text-th-muted">
            {online ? (
              <span className="flex items-center gap-1 text-th-emerald font-medium">
                <Wifi className="size-3" /> Conectado
              </span>
            ) : (
              <span className="flex items-center gap-1 text-th-danger font-medium">
                <AlertTriangle className="size-3" /> Desconectado ({">"} 45s)
              </span>
            )}
          </p>
        </div>
      </div>

      {onPair ? (
        <button
          type="button"
          onClick={onPair}
          className="rounded-lg border border-th-border bg-th-card px-2.5 py-1 text-xs font-semibold text-th-text-2 hover:bg-th-hover hover:text-th-text transition-colors cursor-pointer"
        >
          Vincular
        </button>
      ) : null}
    </div>
  );
}
