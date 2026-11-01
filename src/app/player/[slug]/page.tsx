import { Suspense } from "react";
import type { Metadata } from "next";
import { PlayerScreen } from "@/components/player/player-screen";

export const metadata: Metadata = {
  title: "Pantalla del salón · PonelePlay",
  description: "La cola en vivo y el QR para votar, en pantalla grande.",
};

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-felt-950 font-mono text-xs text-cream/40">
          Cargando pantalla del salón...
        </div>
      }
    >
      <PlayerScreen slug={slug} />
    </Suspense>
  );
}
