import { PanelShell } from "@/components/panel/panel-shell";

export default async function PanelLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <PanelShell slug={slug} role="owner">
      {children}
    </PanelShell>
  );
}

