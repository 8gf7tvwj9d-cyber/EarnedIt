import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type SupabaseRuntimeConfig = {
  appBaseUrl: string | null;
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
    appBaseUrl: readEnv(process.env.NEXT_PUBLIC_EARNEDIT_APP_BASE_URL),
    url: readEnv(process.env.NEXT_PUBLIC_SUPABASE_URL),
    anonKey: readEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    serviceRoleKey: readEnv(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };
}

export function getEarnedItAppBaseUrl() {
  const configuredUrl = getSupabaseRuntimeConfig().appBaseUrl;
  if (configuredUrl) {
    return configuredUrl.replace(/\/+$/, "");
  }

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return null;
}

export function logSupabaseAuthDebug(
  eventName: string,
  details: {
    missingMigrationObjects?: string[];
    sessionExists?: boolean;
    userIdExists?: boolean;
  } = {},
) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.info("[Earned auth debug]", {
    eventName,
    sessionExists: Boolean(details.sessionExists),
    userIdExists: Boolean(details.userIdExists),
    missingMigrationObjects: details.missingMigrationObjects ?? [],
  });
}

function getUrlAuthCode() {
  if (typeof window === "undefined") {
    return null;
  }

  const params = new URLSearchParams(window.location.search);
  return params.get("code");
}

function getUrlHashSessionTokens() {
  if (typeof window === "undefined" || !window.location.hash) {
    return null;
  }

  const params = new URLSearchParams(window.location.hash.slice(1));
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!accessToken || !refreshToken) {
    return null;
  }

  return {
    accessToken,
    refreshToken,
  };
}

export async function recoverSupabaseAuthSessionFromUrl() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase || typeof window === "undefined") {
    return;
  }

  const {
    data: { session: existingSession },
  } = await supabase.auth.getSession();
  logSupabaseAuthDebug("getSession_before_redirect_recovery", {
    sessionExists: Boolean(existingSession),
    userIdExists: Boolean(existingSession?.user?.id),
  });

  if (existingSession?.user || window.location.search.includes("error")) {
    return;
  }

  const code = getUrlAuthCode();
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    logSupabaseAuthDebug(error ? "email_redirect_exchange_failed" : "email_redirect_exchange_succeeded", {
      sessionExists: Boolean(data.session),
      userIdExists: Boolean(data.session?.user?.id),
    });

    if (error) {
      throw error;
    }
    return;
  }

  const hashTokens = getUrlHashSessionTokens();
  if (!hashTokens) {
    return;
  }

  const { data, error } = await supabase.auth.setSession({
    access_token: hashTokens.accessToken,
    refresh_token: hashTokens.refreshToken,
  });
  logSupabaseAuthDebug(error ? "hash_redirect_session_failed" : "hash_redirect_session_succeeded", {
    sessionExists: Boolean(data.session),
    userIdExists: Boolean(data.session?.user?.id),
  });

  if (error) {
    throw error;
  }
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
