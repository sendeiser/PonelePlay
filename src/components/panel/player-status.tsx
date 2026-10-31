import { AlertTriangle, Monitor, Wifi } from "lucide-react";
import { isPlayerOnline } from "@/lib/domain/night";

interface PlayerStatusProps {
  lastSeenAt?: string | null;
  onPair?: () => void;
}

export function PlayerStatus({ lastSeenAt, onPair }: PlayerStatusProps) {
  const online = isPlayerOnline(lastSeenAt);

  return (
    <div className="flex items-center justify-between rounded-xl border border-cream/10 bg-felt-900/60 p-3">
      <div className="flex items-center gap-2.5">
        <div
          className={`grid size-8 place-items-center rounded-lg ${
            online ? "bg-mint/10 text-mint" : "bg-coral/10 text-coral"
          }`}
        >
          <Monitor className="size-4" aria-hidden="true" />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-cream/70">
              Reproductor TV
            </span>
            <span
              className={`size-1.5 rounded-full ${
                online ? "bg-mint animate-pulse" : "bg-coral"
              }`}
            />
          </div>
          <p className="text-xs text-cream/50">
            {online ? (
              <span className="flex items-center gap-1 text-mint">
                <Wifi className="size-3" /> Conectado
              </span>
            ) : (
              <span className="flex items-center gap-1 text-coral">
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
          className="rounded-lg border border-cream/15 bg-cream/5 px-2.5 py-1 text-[11px] font-semibold text-cream/70 hover:bg-cream/10 hover:text-cream"
        >
          Vincular
        </button>
      ) : null}
    </div>
  );
}
