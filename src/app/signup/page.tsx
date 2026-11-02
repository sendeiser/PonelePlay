"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signUpOwner } from "@/lib/api/auth";

export default function SignupPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [venueName, setVenueName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !venueName || !password) {
      setError("Por favor completá todos los campos.");
      return;
    }

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    setLoading(true);
    setError(null);

    const generatedSlug = venueName
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    try {
      const res = await signUpOwner({
        email: email.trim(),
        password,
        venueName: venueName.trim(),
        slug: generatedSlug,
      });

      if (res.error) {
        setError(res.error);
        setLoading(false);
        return;
      }

      router.push(`/panel/${res.slug || generatedSlug}`);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error inesperado al crear la cuenta.");
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#090D16] p-4 sm:p-8">
      <div className="bg-[#181b25] border border-[#232b42] rounded-2xl p-8 max-w-md w-full shadow-2xl relative overflow-hidden">
        <div className="absolute -top-16 -right-16 size-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="mb-6 relative z-10">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-mono tracking-wider text-slate-400 hover:text-white uppercase mb-4 py-2 px-1 transition-colors min-h-[44px]"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            <span>Volver a PonelePlay</span>
          </Link>
          <h1 className="text-2xl font-bold text-white tracking-tight">Registrá tu Bar</h1>
          <p className="text-xs text-slate-400 mt-1">
            Creá tu local y habilitá la rockola colaborativa con pantalla y QR.
          </p>
        </div>

        {error && (
          <div className="mb-5 rounded-xl bg-red-950/60 border border-red-500/40 p-3 text-xs text-red-200 flex items-center gap-2 font-mono">
            <span className="material-symbols-outlined text-base text-red-400">error</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
          <div>
            <label htmlFor="email" className="block text-xs font-mono text-slate-300 mb-1.5 uppercase">
              Email
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

          <div>
            <label htmlFor="venue" className="block text-xs font-mono text-slate-300 mb-1.5 uppercase">
              Nombre del Bar o Local
            </label>
            <input
              id="venue"
              type="text"
              value={venueName}
              onChange={(e) => setVenueName(e.target.value)}
              disabled={loading}
              className="w-full rounded-xl bg-[#0a0e17] border border-[#232b42] px-4 py-3 text-white placeholder:text-slate-600 font-mono text-xs focus:outline-none focus:border-indigo-400 transition-colors"
              placeholder="Ej: El Taco Dorado"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-xs font-mono text-slate-300 mb-1.5 uppercase">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              className="w-full rounded-xl bg-[#0a0e17] border border-[#232b42] px-4 py-3 text-white placeholder:text-slate-600 font-mono text-xs focus:outline-none focus:border-indigo-400 transition-colors"
              placeholder="••••••••••••"
              autoComplete="new-password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-mono font-bold text-xs rounded-xl py-3.5 shadow-lg shadow-indigo-600/30 active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="inline-block size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Registrando bar...</span>
              </>
            ) : (
              <span>Crear Bar y Abrir Panel</span>
            )}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-[#232b42] text-center text-xs text-slate-500 font-mono relative z-10">
          ¿Ya tenés cuenta?{" "}
          <Link href="/login" className="text-indigo-400 hover:underline font-semibold inline-block py-2 px-1">
            Iniciar sesión
          </Link>
        </div>
      </div>
    </main>
  );
}
