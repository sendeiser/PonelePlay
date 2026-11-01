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
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#1E2333]">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs text-indigo-400 mb-1">
            <span className="material-symbols-outlined text-sm">badge</span>
            <span>SEGURIDAD & TERMINALES STAFF</span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            Gestión de Personal & Códigos PIN
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Administrá credenciales de mozos, roles de terminal táctil y control de seguridad en turnos nocturnos.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-mono text-xs font-bold transition-all active:scale-95 shadow-sm"
        >
          <span className="material-symbols-outlined text-base">person_add</span>
          <span>+ Registrar Mozo / Staff</span>
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-950/60 p-3 text-xs text-red-200 flex items-center gap-2">
          <span className="material-symbols-outlined text-base text-red-400">error</span>
          <span>{error}</span>
        </div>
      )}

      {/* Metric Stats Bar (Bento Pattern) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#181b25] border border-[#232b42] rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div className="flex flex-col">
            <span className="font-mono text-[10px] text-slate-400 uppercase tracking-wider">
              Dotación en Turno
            </span>
            <span className="text-xl font-bold font-mono text-[#c0c1ff] mt-1">
              {activeCount} {activeCount === 1 ? "Mozo Activo" : "Mozos Activos"}
            </span>
            <span className="font-mono text-[11px] text-cyan-400 mt-0.5">
              Terminales autorizadas
            </span>
          </div>
          <div className="size-11 rounded-xl bg-[#121624] border border-[#232b42] flex items-center justify-center text-indigo-400">
            <span className="material-symbols-outlined text-2xl">group</span>
          </div>
        </div>

        <div className="bg-[#181b25] border border-[#232b42] rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div className="flex flex-col">
            <span className="font-mono text-[10px] text-slate-400 uppercase tracking-wider">
              Seguridad de Terminal
            </span>
            <span className="text-xl font-bold font-mono text-emerald-400 mt-1">
              Sin Bloqueos
            </span>
            <span className="font-mono text-[11px] text-slate-500 mt-0.5">
              PIN 4 dígitos cifrado
            </span>
          </div>
          <div className="size-11 rounded-xl bg-[#121624] border border-[#232b42] flex items-center justify-center text-emerald-400">
            <span className="material-symbols-outlined text-2xl">verified_user</span>
          </div>
        </div>

        <div className="bg-[#181b25] border border-[#232b42] rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div className="flex flex-col">
            <span className="font-mono text-[10px] text-slate-400 uppercase tracking-wider">
              Cierre de Sesión
            </span>
            <span className="text-xl font-bold font-mono text-white mt-1">
              Auto-Lock 5 min
            </span>
            <span className="font-mono text-[11px] text-indigo-300 mt-0.5">
              Protección mostrador
            </span>
          </div>
          <div className="size-11 rounded-xl bg-[#121624] border border-[#232b42] flex items-center justify-center text-indigo-400">
            <span className="material-symbols-outlined text-2xl">lock_clock</span>
          </div>
        </div>
      </div>

      {/* Staff Table */}
      <div className="card-panel rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-[#1E2333]">
          <div>
            <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <span className="material-symbols-outlined text-indigo-400 text-lg">badge</span>
              Personal con Acceso a la Terminal
            </h2>
            <p className="font-mono text-xs text-slate-400">
              Listado de mozos y administradores con PIN registrado para emitir tickets y moderar.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadStaff()}
            className="size-9 rounded-lg border border-[#232b42] text-slate-400 hover:text-white hover:bg-[#181b25] flex items-center justify-center transition-colors"
          >
            <span className="material-symbols-outlined text-base">refresh</span>
          </button>
        </div>

        {loading && staffList.length === 0 ? (
          <p className="text-center py-10 text-xs font-mono text-slate-500">
            Cargando nómina de personal...
          </p>
        ) : staffList.length === 0 ? (
          <div className="text-center py-10 text-slate-500 font-mono space-y-2 text-xs">
            <span className="material-symbols-outlined text-slate-600 text-3xl">group_off</span>
            <p>No hay personal registrado todavía.</p>
          </div>
        ) : (
          <>
            {/* Mobile Card List (sm:hidden) */}
            <div className="sm:hidden space-y-3 mt-3">
              {staffList.map((member) => (
                <div
                  key={member.id}
                  className="p-3.5 rounded-xl bg-[#141824] border border-[#232b42] space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="size-9 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-300 font-bold text-xs">
                        {member.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-bold text-white text-xs">{member.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono">PIN: ••••</p>
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold font-mono uppercase ${
                        member.active
                          ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                          : "bg-slate-800 text-slate-500 border border-slate-700"
                      }`}
                    >
                      <span
                        className={`size-1.5 rounded-full ${
                          member.active ? "bg-emerald-400" : "bg-slate-600"
                        }`}
                      />
                      {member.active ? "Activo" : "Pausado"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 pt-1 border-t border-[#1E2333]/50">
                    <button
                      type="button"
                      onClick={() => setResetId(member.id)}
                      className="flex-1 py-2 px-3 rounded-lg bg-[#181b25] border border-[#232b42] text-slate-300 active:bg-slate-800 text-xs font-semibold flex items-center justify-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-sm">key</span>
                      <span>Cambiar PIN</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleToggle(member.id, member.active)}
                      className={`flex-1 py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center transition-colors ${
                        member.active
                          ? "bg-red-950/40 text-red-300 border-red-500/30 active:bg-red-900/60"
                          : "bg-emerald-950/40 text-emerald-300 border-emerald-500/30 active:bg-emerald-900/60"
                      }`}
                    >
                      {member.active ? "Desactivar" : "Activar"}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table (hidden sm:block) */}
            <div className="hidden sm:block overflow-x-auto mt-2">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-[#1E2333] text-slate-500 text-[10px] uppercase">
                    <th className="py-2.5 px-3">Miembro</th>
                    <th className="py-2.5 px-3">PIN</th>
                    <th className="py-2.5 px-3">Estado</th>
                    <th className="py-2.5 px-3">Registrado</th>
                    <th className="py-2.5 px-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E2333]/50">
                  {staffList.map((member) => (
                    <tr key={member.id} className="hover:bg-[#181b25]/50 transition-colors">
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2.5">
                          <div className="size-8 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-300 font-bold">
                            {member.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-white text-xs">{member.name}</p>
                            <p className="text-[10px] text-slate-500">Mozo de barra / salón</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-400">
                        <span className="tracking-widest">••••</span>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                            member.active
                              ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                              : "bg-slate-800 text-slate-500 border border-slate-700"
                          }`}
                        >
                          <span
                            className={`size-1.5 rounded-full ${
                              member.active ? "bg-emerald-400" : "bg-slate-600"
                            }`}
                          />
                          {member.active ? "Habilitado" : "Deshabilitado"}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-500">
                        {new Date(member.createdAt).toLocaleDateString("es-AR")}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setResetId(member.id)}
                            className="px-2.5 py-1 rounded-md bg-[#181b25] border border-[#232b42] text-slate-300 hover:text-white text-[11px] font-semibold flex items-center gap-1 transition-colors"
                          >
                            <span className="material-symbols-outlined text-xs">key</span>
                            <span>Reset PIN</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleToggle(member.id, member.active)}
                            className={`px-2.5 py-1 rounded-md border text-[11px] font-semibold transition-colors ${
                              member.active
                                ? "bg-red-950/40 text-red-300 border-red-500/30 hover:bg-red-950/70"
                                : "bg-emerald-950/40 text-emerald-300 border-emerald-500/30 hover:bg-emerald-950/70"
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
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#181b25] border border-[#232b42] rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-indigo-400">person_add</span>
              Registrar Nuevo Personal
            </h3>
            <p className="text-xs text-slate-400">
              Ingresá el nombre del mozo y asignale un PIN numérico de 4 dígitos.
            </p>

            <form onSubmit={handleCreate} className="space-y-3 pt-2">
              <div>
                <label className="font-mono text-[10px] text-slate-400 uppercase tracking-wider block mb-1">
                  Nombre
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ej: Facundo (Barra)"
                  className="w-full h-10 px-3 rounded-lg bg-[#0a0e17] border border-[#232b42] text-white text-xs font-mono focus:outline-none focus:border-indigo-400"
                />
              </div>

              <div>
                <label className="font-mono text-[10px] text-slate-400 uppercase tracking-wider block mb-1">
                  PIN numérico (4 dígitos)
                </label>
                <input
                  type="password"
                  required
                  maxLength={4}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="••••"
                  className="w-full h-10 px-3 rounded-lg bg-[#0a0e17] border border-[#232b42] text-white text-lg font-mono tracking-widest text-center focus:outline-none focus:border-indigo-400"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="px-4 py-2 rounded-lg border border-[#232b42] text-slate-400 hover:text-white font-mono text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating || newPin.length !== 4 || !newName.trim()}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-bold transition-all disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#181b25] border border-[#232b42] rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-indigo-400">key</span>
              Resetear PIN
            </h3>
            <p className="text-xs text-slate-400">
              Asigná un nuevo PIN de 4 dígitos para este miembro del personal.
            </p>

            <form onSubmit={handleResetPin} className="space-y-3 pt-2">
              <div>
                <label className="font-mono text-[10px] text-slate-400 uppercase tracking-wider block mb-1">
                  Nuevo PIN (4 dígitos)
                </label>
                <input
                  type="password"
                  required
                  maxLength={4}
                  value={resetPinValue}
                  onChange={(e) => setResetPinValue(e.target.value.replace(/\D/g, ""))}
                  placeholder="••••"
                  className="w-full h-10 px-3 rounded-lg bg-[#0a0e17] border border-[#232b42] text-white text-lg font-mono tracking-widest text-center focus:outline-none focus:border-indigo-400"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setResetId(null)}
                  className="px-4 py-2 rounded-lg border border-[#232b42] text-slate-400 hover:text-white font-mono text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={resetting || resetPinValue.length !== 4}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-bold transition-all disabled:opacity-50"
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
