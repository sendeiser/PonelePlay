import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "./lib/database.types";

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });
  const cookieStore = request.cookies;

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookies) => {
          cookies.forEach(({ name, value, options }) => {
            cookieStore.set({ name, value, ...options });
          });
        },
      },
    },
  );

  const { data } = await supabase.auth.getUser();
  if (request.nextUrl.pathname.startsWith("/panel")) {
    if (!data.user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }
  return response;
}

export const config = {
  matcher: ["/panel/:path*"],
};
