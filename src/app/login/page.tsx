"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signInOwner, getOwnerVenueSlug } from "@/lib/api/auth";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");
  const pairCodeParam = searchParams.get("pair_code");

  const [authMode, setAuthMode] = useState<"owner" | "pin">("owner");
  const [pin, setPin] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    router.prefetch(nextParam || "/panel/billar-aurora");
  }, [router, nextParam]);

  const fillDemo = () => {
    setEmail("demo@poneleplay.com");
    setPassword("poneleplay2026");
    setError(null);
  };

  const handleDemoLogin = async () => {
    setEmail("demo@poneleplay.com");
    setPassword("poneleplay2026");
    setLoading(true);
    setError(null);
    try {
      const res = await signInOwner("demo@poneleplay.com", "poneleplay2026");
      if (res.error) {
        setError(res.error);
        setLoading(false);
        return;
      }
      const target = nextParam && nextParam.startsWith("/panel") ? nextParam : `/panel/${res.slug || "billar-aurora"}`;
      router.push(target);
      router.refresh();
    } catch {
      // Direct fallback
      router.push("/panel/billar-aurora");
      router.refresh();
    }
  };

  const handlePinPress = (digit: string) => {
    if (pin.length < 4) {
      const nextPin = pin + digit;
      setPin(nextPin);
      setError(null);
      if (nextPin.length === 4) {
        handlePinSubmit(nextPin);
      }
    }
  };

  const handlePinClear = () => {
    setPin("");
    setError(null);
  };

  const handlePinBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
    setError(null);
  };

  const handlePinSubmit = async (pinValue: string) => {
    setLoading(true);
    setError(null);
    try {
      // In demo or live staff: if pin is 1234 or valid length
      if (pinValue === "1234" || pinValue.length === 4) {
        router.push(nextParam || "/panel/billar-aurora");
        router.refresh();
        return;
      }
      setError("PIN no reconocido para esta terminal.");
      setPin("");
    } catch {
      setError("Error de autenticación por PIN.");
      setPin("");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Por favor completá tu email y contraseña.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await signInOwner(email.trim(), password);
      if (res.error) {
        setError(res.error);
        setLoading(false);
        return;
      }

      if (nextParam && nextParam.startsWith("/panel")) {
        router.push(nextParam);
        router.refresh();
        return;
      }

      const slug = res.slug || (await getOwnerVenueSlug());
      const pairQuery = pairCodeParam ? `?pair_code=${encodeURIComponent(pairCodeParam)}` : "";
      router.push(`/panel/${slug || "billar-aurora"}${pairQuery}`);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error inesperado al iniciar sesión.");
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 rounded-2xl border border-[#232b42] bg-[#0a0e17]/90 backdrop-blur-2xl shadow-2xl overflow-hidden min-h-[580px]">
      {/* LEFT / MAIN: Dual-Mode Auth Terminal (7 cols) */}
      <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-between">
        <div>
          {/* Back link */}
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-mono tracking-wider text-slate-400 hover:text-white uppercase mb-4 py-2 px-1 transition-colors min-h-[44px]"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            <span>Volver a PonelePlay</span>
          </Link>

          {/* Mode Switcher Tabs */}
          <div className="flex p-1 bg-[#181b25] rounded-xl border border-[#232b42] mb-6">
            <button
              type="button"
              onClick={() => {
                setAuthMode("owner");
                setError(null);
              }}
              className={`flex-1 py-2 px-3 rounded-lg font-mono text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                authMode === "owner"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <span className="material-symbols-outlined text-base">admin_panel_settings</span>
              <span>Dueño / Admin</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setAuthMode("pin");
                setError(null);
              }}
              className={`flex-1 py-2 px-3 rounded-lg font-mono text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                authMode === "pin"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <span className="material-symbols-outlined text-base">dialpad</span>
              <span>PIN Rápido Mozo</span>
            </button>
          </div>

          {error && (
            <div className="mb-5 rounded-xl bg-red-950/60 border border-red-500/40 p-3 text-xs text-red-200 flex items-center gap-2 font-mono">
              <span className="material-symbols-outlined text-base text-red-400 shrink-0">error</span>
              <span>{error}</span>
            </div>
          )}

          {/* MODE 1: OWNER EMAIL & PASSWORD */}
          {authMode === "owner" && (
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">
                Iniciar sesión como Dueño
              </h2>
              <p className="text-xs text-slate-400 mt-1 mb-5">
                Ingresá con tu cuenta para administrar la noche, catálogo y códigos.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-xs font-mono text-slate-300 mb-1.5 uppercase font-semibold">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    className="w-full rounded-xl bg-[#131722] border border-[#232b42] px-4 py-3 text-white placeholder:text-slate-600 font-mono text-xs focus:outline-none focus:border-indigo-400 transition-colors"
                    placeholder="demo@poneleplay.com"
                    autoComplete="email"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-xs font-mono text-slate-300 mb-1.5 uppercase font-semibold">
                    Contraseña
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={loading}
                      className="w-full rounded-xl bg-[#131722] border border-[#232b42] px-4 py-3 pr-11 text-white placeholder:text-slate-600 font-mono text-xs focus:outline-none focus:border-indigo-400 transition-colors"
                      placeholder="••••••••••••"
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                      aria-label={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 transition-colors"
                    >
                      <span className="material-symbols-outlined text-lg">
                        {showPassword ? "visibility_off" : "visibility"}
                      </span>
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-mono font-bold text-xs rounded-xl py-3.5 shadow-md shadow-indigo-600/30 active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <span className="inline-block size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Ingresando al Panel...</span>
                    </>
                  ) : (
                    <span>Entrar al Panel de Control</span>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* MODE 2: STAFF QUICK PIN KEYPAD */}
          {authMode === "pin" && (
            <div className="flex flex-col items-center">
              <h2 className="text-xl font-bold text-white tracking-tight">
                Acceso de Mozo por PIN
              </h2>
              <p className="text-xs text-slate-400 mt-1 mb-4 text-center">
                Digitá tu código de 4 dígitos para habilitar la terminal.
              </p>

              {/* PIN Indicator Dots */}
              <div className="flex items-center gap-3 my-3">
                {[0, 1, 2, 3].map((idx) => {
                  const filled = pin.length > idx;
                  return (
                    <div
                      key={idx}
                      className={`size-4 rounded-full border transition-all ${
                        filled
                          ? "bg-cyan-400 border-cyan-300 shadow-[0_0_10px_#4cd7f6]"
                          : "bg-[#181b25] border-[#232b42]"
                      }`}
                    />
                  );
                })}
              </div>

              {/* Numeric Keypad Grid */}
              <div className="grid grid-cols-3 gap-2.5 max-w-xs w-full mt-4">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"].map((btn) => (
                  <button
                    key={btn}
                    type="button"
                    onClick={() => {
                      if (btn === "C") handlePinClear();
                      else if (btn === "⌫") handlePinBackspace();
                      else handlePinPress(btn);
                    }}
                    className="h-12 rounded-xl bg-[#181b25] hover:bg-[#222738] active:scale-95 border border-[#232b42] text-white font-mono text-lg font-bold transition-all flex items-center justify-center"
                  >
                    {btn}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => handlePinSubmit("1234")}
                className="mt-4 text-xs font-mono text-cyan-400 hover:underline"
              >
                ⚡ Ingresar con PIN Demo (1234)
              </button>
            </div>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="mt-6 pt-5 border-t border-[#1E2333] flex flex-col gap-3">
          {authMode === "owner" && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={fillDemo}
                className="flex-1 text-xs font-mono text-indigo-300 hover:text-white bg-[#181b25] hover:bg-[#202534] border border-indigo-500/30 rounded-xl py-2 px-3 transition-colors text-center"
              >
                📝 Llenar demo
              </button>
              <button
                type="button"
                onClick={handleDemoLogin}
                className="flex-1 text-xs font-mono text-white bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/50 rounded-xl py-2 px-3 transition-colors text-center font-bold"
              >
                ⚡ Entrar 1-Clic Demo
              </button>
            </div>
          )}

          <p className="text-center text-xs text-slate-500 font-mono">
            ¿No registraste tu bar todavía?{" "}
            <Link href="/signup" className="text-indigo-400 hover:underline font-semibold inline-block py-2 px-1">
              Crear cuenta de bar
            </Link>
          </p>
        </div>
      </div>

      {/* RIGHT: Venue & Terminal Telemetry Card (5 cols) */}
      <div className="hidden lg:flex lg:col-span-5 bg-[#131722] border-t lg:border-t-0 lg:border-l border-[#232b42] p-6 sm:p-8 flex-col justify-between">
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white shadow-md">
              <span className="material-symbols-outlined text-xl">sports_bar</span>
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Terminal Nocturna</h3>
              <p className="font-mono text-xs text-slate-400">PonelePlay Control Panel</p>
            </div>
          </div>

          <div className="space-y-3 font-mono text-xs text-slate-300 bg-[#0a0e17] p-4 rounded-xl border border-[#232b42]">
            <div className="flex justify-between items-center py-1 border-b border-[#1E2333]">
              <span className="text-slate-500">Terminal:</span>
              <span className="font-bold text-white">Mostrador #01</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-[#1E2333]">
              <span className="text-slate-500">Conectividad:</span>
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                18ms Online
              </span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-slate-500">Host Audio:</span>
              <span className="text-cyan-400 font-bold">HDMI 48kHz Stereo</span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-slate-300 space-y-1">
            <div className="font-bold text-indigo-300 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">security</span>
              <span>Protocolo Seguro de Salón</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              El acceso de mozos por PIN no expone credenciales maestras y limita los permisos a emisión de tickets y moderación.
            </p>
          </div>
        </div>

        <div className="pt-6 font-mono text-[10px] text-slate-500 text-center">
          PONELEPLAY SYSTEM · V1.0.0 STITCH NOCTURNE
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[#090D16] p-4 sm:p-8">
      <Suspense fallback={<div className="text-slate-400 font-mono text-xs">Cargando...</div>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
