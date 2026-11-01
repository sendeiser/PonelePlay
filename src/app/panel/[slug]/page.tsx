import type { Metadata } from "next";
import { NightDashboard } from "@/components/panel/night-dashboard";

export const metadata: Metadata = {
  title: "Panel del bar · PonelePlay",
  description: "Noche, códigos, cola y reproductor en un solo lugar.",
};

export default async function PanelPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return <NightDashboard slug={slug} role="owner" />;
}
