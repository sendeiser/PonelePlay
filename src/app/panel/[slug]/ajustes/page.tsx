import type { Metadata } from "next";
import { SettingsManager } from "@/components/panel/settings-manager";

export const metadata: Metadata = {
  title: "Ajustes del Local · Panel PonelePlay",
  description: "Configuración general del local, propuestas y código QR.",
};

export default async function AjustesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return <SettingsManager slug={slug} />;
}
