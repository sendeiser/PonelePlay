import type { Metadata } from "next";
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

  return <StaffManager slug={slug} />;
}
