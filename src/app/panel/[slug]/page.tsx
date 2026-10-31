import type { Metadata } from "next";
import { PanelDemo } from "@/components/panel/panel-demo";

export const metadata: Metadata = {
  title: "Panel del bar",
  description: "Noche, códigos, cola y reproductor en un solo lugar.",
};

export default async function PanelPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return <PanelDemo slug={slug} />;
}
