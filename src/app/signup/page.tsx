"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signUpOwner } from "@/lib/api/auth";

export default function SignupPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [venueName, setVenueName] = useState("");
  const [customSlug, setCustomSlug] = useState("");
  const [isEditingSlug, setIsEditingSlug] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Compute automatic slug from venueName
  const autoSlug = venueName
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const activeSlug = isEditingSlug && customSlug ? customSlug : autoSlug || "mi-bar";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !venueName || !password || !confirmPassword) {
      setError("Por favor completá todos los campos requeridos.");
      return;
    }

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden. Verificalas nuevamente.");
      return;
    }

    const finalSlug = activeSlug.trim().toLowerCase();
    if (!finalSlug || finalSlug.length < 3) {
      setError("El enlace del bar debe tener al menos 3 caracteres.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await signUpOwner({
        email: email.trim(),
        password,
        venueName: venueName.trim(),
        slug: finalSlug,
      });

      if (res.error) {
        setError(res.error);
        setLoading(false);
        return;
      }

      // Successfully signed up! Push to newly registered venue panel
      router.push(`/panel/${res.slug || finalSlug}`);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error inesperado al crear la cuenta.");
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#090D16] p-4 sm:p-8">
      <div className="bg-[#121622] border border-[#232b42] rounded-2xl p-6 sm:p-8 max-w-lg w-full shadow-2xl relative overflow-hidden text-white">
        {/* Subtle Ambient Glow */}
        <div className="absolute -top-16 -right-16 size-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="mb-6 relative z-10">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-mono tracking-wider text-slate-400 hover:text-white uppercase mb-4 py-2 px-1 transition-colors min-h-[44px]"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            <span>Volver a PonelePlay</span>
          </Link>
          <div className="flex items-center gap-2 font-mono text-xs text-indigo-400 font-semibold mb-1">
            <span className="material-symbols-outlined text-base">storefront</span>
            <span>REGISTRO DE NUEVO LOCAL</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Registrá tu Bar</h1>
          <p className="text-xs text-slate-400 mt-1">
            Creá tu local y habilitá la rockola colaborativa con pantalla de TV y códigos QR.
          </p>
        </div>

        {error && (
          <div className="mb-5 rounded-xl bg-red-950/60 border border-red-500/40 p-3 text-xs text-red-200 flex items-center gap-2 font-mono">
            <span className="material-symbols-outlined text-base text-red-400 shrink-0">error</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-xs font-mono text-slate-300 mb-1.5 uppercase font-semibold">
              Email del Administrador
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              className="w-full rounded-xl bg-[#0a0e17] border border-[#232b42] px-4 py-3 text-white placeholder:text-slate-600 font-mono text-xs focus:outline-none focus:border-indigo-400 transition-colors"
              placeholder="dueño@tubar.com"
              autoComplete="email"
              required
            />
          </div>

          {/* Venue Name */}
          <div>
            <label htmlFor="venue" className="block text-xs font-mono text-slate-300 mb-1.5 uppercase font-semibold">
              Nombre del Bar o Salón
            </label>
            <input
              id="venue"
              type="text"
              value={venueName}
              onChange={(e) => {
                setVenueName(e.target.value);
                if (!isEditingSlug) {
                  setCustomSlug("");
                }
              }}
              disabled={loading}
              className="w-full rounded-xl bg-[#0a0e17] border border-[#232b42] px-4 py-3 text-white placeholder:text-slate-600 font-mono text-xs focus:outline-none focus:border-indigo-400 transition-colors"
              placeholder="Ej: Billar Aurora"
              required
            />
          </div>

          {/* Live Slug Preview & Customizer */}
          <div className="p-3 rounded-xl bg-[#0a0e17] border border-[#1E2333] space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-slate-400">Enlace web de tu bar:</span>
              <button
                type="button"
                onClick={() => setIsEditingSlug(!isEditingSlug)}
                className="text-indigo-400 hover:text-indigo-300 underline text-[10px]"
              >
                {isEditingSlug ? "Usar automático" : "Personalizar URL"}
              </button>
            </div>

            {isEditingSlug ? (
              <div className="flex items-center gap-1 font-mono text-xs">
                <span className="text-slate-500">/p/</span>
                <input
                  type="text"
                  value={customSlug}
                  onChange={(e) =>
                    setCustomSlug(
                      e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9-]+/g, "")
                        .replace(/^-+|-+$/g, ""),
                    )
                  }
                  placeholder="mi-bar-favorito"
                  className="flex-1 bg-[#141824] border border-[#232b42] rounded-lg px-2.5 py-1 text-cyan-300 font-mono text-xs focus:outline-none focus:border-indigo-400"
                />
              </div>
            ) : (
              <div className="font-mono text-xs text-cyan-300 break-all select-all flex items-center gap-1">
                <span className="text-slate-500">poneleplay.app/p/</span>
                <span className="font-bold">{activeSlug}</span>
              </div>
            )}
          </div>

          {/* Password with Eye Toggle */}
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
                className="w-full rounded-xl bg-[#0a0e17] border border-[#232b42] px-4 py-3 pr-11 text-white placeholder:text-slate-600 font-mono text-xs focus:outline-none focus:border-indigo-400 transition-colors"
                placeholder="Mínimo 6 caracteres"
                autoComplete="new-password"
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

          {/* Confirm Password with Eye Toggle */}
          <div>
            <label htmlFor="confirmPassword" className="block text-xs font-mono text-slate-300 mb-1.5 uppercase font-semibold">
              Confirmar Contraseña
            </label>
            <div className="relative">
              <input
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                className="w-full rounded-xl bg-[#0a0e17] border border-[#232b42] px-4 py-3 pr-11 text-white placeholder:text-slate-600 font-mono text-xs focus:outline-none focus:border-indigo-400 transition-colors"
                placeholder="Repetí tu contraseña"
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                tabIndex={-1}
                aria-label={showConfirmPassword ? "Ocultar confirmación" : "Ver confirmación"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 transition-colors"
              >
                <span className="material-symbols-outlined text-lg">
                  {showConfirmPassword ? "visibility_off" : "visibility"}
                </span>
              </button>
            </div>
            {password && confirmPassword && password !== confirmPassword && (
              <span className="text-[11px] font-mono text-red-400 mt-1 block">
                Las contraseñas no coinciden
              </span>
            )}
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-mono font-bold text-xs rounded-xl py-3.5 shadow-lg shadow-indigo-600/30 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="inline-block size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Creando tu Bar...</span>
                </>
              ) : (
                <span>Crear Cuenta & Comenzar</span>
              )}
            </button>
          </div>
        </form>

        {/* Footer Link to Login */}
        <p className="mt-6 text-center text-xs text-slate-400 font-mono">
          ¿Ya tenés un bar registrado?{" "}
          <Link href="/login" className="text-indigo-400 hover:text-indigo-300 font-semibold underline ml-1">
            Iniciar sesión
          </Link>
        </p>
      </div>
    </main>
  );
}
