import type { Metadata } from "next";
import { PanelShell } from "@/components/panel/panel-shell";
import { StaffManager } from "@/components/panel/staff-manager";

export const metadata: Metadata = {
  title: "Personal y Mozos · Panel PonelePlay",
  description: "Gestión de personal y PINs de acceso para emisión de tickets.",
};

export default async function PersonalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <PanelShell slug={slug} role="owner">
      <StaffManager slug={slug} />
    </PanelShell>
  );
}

