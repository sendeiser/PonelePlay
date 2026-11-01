"use client";

import dynamic from "next/dynamic";

const PlayerScreen = dynamic(
  () => import("./player-screen").then((m) => m.PlayerScreen),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-screen items-center justify-center bg-[#07090e] font-mono text-xs text-indigo-300">
        Cargando pantalla del salón...
      </div>
    ),
  },
);

export function ClientPlayerScreen({ slug }: { slug: string }) {
  return <PlayerScreen slug={slug} />;
}

