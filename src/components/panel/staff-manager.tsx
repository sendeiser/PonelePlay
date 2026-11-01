"use client";

import { useEffect, useState, useCallback } from "react";
import { KeyRound, Lock, Plus, RefreshCw, ShieldAlert, User, UserCheck, UserX } from "lucide-react";
import {
  createStaff,
  listStaff,
  resetStaffPin,
  toggleStaffActive,
  type StaffMemberRow,
} from "@/lib/api/owner-ops";
import { createBrowserSupabase } from "@/lib/api/supabase/browser";

interface StaffManagerProps {
  slug: string;
}

export function StaffManager({ slug }: StaffManagerProps) {
  const [venueId, setVenueId] = useState<string | null>(null);
  const [staffList, setStaffList] = useState<StaffMemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPin, setNewPin] = useState("");
  const [creating, setCreating] = useState(false);

  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPinValue, setResetPinValue] = useState("");
  const [resetting, setResetting] = useState(false);

  // Resolve venueId
  useEffect(() => {
    async function resolveVenue() {
      const supabase = createBrowserSupabase();
      const { data } = await supabase
        .from("venues")
        .select("id")
        .eq("slug", slug)
        .single();

      if (data && typeof data === "object" && "id" in data) {
        setVenueId(String((data as { id: string }).id));
      }
    }
    void resolveVenue();
  }, [slug]);

  const loadStaff = useCallback(async () => {
    if (!venueId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listStaff(venueId);
      setStaffList(data);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Error al cargar personal",
      );
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  useEffect(() => {
    void loadStaff();
  }, [loadStaff]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!venueId || !newName.trim() || !newPin.trim()) return;

    setCreating(true);
    setError(null);
    try {
      await createStaff(venueId, newName, newPin);
      setCreateOpen(false);
      setNewName("");
      setNewPin("");
      await loadStaff();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Error al crear personal",
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleResetPin(e: React.FormEvent) {
    e.preventDefault();
    if (!resetId || !resetPinValue.trim()) return;

    setResetting(true);
    setError(null);
    try {
      await resetStaffPin(resetId, resetPinValue);
      setResetId(null);
      setResetPinValue("");
      await loadStaff();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Error al restablecer el PIN",
      );
    } finally {
      setResetting(false);
    }
  }

  async function handleToggle(staffId: string, currentActive: boolean) {
    try {
      await toggleStaffActive(staffId, !currentActive);
      await loadStaff();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Error al modificar estado",
      );
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-cream/10 pb-5">
        <div>
          <h1 className="text-2xl font-display font-bold text-cream">
            Personal y Mozos
          </h1>
          <p className="mt-1 text-xs text-cream/50">
            Administrá los accesos con PIN de 6 dígitos para emisión de tickets
          </p>
        </div>

        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 rounded-xl bg-amber px-4 py-2 font-display text-xs font-bold text-[#041611] hover:bg-amber/90 transition-colors"
        >
          <Plus className="size-3.5" />
          Nuevo mozo / personal
        </button>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-coral/30 bg-coral/10 p-3 text-xs text-coral"
        >
          {error}
        </div>
      ) : null}

      {loading && staffList.length === 0 ? (
        <div className="py-12 text-center font-mono text-xs text-cream/40">
          Cargando personal...
        </div>
      ) : staffList.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {staffList.map((staff) => (
            <div
              key={staff.id}
              className="rounded-2xl border border-cream/10 bg-white/[0.02] p-4 flex flex-col justify-between gap-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`grid size-10 place-items-center rounded-xl ${
                      staff.active ? "bg-amber/15 text-amber" : "bg-cream/5 text-cream/30"
                    }`}
                  >
                    <User className="size-5" />
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-sm text-cream">
                      {staff.name}
                    </h3>
                    <p className="font-mono text-[10px] text-cream/40">
                      ID: {staff.id.slice(0, 8)}...
                    </p>
                  </div>
                </div>

                <span
                  className={`rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
                    staff.active
                      ? "bg-mint/15 text-mint border border-mint/25"
                      : "bg-coral/15 text-coral border border-coral/25"
                  }`}
                >
                  {staff.active ? "Activo" : "Inactivo"}
                </span>
              </div>

              {staff.lockedUntil ? (
                <div className="flex items-center gap-1.5 rounded-lg border border-coral/20 bg-coral/10 p-2 text-[11px] text-coral">
                  <ShieldAlert className="size-3.5 shrink-0" />
                  <span>Bloqueado por intentos fallidos</span>
                </div>
              ) : null}

              <div className="flex items-center justify-between border-t border-cream/5 pt-3">
                <button
                  type="button"
                  onClick={() => setResetId(staff.id)}
                  className="flex items-center gap-1 text-xs text-cream/60 hover:text-amber transition-colors"
                >
                  <KeyRound className="size-3" />
                  Cambiar PIN
                </button>

                <button
                  type="button"
                  onClick={() => void handleToggle(staff.id, staff.active)}
                  className={`flex items-center gap-1 text-xs font-semibold ${
                    staff.active ? "text-coral hover:underline" : "text-mint hover:underline"
                  }`}
                >
                  {staff.active ? (
                    <>
                      <UserX className="size-3" /> Desactivar
                    </>
                  ) : (
                    <>
                      <UserCheck className="size-3" /> Activar
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-cream/10 p-12 text-center text-xs text-cream/40">
          No hay miembros del personal creados todavía.
        </div>
      )}

      {/* Create Modal */}
      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm"
            onClick={() => setCreateOpen(false)}
          />
          <div className="relative w-full max-w-sm rounded-2xl border border-cream/15 bg-felt-900 p-6 shadow-2xl">
            <h2 className="font-display text-lg font-bold text-cream">
              Crear Nuevo Mozo / Personal
            </h2>
            <p className="mt-1 text-xs text-cream/50">
              El PIN debe tener 6 dígitos y se utilizará para iniciar sesión en la barra.
            </p>

            <form onSubmit={handleCreate} className="mt-5 space-y-4">
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-wider text-cream/50">
                  Nombre
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="ej: Martín P."
                  className="mt-1 w-full rounded-xl border border-cream/15 bg-white/5 px-3 py-2 text-xs text-cream placeholder:text-cream/25 focus:border-amber focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block font-mono text-[10px] uppercase tracking-wider text-cream/50">
                  PIN numérico (6 dígitos)
                </label>
                <input
                  type="password"
                  maxLength={6}
                  pattern="\d{6}"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  placeholder="••••••"
                  className="mt-1 w-full rounded-xl border border-cream/15 bg-white/5 px-3 py-2 font-mono text-center tracking-[0.5em] text-xs text-cream placeholder:text-cream/25 focus:border-amber focus:outline-none"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="rounded-xl border border-cream/15 px-3 py-1.5 text-xs text-cream/70 hover:bg-cream/5"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating || !newName.trim() || newPin.length !== 6}
                  className="flex items-center gap-1.5 rounded-xl bg-amber px-4 py-1.5 text-xs font-bold text-[#041611] hover:bg-amber/90 disabled:opacity-50"
                >
                  {creating ? <RefreshCw className="size-3 animate-spin" /> : null}
                  Crear mozo
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Reset PIN Modal */}
      {resetId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm"
            onClick={() => setResetId(null)}
          />
          <div className="relative w-full max-w-sm rounded-2xl border border-cream/15 bg-felt-900 p-6 shadow-2xl">
            <h2 className="font-display text-lg font-bold text-cream flex items-center gap-2">
              <Lock className="size-4 text-amber" />
              Restablecer PIN
            </h2>
            <p className="mt-1 text-xs text-cream/50">
              Ingresá un nuevo PIN numérico de 6 dígitos. Si el mozo estaba bloqueado, se desbloqueará de inmediato.
            </p>

            <form onSubmit={handleResetPin} className="mt-5 space-y-4">
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-wider text-cream/50">
                  Nuevo PIN (6 dígitos)
                </label>
                <input
                  type="password"
                  maxLength={6}
                  pattern="\d{6}"
                  value={resetPinValue}
                  onChange={(e) => setResetPinValue(e.target.value)}
                  placeholder="••••••"
                  className="mt-1 w-full rounded-xl border border-cream/15 bg-white/5 px-3 py-2 font-mono text-center tracking-[0.5em] text-xs text-cream placeholder:text-cream/25 focus:border-amber focus:outline-none"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResetId(null)}
                  className="rounded-xl border border-cream/15 px-3 py-1.5 text-xs text-cream/70 hover:bg-cream/5"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={resetting || resetPinValue.length !== 6}
                  className="flex items-center gap-1.5 rounded-xl bg-amber px-4 py-1.5 text-xs font-bold text-[#041611] hover:bg-amber/90 disabled:opacity-50"
                >
                  {resetting ? <RefreshCw className="size-3 animate-spin" /> : null}
                  Guardar PIN
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

