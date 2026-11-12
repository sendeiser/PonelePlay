import { useEffect, useRef } from "react";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open && btnRef.current) {
      btnRef.current.focus();
    }
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-desc"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs p-4"
      onClick={onCancel}
    >
      <div
        className="card-panel rounded-2xl p-6 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="confirm-title"
          className="text-lg font-display font-bold text-th-text mb-2"
        >
          {title}
        </h2>
        <p id="confirm-desc" className="text-sm text-th-text-2 mb-6 leading-relaxed">
          {description}
        </p>
        <div className="flex gap-2.5 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="h-10 px-4 rounded-xl border border-th-border bg-th-recessed text-sm font-medium text-th-text hover:bg-th-hover transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            ref={btnRef}
            type="button"
            onClick={onConfirm}
            className="h-10 px-4 rounded-xl bg-th-accent hover:bg-th-accent-hover text-white text-sm font-semibold transition-colors cursor-pointer"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
