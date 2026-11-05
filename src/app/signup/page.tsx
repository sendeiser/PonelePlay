"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signUpOwner } from "@/lib/api/auth";
import { DEFAULT_PARTY_CONFIG, DEFAULT_BAR_PARTY_CONFIG, type VenueType } from "@/lib/domain/party";
import { saveStoredPartyConfig } from "@/lib/api/party-control";

export default function SignupPage() {
  const router = useRouter();

  const [venueType, setVenueType] = useState<VenueType>("bar");
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

  const isParty = venueType === "party";

  // Compute automatic slug from venueName
  const autoSlug = venueName
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const activeSlug =
    isEditingSlug && customSlug
      ? customSlug
      : autoSlug || (isParty ? "mi-fiesta" : "mi-bar");

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
      setError("El enlace debe tener al menos 3 caracteres.");
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
        venueType,
      });

      if (res.error) {
        setError(res.error);
        setLoading(false);
        return;
      }

      const targetSlug = res.slug || finalSlug;
      saveStoredPartyConfig(
        targetSlug,
        isParty ? DEFAULT_PARTY_CONFIG : DEFAULT_BAR_PARTY_CONFIG,
      );

      router.push(`/panel/${targetSlug}`);
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
        <div
          className={`absolute -top-16 -right-16 size-48 rounded-full blur-3xl pointer-events-none ${
            isParty ? "bg-pink-500/15" : "bg-indigo-500/10"
          }`}
        />

        {/* Header */}
        <div className="mb-5 relative z-10">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-mono tracking-wider text-slate-400 hover:text-white uppercase mb-4 py-2 px-1 transition-colors min-h-[44px]"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            <span>Volver a PonelePlay</span>
          </Link>
          <div
            className={`flex items-center gap-2 font-mono text-xs font-semibold mb-1 ${
              isParty ? "text-pink-400" : "text-indigo-400"
            }`}
          >
            <span className="material-symbols-outlined text-base">
              {isParty ? "celebration" : "storefront"}
            </span>
            <span>
              {isParty
                ? "MODO FIESTA · CUMPLEAÑOS · JODAS · REUNIONES"
                : "REGISTRO DE NUEVO LOCAL COMERCIAL"}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            {isParty ? "Creá tu Fiesta o Cumpleaños" : "Registrá tu Bar"}
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {isParty
              ? "Todo desbloqueado para tus invitados: votaciones libres, duelos 1v1, ruleta en TV, karaoke y dedicatorias."
              : "Creá tu local y habilitá la rockola colaborativa con pantalla de TV y códigos QR."}
          </p>
        </div>

        {/* Selector de Tipo: Bar vs Fiesta */}
        <div className="mb-5 relative z-10">
          <span className="block text-[11px] font-mono text-slate-300 mb-2 uppercase font-semibold">
            ¿Para qué vas a usar PonelePlay?
          </span>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setVenueType("bar")}
              className={`p-3 rounded-xl border text-left transition-all ${
                !isParty
                  ? "bg-indigo-600/20 border-indigo-500 text-white shadow-md shadow-indigo-500/10"
                  : "bg-[#0a0e17] border-[#232b42] text-slate-400 hover:text-white"
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-xs">
                <span className="text-base">🍻</span>
                <span>Bar / Billar</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1 leading-snug">
                Con tickets QR de consumición, mozos y moderación comercial.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setVenueType("party")}
              className={`p-3 rounded-xl border text-left transition-all ${
                isParty
                  ? "bg-gradient-to-br from-pink-600/25 to-purple-600/25 border-pink-500 text-white shadow-md shadow-pink-500/15"
                  : "bg-[#0a0e17] border-[#232b42] text-slate-400 hover:text-white"
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-xs">
                <span className="text-base">🎉</span>
                <span>Fiesta / Cumple</span>
              </div>
              <p className="text-[10px] text-slate-300 mt-1 leading-snug">
                ¡Todo desbloqueado! Votos libres, duelos 1v1, ruleta y dedicatorias.
              </p>
            </button>
          </div>
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
              {isParty ? "Tu Email (Anfitrión / Organizador)" : "Email del Administrador"}
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              className="w-full rounded-xl bg-[#0a0e17] border border-[#232b42] px-4 py-3 text-white placeholder:text-slate-600 font-mono text-xs focus:outline-none focus:border-indigo-400 transition-colors"
              placeholder={isParty ? "tuemail@ejemplo.com" : "dueño@tubar.com"}
              autoComplete="email"
              required
            />
          </div>

          {/* Venue Name */}
          <div>
            <label htmlFor="venue" className="block text-xs font-mono text-slate-300 mb-1.5 uppercase font-semibold">
              {isParty
                ? "Nombre de la Fiesta, Joda o Cumpleaños"
                : "Nombre del Bar o Salón"}
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
              placeholder={isParty ? "Ej: Cumple de Tincho 🎉" : "Ej: Billar Aurora"}
              required
            />
          </div>

          {/* Live Slug Preview & Customizer */}
          <div className="p-3 rounded-xl bg-[#0a0e17] border border-[#1E2333] space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-slate-400">
                {isParty ? "Enlace QR para tus invitados:" : "Enlace web de tu bar:"}
              </span>
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
                  placeholder={isParty ? "cumple-tincho" : "mi-bar-favorito"}
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
              className={`w-full text-white font-mono font-bold text-xs rounded-xl py-3.5 shadow-lg active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2 ${
                isParty
                  ? "bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 shadow-pink-600/30"
                  : "bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 shadow-indigo-600/30"
              }`}
            >
              {loading ? (
                <>
                  <span className="inline-block size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>{isParty ? "Creando tu Fiesta..." : "Creando tu Bar..."}</span>
                </>
              ) : (
                <span>
                  {isParty ? "🎉 Crear Fiesta & Abrir Cabina" : "Crear Cuenta & Comenzar"}
                </span>
              )}
            </button>
          </div>
        </form>

        {/* Footer Link to Login */}
        <p className="mt-6 text-center text-xs text-slate-400 font-mono">
          ¿Ya tenés una cuenta registrada?{" "}
          <Link href="/login" className="text-indigo-400 hover:text-indigo-300 font-semibold underline ml-1">
            Iniciar sesión
          </Link>
        </p>
      </div>
    </main>
  );
}
