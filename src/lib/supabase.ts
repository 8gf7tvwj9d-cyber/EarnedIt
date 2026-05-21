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

let browserClient: SupabaseClient | null = null;

function readEnv(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isLocalAuthTestModeEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_EARNEDIT_AUTH_TEST_MODE?.trim().toLowerCase() === "true"
  );
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
  if (isLocalAuthTestModeEnabled()) {
    return {
      configured: false,
      mode: "demo",
      missingPublicEnv: [],
    };
  }

  return {
    configured: missingPublicEnv.length === 0,
    mode: missingPublicEnv.length === 0 ? "supabase" : "demo",
    missingPublicEnv,
  };
}

export const isSupabaseConfigured = getSupabaseEnvState().configured;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (isLocalAuthTestModeEnabled()) {
    return null;
  }

  const config = getSupabaseRuntimeConfig();
  if (!config.url || !config.anonKey) {
    return null;
  }

  browserClient ??= createClient(config.url, config.anonKey);
  return browserClient;
}

export function getSupabaseSetupWarning() {
  const state = getSupabaseEnvState();
  if (state.configured) {
    return null;
  }

  return `Supabase is not configured. Missing ${state.missingPublicEnv.join(", ")}. Demo/local mode will stay active.`;
}
