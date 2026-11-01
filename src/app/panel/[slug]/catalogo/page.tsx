import type { Metadata } from "next";
import { PanelShell } from "@/components/panel/panel-shell";
import { CatalogManager } from "@/components/panel/catalog-manager";

export const metadata: Metadata = {
  title: "Catálogo y Respaldo · Panel PonelePlay",
  description: "Administrá las canciones y la lista de respaldo del local.",
};

export default async function CatalogoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <PanelShell slug={slug} role="owner">
      <CatalogManager slug={slug} />
    </PanelShell>
  );
}

