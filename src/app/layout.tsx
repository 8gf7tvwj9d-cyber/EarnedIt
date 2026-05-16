import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EarnedIt",
  description: "A mobile-first chore approval and payout tracker for families.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/static/icons/apple-touch-icon.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="192x192"
          href="/static/icons/icon-192.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="512x512"
          href="/static/icons/icon-512.png"
        />
        <link rel="icon" type="image/x-icon" href="/static/icons/favicon.ico" />
        <link rel="manifest" href="/static/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="EarnedIt" />
        <meta name="application-name" content="EarnedIt" />
        <meta name="theme-color" content="#07110D" />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
