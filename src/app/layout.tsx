import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "PonelePlay",
    template: "%s · PonelePlay",
  },
  description:
    "La música del bar la elige la gente. Escaneá el QR, canjeá tus votos y poné la próxima canción.",
  applicationName: "PonelePlay",
};

export const viewport: Viewport = {
  themeColor: "#041611",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${bricolage.variable} ${dmSans.variable} ${jetbrains.variable}`}
    >
      <body className="grain min-h-dvh bg-felt-950 font-sans text-cream antialiased">
        {children}
      </body>
    </html>
  );
}
