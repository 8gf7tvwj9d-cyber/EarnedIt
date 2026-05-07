import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Earned",
  description: "A mobile-first chore approval and payout tracker for families.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
