export type PanelRole = "owner" | "staff" | "guest";

export type PanelNavItem = {
  label: string;
  href: string;
};

export function getPanelRole(
  owner: boolean,
  staffSession: { token: string; expiresAt: string; staff: { id: string; name: string }; venue: { id: string; slug: string; name: string } } | null,
): PanelRole {
  if (owner) return "owner";
  if (staffSession) return "staff";
  return "guest";
}

export function panelNavFor(role: PanelRole, slug: string): PanelNavItem[] {
  const base = `/panel/${slug}`;
  if (role === "staff") {
    return [
      { label: "Noche", href: base },
      { label: "Códigos", href: `${base}/codigos` },
    ];
  }
  return [
    { label: "Noche", href: base },
    { label: "Catálogo", href: `${base}/catalogo` },
    { label: "Códigos", href: `${base}/codigos` },
    { label: "Personal", href: `${base}/personal` },
    { label: "Ajustes", href: `${base}/ajustes` },
  ];
}
