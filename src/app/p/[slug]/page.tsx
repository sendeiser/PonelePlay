import type { Metadata } from "next";
import { ClientDemo } from "@/components/client/client-demo";

export const metadata: Metadata = {
  title: "Votá la música",
  description: "Escaneá, canjeá tus créditos y poné la próxima canción.",
};

export default async function ClientPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return <ClientDemo slug={slug} />;
}
