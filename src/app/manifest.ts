import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PonelePlay · Jukebox Bar",
    short_name: "PonelePlay",
    description: "La música del bar la elige la gente. Votá canciones, proponé temas y disfrutá la noche.",
    start_url: "/",
    display: "standalone",
    background_color: "#090D16",
    theme_color: "#0D1220",
    orientation: "portrait",
    scope: "/",
    id: "/",
    categories: ["entertainment", "music"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}

