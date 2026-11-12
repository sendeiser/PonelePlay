"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { Download, Share2, Sparkles, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface PwaContextValue {
  isInstallable: boolean;
  isInstalled: boolean;
  isIos: boolean;
  promptInstall: () => Promise<boolean>;
}

const PwaContext = createContext<PwaContextValue>({
  isInstallable: false,
  isInstalled: false,
  isIos: false,
  promptInstall: async () => false,
});

export function usePwa() {
  return useContext(PwaContext);
}

const PWA_DISMISSED_KEY = "poneleplay_pwa_banner_dismissed";

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [showIosModal, setShowIosModal] = useState(false);

  useEffect(() => {
    // 1. Register Service Worker
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((reg) => {
            console.log("[PWA] Service Worker registrado con éxito:", reg.scope);
          })
          .catch((err) => {
            console.warn("[PWA] Error registrando Service Worker:", err);
          });
      });
    }

    // 2. Check if already installed (standalone mode)
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true ||
      document.referrer.includes("android-app://");

    if (isStandalone) {
      setIsInstalled(true);
      return;
    }

    // 3. Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const iosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIos(iosDevice);

    // 4. Check dismissal state
    const dismissed = localStorage.getItem(PWA_DISMISSED_KEY);
    const dismissedTime = dismissed ? parseInt(dismissed, 10) : 0;
    const isDismissedRecently = Date.now() - dismissedTime < 24 * 60 * 60 * 1000; // 24 hours

    // 5. Listen for Android/Chrome beforeinstallprompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      if (!isDismissedRecently) {
        setShowBanner(true);
      }
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    // 6. If iOS and not dismissed and on mobile, show banner after 2s
    if (iosDevice && !isDismissedRecently && !isStandalone) {
      const timer = setTimeout(() => {
        setShowBanner(true);
      }, 2000);
      return () => {
        clearTimeout(timer);
        window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      };
    }

    // 7. Track successful installation
    window.addEventListener("appinstalled", () => {
      setIsInstalled(true);
      setShowBanner(false);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
    };
  }, []);

  const promptInstall = async (): Promise<boolean> => {
    if (isIos) {
      setShowIosModal(true);
      return true;
    }

    if (!deferredPrompt) {
      return false;
    }

    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setIsInstalled(true);
      setShowBanner(false);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  const handleDismiss = () => {
    setShowBanner(false);
    try {
      localStorage.setItem(PWA_DISMISSED_KEY, Date.now().toString());
    } catch {}
  };

  const isInstallable = Boolean(deferredPrompt) || isIos;

  return (
    <PwaContext.Provider
      value={{
        isInstallable,
        isInstalled,
        isIos,
        promptInstall,
      }}
    >
      {children}

      {/* FLOATING PWA INSTALL BANNER */}
      {showBanner && !isInstalled && (
        <div className="fixed bottom-20 inset-x-3 max-w-md mx-auto z-50 animate-in fade-in slide-in-from-bottom-5 duration-300">
          <div className="card-panel rounded-2xl p-3.5 shadow-xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="size-10 rounded-xl bg-th-accent flex items-center justify-center text-white shrink-0">
                <Sparkles className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-display font-bold text-th-text tracking-tight leading-tight">
                  Instalá PonelePlay
                </p>
                <p className="text-[11px] text-th-text-2 truncate mt-0.5">
                  Pantalla completa y acceso rápido desde tu celu
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void promptInstall()}
                className="px-3 py-1.5 rounded-xl bg-th-accent hover:bg-th-accent-hover active:scale-95 text-white text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="size-3.5" />
                <span>Instalar</span>
              </button>
              <button
                type="button"
                onClick={handleDismiss}
                aria-label="Cerrar aviso de instalación"
                className="size-8 rounded-lg text-th-muted hover:text-th-text flex items-center justify-center hover:bg-th-recessed transition-colors cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* iOS INSTALL INSTRUCTIONS MODAL */}
      {showIosModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm card-panel rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="size-8 rounded-xl bg-th-accent text-white flex items-center justify-center font-bold">
                  <Share2 className="size-4" />
                </div>
                <h3 className="text-sm font-display font-bold text-th-text">Instalar en iPhone / iPad</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowIosModal(false)}
                className="size-8 rounded-lg text-th-muted hover:text-th-text flex items-center justify-center hover:bg-th-recessed cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs text-th-text-2">
              <div className="flex items-start gap-2.5 bg-th-recessed p-3 rounded-xl border border-th-border">
                <span className="size-5 rounded-full bg-th-accent-soft text-th-accent font-mono font-bold flex items-center justify-center shrink-0">
                  1
                </span>
                <p>
                  Tocá el botón <strong className="text-th-text">Compartir</strong> <Share2 className="inline size-3.5 mx-0.5 text-th-accent" /> en la barra inferior de Safari.
                </p>
              </div>

              <div className="flex items-start gap-2.5 bg-th-recessed p-3 rounded-xl border border-th-border">
                <span className="size-5 rounded-full bg-th-accent-soft text-th-accent font-mono font-bold flex items-center justify-center shrink-0">
                  2
                </span>
                <p>
                  Buscá y seleccioná <strong className="text-th-text">«Agregar a pantalla de inicio»</strong>.
                </p>
              </div>

              <div className="flex items-start gap-2.5 bg-th-recessed p-3 rounded-xl border border-th-border">
                <span className="size-5 rounded-full bg-th-accent-soft text-th-accent font-mono font-bold flex items-center justify-center shrink-0">
                  3
                </span>
                <p>
                  Tocá <strong className="text-th-text">«Agregar»</strong> en la esquina superior derecha.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowIosModal(false)}
              className="w-full h-10 rounded-xl bg-th-accent hover:bg-th-accent-hover text-white font-semibold text-xs transition-colors cursor-pointer"
            >
              ¡Entendido!
            </button>
          </div>
        </div>
      )}
    </PwaContext.Provider>
  );
}

