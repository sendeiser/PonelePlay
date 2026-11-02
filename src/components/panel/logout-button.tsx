"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOutOwner } from "@/lib/api/auth";

interface LogoutButtonProps {
  isCollapsed?: boolean;
}

export function LogoutButton({ isCollapsed }: LogoutButtonProps) {
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

  if (isCollapsed) {
    return (
      <button
        type="button"
        onClick={handleSignOut}
        disabled={loading}
        title={loading ? "Cerrando sesión..." : "Cerrar sesión"}
        aria-label="Cerrar sesión"
        className="mt-auto flex items-center justify-center size-9 mx-auto rounded-lg text-red-400 hover:text-red-300 hover:bg-red-950/30 transition-colors disabled:opacity-50"
      >
        <span className="material-symbols-outlined text-lg">logout</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={loading}
      className="mt-auto flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm text-red-300/80 hover:text-red-200 hover:bg-red-950/30 transition-colors disabled:opacity-50"
    >
      <span className="material-symbols-outlined text-base">logout</span>
      <span>{loading ? "Cerrando sesión..." : "Cerrar sesión"}</span>
    </button>
  );
}
