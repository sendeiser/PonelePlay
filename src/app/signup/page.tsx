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
    <main className="min-h-screen flex items-center justify-center bg-[#041611] px-4 py-12">
      <div className="bg-[#07211b] border border-amber/20 rounded-2xl p-8 max-w-md w-full shadow-2xl">
        <div className="mb-6">
          <Link href="/" className="inline-block text-xs font-mono tracking-widest text-amber/80 hover:text-amber mb-2 uppercase">
            ← Volver a PonelePlay
          </Link>
          <h1 className="text-3xl font-display text-cream">Crear cuenta</h1>
          <p className="text-sm text-cream/60 mt-1">
            Registrá tu bar o local y empezá la rockola colaborativa.
          </p>
        </div>

        {error && (
          <div className="mb-5 rounded-lg bg-red-950/50 border border-red-500/40 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-cream/80 mb-1.5">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              className="w-full rounded-lg bg-[#041611] border border-amber/20 px-4 py-3 text-cream placeholder-cream/30 focus:outline-none focus:border-amber transition-colors disabled:opacity-50"
              placeholder="dueño@tubar.com"
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label htmlFor="venue" className="block text-sm font-medium text-cream/80 mb-1.5">
              Nombre del bar / local
            </label>
            <input
              id="venue"
              type="text"
              value={venueName}
              onChange={(e) => setVenueName(e.target.value)}
              disabled={loading}
              className="w-full rounded-lg bg-[#041611] border border-amber/20 px-4 py-3 text-cream placeholder-cream/30 focus:outline-none focus:border-amber transition-colors disabled:opacity-50"
              placeholder="Ej: Cervecería Palermo"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-cream/80 mb-1.5">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              className="w-full rounded-lg bg-[#041611] border border-amber/20 px-4 py-3 text-cream placeholder-cream/30 focus:outline-none focus:border-amber transition-colors disabled:opacity-50"
              placeholder="Al menos 6 caracteres"
              autoComplete="new-password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 bg-amber text-[#041611] font-semibold rounded-lg py-3 hover:bg-amber/90 active:scale-[0.99] transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="inline-block h-4 w-4 border-2 border-[#041611] border-t-transparent rounded-full animate-spin" />
                Registrando...
              </>
            ) : (
              "Crear cuenta y empezar"
            )}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-amber/10 text-center">
          <p className="text-xs text-cream/50">
            ¿Ya tenés cuenta?{" "}
            <Link href="/login" className="text-amber hover:underline font-medium">
              Iniciá sesión acá
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
