import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Leitor de Preços",
  description:
    "App para ler e somar preços de prateleiras de supermercado usando a câmera.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Leitor de Preços",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className="h-dvh">
      <body className="h-dvh overflow-hidden bg-black">{children}</body>
    </html>
  );
}
