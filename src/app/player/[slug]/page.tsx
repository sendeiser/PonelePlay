import type { Metadata } from "next";
import { PlayerDemo } from "@/components/player/player-demo";

export const metadata: Metadata = {
  title: "Pantalla del salón",
  description: "La cola en vivo y el QR para votar, en pantalla grande.",
};

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return <PlayerDemo slug={slug} />;
}
