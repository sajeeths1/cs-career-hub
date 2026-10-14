import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CS Career Hub",
  description: "Frontend dashboard for CS job matching and application tracking.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
