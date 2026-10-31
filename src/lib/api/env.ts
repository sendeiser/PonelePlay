import { z } from "zod";

export const PublicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
});

export function parsePublicEnv(source: Record<string, string | undefined>) {
  const result = PublicEnvSchema.safeParse(source);
  if (!result.success) {
    const missing = result.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Missing environment variable: ${missing}`);
  }
  return result.data;
}
