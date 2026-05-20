import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseRuntimeConfig } from "@/lib/supabase";

export function getSupabaseServiceRoleClient(): SupabaseClient | null {
  if (typeof window !== "undefined") {
    return null;
  }

  const config = getSupabaseRuntimeConfig();
  if (!config.url || !config.serviceRoleKey) {
    return null;
  }

  return createClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
