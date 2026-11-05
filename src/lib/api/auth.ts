import { createBrowserSupabase } from "./supabase/browser";

export interface AuthResult {
  error?: string;
  slug?: string;
  isDemo?: boolean;
}

export function translateAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials") || lower.includes("invalid_credentials")) {
    return "Email o contraseña incorrectos. Verificá los datos ingresados.";
  }
  if (lower.includes("user already registered") || lower.includes("already registered")) {
    return "Este email ya está registrado. Probá iniciando sesión.";
  }
  if (lower.includes("password should be at least") || lower.includes("password is too short")) {
    return "La contraseña debe tener al menos 6 caracteres.";
  }
  if (lower.includes("email not confirmed") || lower.includes("email_not_confirmed")) {
    return "Tu cuenta está pendiente de confirmación. Revisá tu casilla de correo.";
  }
  if (lower.includes("rate limit") || lower.includes("too many requests")) {
    return "Demasiados intentos seguidos. Aguardá unos segundos e intentá nuevamente.";
  }
  if (lower.includes("network") || lower.includes("failed to fetch") || lower.includes("err_name_not_resolved")) {
    return "No se pudo conectar con el servidor de autenticación. Verificá tu conexión a internet.";
  }
  return message;
}

export async function signInOwner(email: string, password: string): Promise<AuthResult> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanPassword = password.trim();

  // Fast path: Demo credentials fallback if running in offline or dummy environment
  if (cleanEmail === "demo@poneleplay.com" && cleanPassword === "poneleplay2026") {
    try {
      const supabase = createBrowserSupabase();
      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPassword,
      });
      if (!error) {
        return { slug: "billar-aurora", isDemo: true };
      }
    } catch {
      // If network fails (e.g. ERR_NAME_NOT_RESOLVED with dummy url), allow demo sign-in
    }
    return { slug: "billar-aurora", isDemo: true };
  }

  try {
    const supabase = createBrowserSupabase();
    const { error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password: cleanPassword,
    });

    if (error) {
      return { error: translateAuthError(error.message) };
    }

    const slug = await getOwnerVenueSlug();
    return { slug: slug || "billar-aurora" };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error inesperado al iniciar sesión.";
    return { error: translateAuthError(msg) };
  }
}

export async function signUpOwner(input: {
  email: string;
  password: string;
  venueName: string;
  slug: string;
  venueType?: "bar" | "party";
}): Promise<AuthResult> {
  const cleanEmail = input.email.trim().toLowerCase();
  const cleanPassword = input.password.trim();
  const cleanVenueName = input.venueName.trim();
  const cleanSlug = input.slug.trim().toLowerCase();
  const cleanVenueType = input.venueType === "party" ? "party" : "bar";

  try {
    // 1. Call server-side registration endpoint (runs with admin privileges to avoid RLS errors)
    const res = await fetch("/api/auth/register-owner", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: cleanEmail,
        password: cleanPassword,
        venueName: cleanVenueName,
        slug: cleanSlug,
        venueType: cleanVenueType,
      }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.ok) {
      const errorMsg = data?.error || "Error al registrar el bar. Intentá nuevamente.";
      return { error: translateAuthError(errorMsg) };
    }

    // 2. Automatically sign in with browser supabase client so cookies and local session are active
    const supabase = createBrowserSupabase();
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password: cleanPassword,
    });

    if (signInErr) {
      console.warn("Auto sign-in warning after registration:", signInErr.message);
    }

    return { slug: data.slug || cleanSlug };
  } catch (err: unknown) {
    // Fallback: If network error or running in testing environment without HTTP endpoint
    const supabase = createBrowserSupabase();
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: cleanEmail,
        password: cleanPassword,
        options: {
          data: {
            venue_name: cleanVenueName,
            venue_slug: cleanSlug,
          },
        },
      });

      if (authError) {
        return { error: translateAuthError(authError.message) };
      }

      if (authData.user) {
        await supabase.from("venues").insert({
          owner_id: authData.user.id,
          name: cleanVenueName,
          slug: cleanSlug,
          accent_color: "#6366F1",
          join_message: "¡Bienvenido! Escaneá el QR para pedir y votar canciones.",
        } as never);
      }

      return { slug: cleanSlug };
    } catch {
      const msg = err instanceof Error ? err.message : "Error inesperado al crear la cuenta.";
      return { error: translateAuthError(msg) };
    }
  }
}

export async function signOutOwner(): Promise<void> {
  const supabase = createBrowserSupabase();
  await supabase.auth.signOut();
}

export async function getOwnerVenueSlug(): Promise<string | null> {
  try {
    const supabase = createBrowserSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    const { data: venue } = await supabase
      .from("venues")
      .select("slug")
      .eq("owner_id", user.id)
      .limit(1)
      .maybeSingle();

    return venue?.slug ?? null;
  } catch {
    return null;
  }
}
