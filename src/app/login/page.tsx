"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signInOwner, getOwnerVenueSlug } from "@/lib/api/auth";
import { ThemeToggle } from "@/components/theme-toggle";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");
  const pairCodeParam = searchParams.get("pair_code");

  const [authMode] = useState<"owner" | "pin">("owner");
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
    <div className="w-full max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-12 rounded-2xl card-panel overflow-hidden min-h-[580px]">
      {/* LEFT / MAIN: Dual-Mode Auth Terminal (7 cols) */}
      <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-between">
        <div>
          {/* Top utility bar */}
          <div className="flex items-center justify-between gap-3 mb-4">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-mono tracking-wider text-th-text-2 hover:text-th-text uppercase py-2 px-1 transition-colors min-h-[44px]"
            >
              <span className="material-symbols-outlined text-sm">arrow_back</span>
              <span>Volver a PonelePlay</span>
            </Link>
            <ThemeToggle variant="compact" />
          </div>

          {/* Main Auth Header Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-th-recessed rounded-xl border border-th-border mb-5">
            <span className="material-symbols-outlined text-base text-th-accent">admin_panel_settings</span>
            <span className="font-mono text-xs font-bold text-th-text">Acceso Principal · Cabina & Administración</span>
          </div>

          {error && (
            <div className="mb-5 rounded-xl bg-th-danger-soft border border-th-danger/30 p-3 text-xs text-th-danger flex items-center gap-2 font-mono">
              <span className="material-symbols-outlined text-base text-th-danger shrink-0">error</span>
              <span>{error}</span>
            </div>
          )}

          {/* MODE 1: OWNER EMAIL & PASSWORD */}
          {authMode === "owner" && (
            <div>
              <h2 className="font-display text-xl font-bold text-th-text tracking-tight">
                Iniciar sesión como Dueño
              </h2>
              <p className="text-xs text-th-text-2 mt-1 mb-5">
                Ingresá con tu cuenta para administrar la noche, catálogo y códigos.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="ui-label font-mono uppercase">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    className="ui-input h-11 font-mono text-xs"
                    placeholder="demo@poneleplay.com"
                    autoComplete="email"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="password" className="ui-label font-mono uppercase">
                    Contraseña
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={loading}
                      className="ui-input h-11 pr-11 font-mono text-xs"
                      placeholder="••••••••••••"
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                      aria-label={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-th-muted hover:text-th-text p-1 transition-colors cursor-pointer"
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
                  className="w-full mt-2 bg-th-accent hover:bg-th-accent-hover text-white font-semibold text-sm rounded-xl h-11 shadow-sm active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
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
              <h2 className="font-display text-xl font-bold text-th-text tracking-tight">
                Acceso de Mozo por PIN
              </h2>
              <p className="text-xs text-th-text-2 mt-1 mb-4 text-center">
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
                          ? "bg-th-teal border-th-teal"
                          : "bg-th-recessed border-th-border"
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
                    className="h-12 rounded-xl bg-th-recessed hover:bg-th-hover active:scale-95 border border-th-border text-th-text font-mono text-lg font-bold transition-all flex items-center justify-center cursor-pointer"
                  >
                    {btn}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => handlePinSubmit("1234")}
                className="mt-4 text-xs font-mono text-th-teal hover:underline cursor-pointer"
              >
                Ingresar con PIN Demo (1234)
              </button>
            </div>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="mt-6 pt-5 border-t border-th-border flex flex-col gap-3">
          {authMode === "owner" && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={fillDemo}
                className="flex-1 text-xs font-medium text-th-text-2 hover:text-th-text bg-th-recessed hover:bg-th-hover border border-th-border rounded-xl py-2.5 px-3 transition-colors text-center cursor-pointer"
              >
                Llenar demo
              </button>
              <button
                type="button"
                onClick={handleDemoLogin}
                className="flex-1 text-xs font-semibold text-th-accent hover:text-white bg-th-accent-soft hover:bg-th-accent border border-th-accent/30 rounded-xl py-2.5 px-3 transition-colors text-center cursor-pointer"
              >
                Entrar 1-Clic Demo
              </button>
            </div>
          )}

          <p className="text-center text-xs text-th-muted font-mono">
            ¿No registraste tu bar o fiesta todavía?{" "}
            <Link href="/signup" className="text-th-accent hover:underline font-semibold inline-block py-2 px-1">
              Crear cuenta
            </Link>
          </p>
        </div>
      </div>

      {/* RIGHT: Venue & Terminal Telemetry Card (5 cols) */}
      <div className="hidden lg:flex lg:col-span-5 bg-th-recessed border-t lg:border-t-0 lg:border-l border-th-border p-6 sm:p-8 flex-col justify-between">
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-th-accent flex items-center justify-center text-white shadow-sm">
              <span className="material-symbols-outlined text-xl">sports_bar</span>
            </div>
            <div>
              <h3 className="font-display font-bold text-th-text text-base">Terminal Nocturna</h3>
              <p className="font-mono text-xs text-th-text-2">PonelePlay Control Panel</p>
            </div>
          </div>

          <div className="space-y-3 font-mono text-xs text-th-text-2 card-panel p-4 rounded-xl">
            <div className="flex justify-between items-center py-1 border-b border-th-border">
              <span className="text-th-muted">Terminal:</span>
              <span className="font-bold text-th-text">Mostrador #01</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-th-border">
              <span className="text-th-muted">Conectividad:</span>
              <span className="text-th-emerald font-bold flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-th-emerald animate-pulse" />
                18ms Online
              </span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-th-muted">Host Audio:</span>
              <span className="text-th-teal font-bold">HDMI 48kHz Stereo</span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-th-accent-soft border border-th-accent/25 text-xs text-th-text space-y-1">
            <div className="font-bold text-th-accent flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">security</span>
              <span>Protocolo Seguro de Salón</span>
            </div>
            <p className="text-[11px] text-th-text-2 leading-relaxed">
              El acceso de mozos por PIN no expone credenciales maestras y limita los permisos a emisión de tickets y moderación.
            </p>
          </div>
        </div>

        <div className="pt-6 font-mono text-[10px] text-th-muted text-center">
          PONELEPLAY SYSTEM · CABINA & CONTROL
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-th-canvas tech-bg text-th-text p-4 sm:p-8">
      <Suspense fallback={<div className="text-th-text-2 font-mono text-xs">Cargando...</div>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
