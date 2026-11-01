import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "./lib/database.types";

// In-memory cache for recently verified tokens to eliminate redundant auth network calls during page transitions
const verifiedTokens = new Map<string, number>();

function isTokenRecentlyVerified(tokenKey: string): boolean {
  if (!tokenKey) return false;
  const expiresAt = verifiedTokens.get(tokenKey);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    verifiedTokens.delete(tokenKey);
    return false;
  }
  return true;
}

function markTokenVerified(tokenKey: string) {
  if (!tokenKey) return;
  if (verifiedTokens.size > 200) {
    verifiedTokens.clear();
  }
  verifiedTokens.set(tokenKey, Date.now() + 30_000); // 30s TTL
}

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });

  if (request.nextUrl.pathname.startsWith("/panel")) {
    const cookies = request.cookies.getAll();
    const authCookies = cookies.filter((c) => c.name.includes("-auth-token"));

    // 1. Fast path: If there are no auth cookies at all, redirect immediately (0ms)
    if (authCookies.length === 0) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", request.nextUrl.pathname);
      return NextResponse.redirect(loginUrl);
    }

    // 2. Fast path: If this session token was verified in the last 30s, skip remote network call
    const tokenKey = authCookies.map((c) => `${c.name}=${c.value.slice(-32)}`).join(";");
    if (isTokenRecentlyVerified(tokenKey)) {
      return response;
    }

    // 3. Verify session with Supabase
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (cookiesToSet) => {
            cookiesToSet.forEach(({ name, value, options }) => {
              request.cookies.set(name, value);
              response.cookies.set(name, value, options);
            });
          },
        },
      },
    );

    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", request.nextUrl.pathname);
      return NextResponse.redirect(loginUrl);
    }

    markTokenVerified(tokenKey);
  }

  return response;
}

export const config = {
  matcher: ["/panel/:path*"],
};
