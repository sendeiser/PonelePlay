"use client";

import { useEffect, useState, useCallback } from "react";
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
      setError(err instanceof Error ? err.message : "Error al cargar personal");
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
      setError(err instanceof Error ? err.message : "Error al crear personal");
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
      setError(err instanceof Error ? err.message : "Error al resetear PIN");
    } finally {
      setResetting(false);
    }
  }

  async function handleToggle(id: string, current: boolean) {
    try {
      await toggleStaffActive(id, !current);
      await loadStaff();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al cambiar estado");
    }
  }

  const activeCount = staffList.filter((s) => s.active).length;

  return (
    <div className="space-y-6">
      {/* Top Header Section */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-th-border">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs text-th-accent mb-1 font-semibold">
            <span className="material-symbols-outlined text-sm">badge</span>
            <span>SEGURIDAD & TERMINALES STAFF</span>
          </div>
          <h1 className="font-display text-xl font-bold text-th-text tracking-tight">
            Gestión de Personal & Códigos PIN
          </h1>
          <p className="text-xs text-th-muted mt-0.5">
            Administrá credenciales de mozos, roles de terminal táctil y control de seguridad en turnos nocturnos.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-th-accent hover:bg-th-accent-hover text-th-on-accent font-mono text-xs font-semibold transition-all active:scale-95 shadow-sm"
        >
          <span className="material-symbols-outlined text-base">person_add</span>
          <span>Registrar Mozo / Staff</span>
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-th-danger/35 bg-th-danger-soft p-3 text-xs font-mono text-th-danger flex items-center gap-2">
          <span className="material-symbols-outlined text-base">error</span>
          <span>{error}</span>
        </div>
      )}

      {/* Metric Stats Bar (Bento Pattern) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card-panel rounded-2xl p-4 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="font-mono text-[10px] text-th-muted uppercase font-semibold tracking-wider">
              Dotación en Turno
            </span>
            <span className="font-display text-xl font-bold text-th-accent mt-1">
              {activeCount} {activeCount === 1 ? "Mozo Activo" : "Mozos Activos"}
            </span>
            <span className="font-mono text-[11px] text-th-teal mt-0.5">
              Terminales autorizadas
            </span>
          </div>
          <div className="size-11 rounded-xl bg-th-accent-soft border border-th-accent/25 flex items-center justify-center text-th-accent">
            <span className="material-symbols-outlined text-2xl">group</span>
          </div>
        </div>

        <div className="card-panel rounded-2xl p-4 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="font-mono text-[10px] text-th-muted uppercase font-semibold tracking-wider">
              Seguridad de Terminal
            </span>
            <span className="font-display text-xl font-bold text-th-emerald mt-1">
              Sin Bloqueos
            </span>
            <span className="font-mono text-[11px] text-th-muted mt-0.5">
              PIN 4 dígitos cifrado
            </span>
          </div>
          <div className="size-11 rounded-xl bg-th-emerald-soft border border-th-emerald/25 flex items-center justify-center text-th-emerald">
            <span className="material-symbols-outlined text-2xl">verified_user</span>
          </div>
        </div>

        <div className="card-panel rounded-2xl p-4 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="font-mono text-[10px] text-th-muted uppercase font-semibold tracking-wider">
              Cierre de Sesión
            </span>
            <span className="font-display text-xl font-bold text-th-text mt-1">
              Auto-Lock 5 min
            </span>
            <span className="font-mono text-[11px] text-th-secondary mt-0.5">
              Protección mostrador
            </span>
          </div>
          <div className="size-11 rounded-xl bg-th-recessed border border-th-border flex items-center justify-center text-th-accent">
            <span className="material-symbols-outlined text-2xl">lock_clock</span>
          </div>
        </div>
      </div>

      {/* Staff Table */}
      <div className="card-panel rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-th-border">
          <div>
            <h2 className="font-display text-base font-bold text-th-text tracking-tight flex items-center gap-2">
              <span className="material-symbols-outlined text-th-accent text-lg">badge</span>
              Personal con Acceso a la Terminal
            </h2>
            <p className="font-mono text-xs text-th-muted mt-0.5">
              Listado de mozos y administradores con PIN registrado para emitir tickets y moderar.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadStaff()}
            className="size-9 rounded-lg border border-th-border bg-th-recessed text-th-muted hover:text-th-text hover:bg-th-card-hover flex items-center justify-center transition-colors"
          >
            <span className="material-symbols-outlined text-base">refresh</span>
          </button>
        </div>

        {loading && staffList.length === 0 ? (
          <p className="text-center py-10 text-xs font-mono text-th-muted">
            Cargando nómina de personal...
          </p>
        ) : staffList.length === 0 ? (
          <div className="text-center py-10 text-th-muted font-mono space-y-2 text-xs">
            <span className="material-symbols-outlined text-th-muted/70 text-3xl">group_off</span>
            <p>No hay personal registrado todavía.</p>
          </div>
        ) : (
          <>
            {/* Mobile Card List (sm:hidden) */}
            <div className="sm:hidden space-y-3 mt-3">
              {staffList.map((member) => (
                <div
                  key={member.id}
                  className="p-3.5 rounded-xl bg-th-recessed border border-th-border space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="size-9 rounded-lg bg-th-accent-soft border border-th-accent/30 flex items-center justify-center text-th-accent font-bold text-xs">
                        {member.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-bold text-th-text text-xs">{member.name}</p>
                        <p className="text-[10px] text-th-muted font-mono">PIN: ••••</p>
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold font-mono uppercase ${
                        member.active
                          ? "bg-th-emerald-soft border border-th-emerald/25 text-th-emerald"
                          : "bg-th-card text-th-muted border border-th-border"
                      }`}
                    >
                      <span
                        className={`size-1.5 rounded-full ${
                          member.active ? "bg-th-emerald" : "bg-th-muted"
                        }`}
                      />
                      {member.active ? "Activo" : "Pausado"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-th-border">
                    <button
                      type="button"
                      onClick={() => setResetId(member.id)}
                      className="flex-1 py-2 px-3 rounded-lg bg-th-card border border-th-border text-th-secondary hover:text-th-text text-xs font-semibold flex items-center justify-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-sm">key</span>
                      <span>Cambiar PIN</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleToggle(member.id, member.active)}
                      className={`flex-1 py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center transition-colors ${
                        member.active
                          ? "bg-th-danger-soft text-th-danger border-th-danger/30"
                          : "bg-th-emerald-soft text-th-emerald border-th-emerald/30"
                      }`}
                    >
                      {member.active ? "Desactivar" : "Activar"}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table (hidden sm:block) */}
            <div className="hidden sm:block max-h-[420px] min-h-0 rounded-xl border border-th-border overflow-x-auto ui-scroll-container">
              <table className="w-full text-left text-xs font-mono">
                <thead className="sticky top-0 z-10 bg-th-recessed border-b border-th-border">
                  <tr className="text-th-muted text-[10px] uppercase">
                    <th className="py-2.5 px-3">Miembro</th>
                    <th className="py-2.5 px-3">PIN</th>
                    <th className="py-2.5 px-3">Estado</th>
                    <th className="py-2.5 px-3">Registrado</th>
                    <th className="py-2.5 px-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-th-border bg-th-card">
                  {staffList.map((member) => (
                    <tr key={member.id} className="hover:bg-th-card-hover transition-colors">
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2.5">
                          <div className="size-8 rounded-lg bg-th-accent-soft border border-th-accent/30 flex items-center justify-center text-th-accent font-bold">
                            {member.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-th-text text-xs">{member.name}</p>
                            <p className="text-[10px] text-th-muted">Mozo de barra / salón</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-th-muted">
                        <span className="tracking-widest">••••</span>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                            member.active
                              ? "bg-th-emerald-soft border border-th-emerald/25 text-th-emerald"
                              : "bg-th-recessed text-th-muted border border-th-border"
                          }`}
                        >
                          <span
                            className={`size-1.5 rounded-full ${
                              member.active ? "bg-th-emerald" : "bg-th-muted"
                            }`}
                          />
                          {member.active ? "Habilitado" : "Deshabilitado"}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-th-muted">
                        {new Date(member.createdAt).toLocaleDateString("es-AR")}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setResetId(member.id)}
                            className="px-2.5 py-1 rounded-lg bg-th-recessed border border-th-border text-th-secondary hover:text-th-text hover:bg-th-card-hover text-[11px] font-semibold flex items-center gap-1 transition-colors"
                          >
                            <span className="material-symbols-outlined text-xs">key</span>
                            <span>Reset PIN</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleToggle(member.id, member.active)}
                            className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors ${
                              member.active
                                ? "bg-th-danger-soft text-th-danger border-th-danger/30 hover:bg-th-danger hover:text-white"
                                : "bg-th-emerald-soft text-th-emerald border-th-emerald/30 hover:bg-th-emerald hover:text-white"
                            }`}
                          >
                            {member.active ? "Desactivar" : "Activar"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Modal: Crear Staff */}
      {createOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="card-panel rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="font-display text-base font-bold text-th-text flex items-center gap-2">
              <span className="material-symbols-outlined text-th-accent">person_add</span>
              Registrar Nuevo Personal
            </h3>
            <p className="text-xs text-th-muted">
              Ingresá el nombre del mozo y asignale un PIN numérico de 4 dígitos.
            </p>

            <form onSubmit={handleCreate} className="space-y-3 pt-2">
              <div>
                <label className="ui-label mb-1">Nombre</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ej: Facundo (Barra)"
                  className="ui-input"
                />
              </div>

              <div>
                <label className="ui-label mb-1">PIN numérico (4 dígitos)</label>
                <input
                  type="password"
                  required
                  maxLength={4}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="••••"
                  className="ui-input !text-lg tracking-widest text-center"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-th-border">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="px-4 py-2 rounded-xl border border-th-border bg-th-recessed text-th-secondary hover:text-th-text font-mono text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating || newPin.length !== 4 || !newName.trim()}
                  className="px-4 py-2 rounded-xl bg-th-accent hover:bg-th-accent-hover text-th-on-accent font-mono text-xs font-semibold transition-all disabled:opacity-50"
                >
                  {creating ? "Registrando..." : "Guardar Personal"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Reset PIN */}
      {resetId && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="card-panel rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <h3 className="font-display text-base font-bold text-th-text flex items-center gap-2">
              <span className="material-symbols-outlined text-th-accent">key</span>
              Resetear PIN
            </h3>
            <p className="text-xs text-th-muted">
              Asigná un nuevo PIN de 4 dígitos para este miembro del personal.
            </p>

            <form onSubmit={handleResetPin} className="space-y-3 pt-2">
              <div>
                <label className="ui-label mb-1">Nuevo PIN (4 dígitos)</label>
                <input
                  type="password"
                  required
                  maxLength={4}
                  value={resetPinValue}
                  onChange={(e) => setResetPinValue(e.target.value.replace(/\D/g, ""))}
                  placeholder="••••"
                  className="ui-input !text-lg tracking-widest text-center"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-th-border">
                <button
                  type="button"
                  onClick={() => setResetId(null)}
                  className="px-4 py-2 rounded-xl border border-th-border bg-th-recessed text-th-secondary hover:text-th-text font-mono text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={resetting || resetPinValue.length !== 4}
                  className="px-4 py-2 rounded-xl bg-th-accent hover:bg-th-accent-hover text-th-on-accent font-mono text-xs font-semibold transition-all disabled:opacity-50"
                >
                  {resetting ? "Guardando..." : "Actualizar PIN"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
