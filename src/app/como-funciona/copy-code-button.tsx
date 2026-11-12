"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

interface CopyCodeButtonProps {
  code: string;
}

export function CopyCodeButton({ code }: CopyCodeButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = code;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
        copied
          ? "bg-th-emerald-soft text-th-emerald border-th-emerald/40"
          : "bg-th-card hover:bg-th-recessed text-th-secondary hover:text-th-text border-th-border"
      }`}
      aria-label="Copiar código Downloader"
    >
      {copied ? (
        <>
          <Check className="size-3.5 text-th-emerald" />
          <span>¡Copiado!</span>
        </>
      ) : (
        <>
          <Copy className="size-3.5 text-th-muted" />
          <span>Copiar código</span>
        </>
      )}
    </button>
  );
}

