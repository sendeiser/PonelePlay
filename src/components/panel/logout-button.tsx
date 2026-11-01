"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOutOwner } from "@/lib/api/auth";

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await signOutOwner();
      router.push("/login");
      router.refresh();
    } catch {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={loading}
      className="mt-auto px-3 py-2 rounded-lg text-left text-sm text-red-300/80 hover:text-red-200 hover:bg-red-950/30 transition-colors disabled:opacity-50"
    >
      {loading ? "Cerrando sesión..." : "Cerrar sesión"}
    </button>
  );
}

