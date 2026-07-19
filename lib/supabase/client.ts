// Client Supabase côté navigateur (composants "use client").
// Clés publiques uniquement — la sécurité repose sur la RLS de Plein Bail.
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
