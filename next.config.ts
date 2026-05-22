import type { NextConfig } from "next";

function getConfiguredHost(envName: string) {
  const baseUrl = process.env[envName]?.trim();
  if (!baseUrl) {
    return null;
  }

  try {
    return new URL(baseUrl).hostname;
  } catch {
    return null;
  }
}

const configuredAppHost = getConfiguredHost("NEXT_PUBLIC_EARNEDIT_APP_BASE_URL");
const configuredChildLinkHost = getConfiguredHost("NEXT_PUBLIC_EARNEDIT_CHILD_LINK_BASE_URL");

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    ...(configuredAppHost ? [configuredAppHost] : []),
    ...(configuredChildLinkHost ? [configuredChildLinkHost] : []),
  ],
};

export default nextConfig;
