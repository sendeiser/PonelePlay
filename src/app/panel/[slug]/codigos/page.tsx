import type { Metadata } from "next";
import { CodesManagement } from "@/components/panel/codes-management";

export const metadata: Metadata = {
  title: "Códigos de consumición · Panel PonelePlay",
  description: "Emití tickets y consultá el historial de códigos.",
};

export default async function CodigosPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return <CodesManagement slug={slug} role="owner" />;
}
