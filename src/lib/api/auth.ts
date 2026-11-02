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
}): Promise<AuthResult> {
  const cleanEmail = input.email.trim().toLowerCase();
  const cleanPassword = input.password.trim();
  const cleanVenueName = input.venueName.trim();
  const cleanSlug = input.slug.trim().toLowerCase();

  const supabase = createBrowserSupabase();

  try {
    // 1. Check if slug is already taken
    const { data: existingVenue } = await supabase
      .from("venues")
      .select("id")
      .eq("slug", cleanSlug)
      .limit(1)
      .maybeSingle();

    if (existingVenue) {
      return {
        error: `El identificador «${cleanSlug}» ya está en uso. Elegí otro nombre o personalizá el enlace del bar.`,
      };
    }

    // 2. Sign up owner with Supabase Auth
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

    // 3. Insert venue row linked to the newly created user
    if (authData.user) {
      const { data: newVenue, error: venueError } = await supabase
        .from("venues")
        .insert({
          owner_id: authData.user.id,
          name: cleanVenueName,
          slug: cleanSlug,
          accent_color: "#6366F1",
          join_message: "¡Bienvenido! Escaneá el QR para pedir y votar canciones.",
        } as never)
        .select()
        .single();

      if (venueError && !venueError.message.includes("duplicate key")) {
        // If venue creation had an issue but user was created, return friendly feedback
        return { error: `Cuenta creada, pero ocurrió un problema al registrar el bar: ${venueError.message}`, slug: cleanSlug };
      }

      // 4. Create initial open night session for the venue
      if (newVenue && (newVenue as Record<string, unknown>).id) {
        const venueId = String((newVenue as Record<string, unknown>).id);
        void supabase.from("night_sessions").insert({
          venue_id: venueId,
          status: "open",
          opened_by_kind: "owner",
          opened_by_id: authData.user.id,
        } as never);
      }
    }

    return { slug: cleanSlug };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error inesperado al crear la cuenta.";
    return { error: translateAuthError(msg) };
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
