import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type SupabaseRuntimeConfig = {
  url: string | null;
  anonKey: string | null;
  serviceRoleKey: string | null;
};

type SupabaseEnvState = {
  configured: boolean;
  mode: "demo" | "supabase";
  missingPublicEnv: string[];
};

function readEnv(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function getSupabaseRuntimeConfig(): SupabaseRuntimeConfig {
  return {
    url: readEnv(process.env.NEXT_PUBLIC_SUPABASE_URL),
    anonKey: readEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    serviceRoleKey: readEnv(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };
}

export function getSupabaseEnvState(): SupabaseEnvState {
  const config = getSupabaseRuntimeConfig();
  const missingPublicEnv = [
    config.url ? null : "NEXT_PUBLIC_SUPABASE_URL",
    config.anonKey ? null : "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ].filter((value): value is string => Boolean(value));

  return {
    configured: missingPublicEnv.length === 0,
    mode: missingPublicEnv.length === 0 ? "supabase" : "demo",
    missingPublicEnv,
  };
}

export const isSupabaseConfigured = getSupabaseEnvState().configured;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  const config = getSupabaseRuntimeConfig();
  if (!config.url || !config.anonKey) {
    return null;
  }

  return createClient(config.url, config.anonKey);
}

export function getSupabaseSetupWarning() {
  const state = getSupabaseEnvState();
  if (state.configured) {
    return null;
  }

  return `Supabase is not configured. Missing ${state.missingPublicEnv.join(", ")}. Demo/local mode will stay active.`;
}
