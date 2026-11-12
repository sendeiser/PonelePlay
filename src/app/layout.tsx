/* eslint-disable @next/next/no-page-custom-font */
import type { Metadata, Viewport } from "next";
import { DM_Sans, Outfit, Space_Mono } from "next/font/google";
import { PwaProvider } from "@/components/pwa-provider";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-space-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "PonelePlay · Jukebox Bar",
    template: "%s · PonelePlay",
  },
  description:
    "La música del bar la elige la gente. Escaneá el QR, canjeá tus votos y poné la próxima canción.",
  applicationName: "PonelePlay",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "PonelePlay",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/icons/icon.svg", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0f17",
  colorScheme: "dark light",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

const themeInitScript = `(function(){try{var k='poneleplay-theme';var s=localStorage.getItem(k);var t=(s==='light'||s==='dark')?s:(window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');var r=document.documentElement;r.dataset.theme=t;r.style.colorScheme=t;if(t==='dark'){r.classList.add('dark');}else{r.classList.remove('dark');}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      data-theme="dark"
      className={`dark ${outfit.variable} ${dmSans.variable} ${spaceMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <link rel="manifest" href="/manifest.json" />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-dvh bg-th-canvas text-th-text font-sans antialiased selection:bg-th-accent selection:text-white">
        <ThemeProvider>
          <PwaProvider>{children}</PwaProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
