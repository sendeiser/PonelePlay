"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signInOwner, getOwnerVenueSlug } from "@/lib/api/auth";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fillDemo = () => {
    setEmail("demo@poneleplay.com");
    setPassword("poneleplay2026");
    setError(null);
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
        if (res.error.toLowerCase().includes("invalid login credentials")) {
          setError("Email o contraseña incorrectos.");
        } else {
          setError(res.error);
        }
        setLoading(false);
        return;
      }

      // Login successful: check next or fetch venue slug
      if (nextParam && nextParam.startsWith("/panel")) {
        router.push(nextParam);
        router.refresh();
        return;
      }

      const slug = await getOwnerVenueSlug();
      router.push(`/panel/${slug || "billar-aurora"}`);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error inesperado al iniciar sesión.");
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#07211b] border border-amber/20 rounded-2xl p-8 max-w-md w-full shadow-2xl">
      <div className="mb-6">
        <Link href="/" className="inline-block text-xs font-mono tracking-widest text-amber/80 hover:text-amber mb-2 uppercase">
          ← Volver a PonelePlay
        </Link>
        <h1 className="text-3xl font-display text-cream">Iniciar sesión</h1>
        <p className="text-sm text-cream/60 mt-1">
          Ingresá a tu panel para administrar la noche, catálogo y códigos.
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
            placeholder="demo@poneleplay.com"
            autoComplete="email"
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
            placeholder="••••••••••••"
            autoComplete="current-password"
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
              Ingresando...
            </>
          ) : (
            "Entrar al Panel"
          )}
        </button>
      </form>

      <div className="mt-6 pt-5 border-t border-amber/10 flex flex-col gap-3">
        <button
          type="button"
          onClick={fillDemo}
          className="text-xs text-amber/90 hover:text-amber bg-amber/10 hover:bg-amber/15 border border-amber/30 rounded-lg py-2 px-3 transition-colors text-center"
        >
          ⚡ Cargar credenciales demo (Billar Aurora)
        </button>

        <p className="text-center text-xs text-cream/50">
          ¿No tenés cuenta todavía?{" "}
          <Link href="/signup" className="text-amber hover:underline font-medium">
            Registrá tu bar
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[#041611] px-4 py-12">
      <Suspense fallback={<div className="text-cream/50">Cargando...</div>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
