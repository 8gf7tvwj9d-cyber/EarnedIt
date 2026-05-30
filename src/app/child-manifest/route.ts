export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim();
  const startUrl = token
    ? `/child-link?token=${encodeURIComponent(token)}&homescreen=1`
    : "/";

  return Response.json(
    {
      name: "EarnedIt Child",
      short_name: "EarnedIt",
      start_url: startUrl,
      display: "standalone",
      background_color: "#07110D",
      theme_color: "#07110D",
      icons: [
        {
          src: "/static/icons/icon-192.png",
          sizes: "192x192",
          type: "image/png",
        },
        {
          src: "/static/icons/icon-512.png",
          sizes: "512x512",
          type: "image/png",
        },
      ],
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/manifest+json",
      },
    },
  );
}
