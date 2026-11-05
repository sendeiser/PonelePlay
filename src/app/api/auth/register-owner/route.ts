import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/api/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password.trim() : "";
    const venueName = typeof body?.venueName === "string" ? body.venueName.trim() : "";
    const slug = typeof body?.slug === "string" ? body.slug.trim().toLowerCase() : "";
    const venueType = body?.venueType === "party" ? "party" : "bar";
    const isParty = venueType === "party";

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { ok: false, error: "Ingresá un correo electrónico válido." },
        { status: 400 },
      );
    }

    if (!password || password.length < 6) {
      return NextResponse.json(
        { ok: false, error: "La contraseña debe tener al menos 6 caracteres." },
        { status: 400 },
      );
    }

    if (!venueName) {
      return NextResponse.json(
        { ok: false, error: "El nombre del bar o salón es obligatorio." },
        { status: 400 },
      );
    }

    if (!slug || slug.length < 3) {
      return NextResponse.json(
        { ok: false, error: "El enlace del bar debe tener al menos 3 caracteres." },
        { status: 400 },
      );
    }

    const admin = createAdminSupabase();

    // 1. Verify if slug is already taken
    const { data: existingVenueWithSlug, error: slugCheckErr } = await admin
      .from("venues")
      .select("id")
      .eq("slug", slug)
      .limit(1)
      .maybeSingle();

    if (slugCheckErr) {
      console.error("Error checking venue slug uniqueness:", slugCheckErr);
    }

    if (existingVenueWithSlug) {
      return NextResponse.json(
        {
          ok: false,
          error: `El identificador «${slug}» ya está en uso. Por favor elegí otro nombre o personalizá el enlace del bar.`,
        },
        { status: 400 },
      );
    }

    // 2. Create user or heal existing unlinked auth user
    let userId: string | null = null;

    const { data: createData, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email so owner is never blocked by confirmation emails
      user_metadata: {
        venue_name: venueName,
        venue_slug: slug,
      },
    });

    if (createData?.user) {
      userId = createData.user.id;
    } else if (createErr) {
      const errLower = createErr.message.toLowerCase();
      const isAlreadyRegistered =
        errLower.includes("already registered") ||
        errLower.includes("already exists") ||
        errLower.includes("user already exists");

      if (!isAlreadyRegistered) {
        return NextResponse.json(
          { ok: false, error: createErr.message },
          { status: 400 },
        );
      }

      // If user already exists in auth.users, check if they already own a venue
      const { data: usersList } = await admin.auth.admin.listUsers({ perPage: 1000 });
      const foundUser = usersList?.users?.find(
        (u) => u.email?.toLowerCase() === email,
      );

      if (!foundUser) {
        return NextResponse.json(
          {
            ok: false,
            error: "Este email ya está registrado. Por favor iniciá sesión.",
          },
          { status: 400 },
        );
      }

      // Check if user already has an active venue in public.venues
      const { data: userVenue } = await admin
        .from("venues")
        .select("id, name, slug")
        .eq("owner_id", foundUser.id)
        .limit(1)
        .maybeSingle();

      if (userVenue) {
        return NextResponse.json(
          {
            ok: false,
            error: `Este email ya tiene un bar registrado («${userVenue.name}» / ${userVenue.slug}). Por favor iniciá sesión con tu cuenta.`,
          },
          { status: 400 },
        );
      }

      // User exists in auth.users but has NO venue (e.g. from a prior RLS failure)!
      // Heal the account: update password and confirm email, and link the new venue!
      await admin.auth.admin.updateUserById(foundUser.id, {
        password,
        email_confirm: true,
        user_metadata: {
          venue_name: venueName,
          venue_slug: slug,
        },
      });

      userId = foundUser.id;
    }

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "No se pudo crear o recuperar el usuario administrador." },
        { status: 500 },
      );
    }

    // 3. Insert venue using admin client (bypasses RLS to avoid permission errors)
    const { data: newVenue, error: venueInsertErr } = await admin
      .from("venues")
      .insert({
        owner_id: userId,
        name: venueName,
        slug,
        accent_color: isParty ? "#EC4899" : "#6366F1",
        join_message: isParty
          ? "¡Bienvenido a la fiesta! Escaneá el QR para pedir canciones, votar y mandar dedicatorias 🎉"
          : "¡Bienvenido! Escaneá el QR para pedir y votar canciones.",
      })
      .select()
      .single();

    if (venueInsertErr || !newVenue) {
      console.error("Error inserting venue:", venueInsertErr);
      return NextResponse.json(
        {
          ok: false,
          error: `Error al registrar el bar: ${venueInsertErr?.message || "Error desconocido"}`,
        },
        { status: 500 },
      );
    }

    // 4. Create default open night session for the venue
    try {
      await admin.from("night_sessions").insert({
        venue_id: newVenue.id,
        status: "open",
        opened_by_kind: "owner",
        opened_by_id: userId,
      });
    } catch (nsErr) {
      console.warn("Could not create initial night session:", nsErr);
    }

    // 5. Ensure default venue settings are created
    try {
      const { data: existingSettings } = await admin
        .from("venue_settings")
        .select("venue_id")
        .eq("venue_id", newVenue.id)
        .maybeSingle();

      if (!existingSettings) {
        await admin.from("venue_settings").insert({
          venue_id: newVenue.id,
          explicit_filter_enabled: !isParty,
          max_proposals_per_participant: isParty ? 999 : 3,
          max_queue_size: isParty ? 100 : 30,
          default_credits_per_code: isParty ? 999 : 3,
          max_credits_per_code: isParty ? 999 : 10,
        });
      }

      if (isParty) {
        await admin
          .from("venue_settings")
          .update({
            venue_type: "party",
            party_mode: "hybrid_turbo",
            party_votes_per_guest: 0,
            party_min_votes_to_queue: 1,
            allow_dedications: true,
            allow_guest_karaoke: true,
          } as never)
          .eq("venue_id", newVenue.id);
      }
    } catch (stErr) {
      console.warn("Could not ensure venue settings:", stErr);
    }

    return NextResponse.json({
      ok: true,
      slug,
      venueId: newVenue.id,
      venueType,
    });
  } catch (err: unknown) {
    console.error("Unexpected error in /api/auth/register-owner:", err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Error inesperado del servidor al registrar el bar.",
      },
      { status: 500 },
    );
  }
}

