import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  ChevronUp,
  DoorOpen,
  Music2,
  PlusCircle,
  Radio,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Tv,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { usePartyPreview } from '../context/PartyPreviewContext';
import { FALLBACK_GENRES, RECENT_ROOMS_MOCK } from '../data/mockPartyData';
import { AudioProvider } from '../types/jukebox';

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { updateRoom, setDemoRole } = usePartyPreview();

  const [roomName, setRoomName] = useState('Previa en lo de Tincho');
  const [provider, setProvider] = useState<AudioProvider>('youtube_music');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [maxPending, setMaxPending] = useState(5);
  const [cooldown, setCooldown] = useState(10);
  const [fallbackGenre, setFallbackGenre] = useState('party_hits');
  const [joinCode, setJoinCode] = useState('PLAY42');

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomName.trim().length < 2) {
      toast.error('Ingresa un nombre de sala válido (mínimo 2 caracteres)');
      return;
    }
    updateRoom({
      name: roomName.trim(),
      activeProvider: provider,
      maxPendingPerUser: maxPending,
      cooldownSeconds: cooldown,
      fallbackGenre,
      isActive: true,
    });
    setDemoRole('host');
    toast.success('Sala creada y lista para compartir');
    navigate('/room/PLAY42');
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = joinCode.trim().toUpperCase();
    if (cleaned.length < 4) {
      toast.error('Ingresa un código de sala válido');
      return;
    }
    navigate(`/join/${cleaned}`);
  };

  return (
    <main className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 sm:py-10">
      {/* Hero Banner */}
      <section className="relative overflow-hidden rounded-3xl border border-stroke bg-card p-6 sm:p-10">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand/25 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 left-12 h-64 w-64 rounded-full bg-neon/10 blur-3xl"
        />

        <div className="relative z-10 max-w-3xl space-y-4">
          <div className="inline-flex flex-wrap items-center gap-2 rounded-2xl border border-neon/40 bg-neon/10 px-3 py-1.5 text-xs font-semibold text-neon sm:rounded-full">
            <Sparkles className="h-3.5 w-3.5" />
            <span>YouTube Music Sin Premium · Spotify Opcional · Smart TV Nativa</span>
          </div>

          <h1 className="font-display text-3xl leading-tight text-ink sm:text-5xl">
            Tu fiesta, tus reglas. <span className="text-neon">Todos eligen</span> el próximo tema en vivo.
          </h1>

          <p className="text-sm leading-relaxed text-muted sm:text-base">
            Crea una sala en segundos, comparte el código QR en tu celular o en la App nativa de Smart TV y deja que tus invitados propongan y voten canciones sin instalar nada.
          </p>

          <div className="flex flex-wrap gap-2 pt-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-stroke bg-elevated px-3 py-1.5 font-medium text-ink">
              <Smartphone className="h-3.5 w-3.5 text-neon" /> PWA Instalable + APK Mobile
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-stroke bg-elevated px-3 py-1.5 font-medium text-ink">
              <Tv className="h-3.5 w-3.5 text-brand" /> Android TV D-Pad Nativo
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-stroke bg-elevated px-3 py-1.5 font-medium text-ink">
              <ShieldCheck className="h-3.5 w-3.5 text-amber" /> 1 Voto Único por Canción
            </span>
          </div>
        </div>
      </section>

      {/* Tarjetas Duales: Crear Sala vs Unirse */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Tarjeta A: Crear Sala */}
        <form
          onSubmit={handleCreateRoom}
          className="flex flex-col justify-between rounded-3xl border border-stroke bg-card p-6 shadow-lg"
        >
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="font-mono text-xs font-semibold uppercase tracking-widest text-neon">
                  Para Anfitriones
                </span>
                <h2 className="mt-1 font-display text-2xl text-ink">Crear Sala como Anfitrión</h2>
              </div>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-neon/15 text-neon">
                <PlusCircle className="h-6 w-6" />
              </span>
            </div>

            <div>
              <label htmlFor="room-name" className="mb-1.5 block text-xs font-semibold text-ink">
                Nombre de la Fiesta o Sala
              </label>
              <input
                id="room-name"
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="Ej: Cumple de Tincho"
                className="min-h-[44px] w-full rounded-xl border border-stroke bg-elevated px-3.5 text-sm text-ink placeholder:text-muted focus:border-brand"
              />
            </div>

            <div>
              <span className="mb-2 block text-xs font-semibold text-ink">Motor de Música</span>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setProvider('youtube_music')}
                  className={`flex min-h-[60px] items-start gap-2.5 rounded-2xl border p-3 text-left transition-all ${
                    provider === 'youtube_music'
                      ? 'border-ytm bg-ytm/10 shadow-neon-ytm'
                      : 'border-stroke bg-elevated hover:border-brand/60'
                  }`}
                >
                  <Music2 className="mt-0.5 h-5 w-5 shrink-0 text-ytm" />
                  <div>
                    <p className="text-xs font-bold text-ink">YouTube Music Audio</p>
                    <p className="text-[11px] text-muted">100% gratis · Sin Premium</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setProvider('spotify')}
                  className={`flex min-h-[60px] items-start gap-2.5 rounded-2xl border p-3 text-left transition-all ${
                    provider === 'spotify'
                      ? 'border-neon bg-neon/10 shadow-neon-green'
                      : 'border-stroke bg-elevated hover:border-brand/60'
                  }`}
                >
                  <Radio className="mt-0.5 h-5 w-5 shrink-0 text-neon" />
                  <div>
                    <p className="text-xs font-bold text-ink">Spotify Premium</p>
                    <p className="text-[11px] text-muted">Web Player & Connect</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Acordeón Opciones Avanzadas */}
            <div className="rounded-2xl border border-stroke bg-elevated/70">
              <button
                type="button"
                onClick={() => setAdvancedOpen((o) => !o)}
                className="flex min-h-[44px] w-full items-center justify-between px-4 text-xs font-semibold text-ink"
              >
                <span>Opciones avanzadas (Anti-spam & Autoplay)</span>
                {advancedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>

              {advancedOpen && (
                <div className="grid grid-cols-1 gap-3 border-t border-stroke p-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="landing-max-pending" className="mb-1 block text-[11px] text-muted">
                      Máx. pendientes / persona
                    </label>
                    <input
                      id="landing-max-pending"
                      type="number"
                      min={1}
                      max={20}
                      value={maxPending}
                      onChange={(e) => setMaxPending(Number(e.target.value))}
                      className="min-h-[44px] w-full rounded-xl border border-stroke bg-card px-3 font-mono text-sm text-ink"
                    />
                  </div>
                  <div>
                    <label htmlFor="landing-cooldown" className="mb-1 block text-[11px] text-muted">
                      Cooldown (segundos)
                    </label>
                    <input
                      id="landing-cooldown"
                      type="number"
                      min={0}
                      max={300}
                      value={cooldown}
                      onChange={(e) => setCooldown(Number(e.target.value))}
                      className="min-h-[44px] w-full rounded-xl border border-stroke bg-card px-3 font-mono text-sm text-ink"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="landing-fallback" className="mb-1 block text-[11px] text-muted">
                      Respaldo Autoplay si la cola queda vacía
                    </label>
                    <select
                      id="landing-fallback"
                      value={fallbackGenre}
                      onChange={(e) => setFallbackGenre(e.target.value)}
                      className="min-h-[44px] w-full rounded-xl border border-stroke bg-card px-3 text-xs text-ink"
                    >
                      {FALLBACK_GENRES.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>

          <button
            type="submit"
            className="mt-6 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-neon px-5 text-sm font-bold text-on-neon shadow-neon-green transition-transform hover:opacity-95 active:scale-[0.99]"
          >
            <PlusCircle className="h-5 w-5" />
            <span>Crear Sala y Empezar</span>
          </button>
        </form>

        {/* Tarjeta B: Unirse a una Sala */}
        <form
          onSubmit={handleJoinSubmit}
          className="flex flex-col justify-between rounded-3xl border border-stroke bg-card p-6 shadow-lg"
        >
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="font-mono text-xs font-semibold uppercase tracking-widest text-brand">
                  Para Invitados
                </span>
                <h2 className="mt-1 font-display text-2xl text-ink">Unirse a una Sala</h2>
              </div>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand/20 text-brand">
                <DoorOpen className="h-6 w-6" />
              </span>
            </div>

            <p className="text-sm text-muted">
              No necesitas cuenta paga ni descargar nada. Pide el código de 6 letras o escanea el QR de la fiesta.
            </p>

            <div>
              <label htmlFor="join-code-input" className="mb-1.5 block text-xs font-semibold text-ink">
                Código de Sala
              </label>
              <input
                id="join-code-input"
                type="text"
                maxLength={8}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="PLAY42"
                className="min-h-[56px] w-full rounded-2xl border border-stroke bg-elevated px-4 text-center font-display text-2xl uppercase tracking-[0.25em] text-neon placeholder:text-muted/50 focus:border-neon"
              />
            </div>

            <div className="rounded-2xl border border-stroke bg-elevated/60 p-4 text-xs text-muted">
              <p className="font-semibold text-ink">¿Tienes Android Smart TV en casa?</p>
              <p className="mt-1">
                Abre la app nativa <strong className="text-ink">PonelePlay TV</strong> en tu televisor, vincula este mismo código y usa la TV como parlante principal o pantalla visual gigante.
              </p>
            </div>
          </div>

          <button
            type="submit"
            className="mt-6 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-brand px-5 text-sm font-bold text-white shadow-neon-indigo transition-transform hover:opacity-95 active:scale-[0.99]"
          >
            <DoorOpen className="h-5 w-5" />
            <span>Entrar a la Sala</span>
          </button>
        </form>
      </section>

      {/* Sección Mis Salas Recientes */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl text-ink">Mis Salas Recientes</h2>
          <span className="font-mono text-xs text-muted">Historial sincronizado</span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {RECENT_ROOMS_MOCK.map((r) => (
            <div
              key={r.code}
              className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-stroke bg-card p-4 transition-colors hover:border-brand/70"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-neon">{r.code}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      r.isActive
                        ? 'bg-neon/15 text-neon'
                        : 'bg-elevated text-muted'
                    }`}
                  >
                    {r.isActive ? 'En vivo' : 'Finalizada'}
                  </span>
                </div>
                <h3 className="truncate font-semibold text-ink">{r.name}</h3>
                <p className="flex items-center gap-3 text-xs text-muted">
                  <span>Host: {r.hostName}</span>
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" /> {r.participantsCount}
                  </span>
                  <span>{r.songsPlayed} temas</span>
                </p>
              </div>

              <button
                type="button"
                onClick={() => navigate(r.isActive ? `/room/${r.code}` : `/room/${r.code}/summary`)}
                className="min-h-[44px] rounded-xl border border-stroke bg-elevated px-4 text-xs font-semibold text-ink hover:border-neon hover:text-neon"
              >
                {r.isActive ? 'Volver a la Sala' : 'Ver Resumen'}
              </button>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
};
