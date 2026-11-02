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
          <div className="rounded-2xl bg-gradient-to-r from-[#141A2E]/95 to-[#1C2038]/95 backdrop-blur-xl border border-indigo-500/30 p-3.5 shadow-2xl shadow-black/80 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="size-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white shrink-0 shadow-md shadow-indigo-600/40">
                <Sparkles className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-white tracking-tight leading-tight">
                  Instalá PonelePlay
                </p>
                <p className="text-[11px] text-slate-300 truncate mt-0.5 font-medium">
                  Pantalla completa y acceso rápido desde tu celu
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void promptInstall()}
                className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 active:scale-95 text-white text-xs font-bold font-mono transition-all flex items-center gap-1.5 shadow-md shadow-indigo-600/30"
              >
                <Download className="size-3.5" />
                <span>Instalar</span>
              </button>
              <button
                type="button"
                onClick={handleDismiss}
                aria-label="Cerrar aviso de instalación"
                className="size-7 rounded-lg text-slate-400 hover:text-white flex items-center justify-center hover:bg-white/10 transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* iOS INSTALL INSTRUCTIONS MODAL */}
      {showIosModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-2xl bg-[#121626] border border-[#232B42] p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="size-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold">
                  <Share2 className="size-4" />
                </div>
                <h3 className="text-sm font-bold text-white">Instalar en iPhone / iPad</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowIosModal(false)}
                className="size-7 rounded-lg text-slate-400 hover:text-white flex items-center justify-center"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-3 font-mono text-xs text-slate-300">
              <div className="flex items-start gap-2.5 bg-[#181F33] p-2.5 rounded-xl border border-[#232B42]">
                <span className="size-5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold flex items-center justify-center shrink-0">
                  1
                </span>
                <p>
                  Tocá el botón <strong>Compartir</strong> <Share2 className="inline size-3.5 mx-0.5 text-indigo-400" /> en la barra inferior de Safari.
                </p>
              </div>

              <div className="flex items-start gap-2.5 bg-[#181F33] p-2.5 rounded-xl border border-[#232B42]">
                <span className="size-5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold flex items-center justify-center shrink-0">
                  2
                </span>
                <p>
                  Buscá y seleccioná <strong>«Agregar a pantalla de inicio»</strong>.
                </p>
              </div>

              <div className="flex items-start gap-2.5 bg-[#181F33] p-2.5 rounded-xl border border-[#232B42]">
                <span className="size-5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold flex items-center justify-center shrink-0">
                  3
                </span>
                <p>
                  Tocá <strong>«Agregar»</strong> en la esquina superior derecha.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowIosModal(false)}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs font-mono transition-colors"
            >
              ¡Entendido!
            </button>
          </div>
        </div>
      )}
    </PwaContext.Provider>
  );
}

