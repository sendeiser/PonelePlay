import { Suspense } from "react";
import type { Metadata } from "next";
import { ClientPlayerScreen } from "@/components/player/client-player-screen";

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
        <div className="flex h-screen items-center justify-center bg-[#07090e] font-mono text-xs text-indigo-300">
          Cargando pantalla del salón...
        </div>
      }
    >
      <ClientPlayerScreen slug={slug} />
    </Suspense>
  );
}
