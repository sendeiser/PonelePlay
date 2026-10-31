import type { Metadata } from "next";
import { ClientNight } from "@/components/client/client-night";

export const metadata: Metadata = {
  title: "Votá la música · PonelePlay",
  description: "Escaneá, canjeá tus créditos y poné la próxima canción.",
};

export default async function ClientPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return <ClientNight slug={slug} />;
}
