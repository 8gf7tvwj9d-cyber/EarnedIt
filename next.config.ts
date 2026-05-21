import type { NextConfig } from "next";

function getConfiguredChildLinkHost() {
  const baseUrl = process.env.NEXT_PUBLIC_EARNEDIT_CHILD_LINK_BASE_URL?.trim();
  if (!baseUrl) {
    return null;
  }

  try {
    return new URL(baseUrl).hostname;
  } catch {
    return null;
  }
}

const configuredChildLinkHost = getConfiguredChildLinkHost();

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    ...(configuredChildLinkHost ? [configuredChildLinkHost] : []),
  ],
};

export default nextConfig;
