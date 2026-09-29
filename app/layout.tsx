import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CraftPanel | Minecraft hosting",
  description: "Panel de control para servidores Minecraft Java",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
