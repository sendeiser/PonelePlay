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
  Tv,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { usePartyPreview } from '../context/PartyPreviewContext';
import { PonelePlayLogo } from '../components/PonelePlayLogo';
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
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-6 sm:px-6 sm:py-10">
      {/* Hero Banner Minimalista */}
      <section className="rounded-3xl border border-stroke bg-card p-6 shadow-surface sm:p-10">
        <div className="max-w-3xl space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <PonelePlayLogo size="md" showWordmark={false} />
            <p className="font-mono text-xs font-semibold uppercase tracking-widest text-coral">
              YouTube Music Sin Premium · Spotify Opcional · Smart TV
            </p>
          </div>

          <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight text-ink sm:text-5xl">
            Tu fiesta, tus reglas. <span className="text-coral">Todos eligen</span> el próximo tema.
          </h1>

          <p className="text-sm leading-relaxed text-muted sm:text-base">
            Crea una sala en segundos, proyecta el código QR en tu Smart TV o compártelo por link y deja que tus invitados propongan y voten canciones sin instalar nada.
          </p>

          <div className="flex flex-wrap gap-2 pt-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-stroke bg-elevated px-3 py-1.5 font-medium text-ink">
              <Smartphone className="h-3.5 w-3.5 text-brand" /> PWA Instalable + Mobile
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-stroke bg-elevated px-3 py-1.5 font-medium text-ink">
              <Tv className="h-3.5 w-3.5 text-brand" /> App Android TV Nativa
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-stroke bg-elevated px-3 py-1.5 font-medium text-ink">
              <ShieldCheck className="h-3.5 w-3.5 text-brand" /> 1 Voto Único por Canción
            </span>
          </div>
        </div>
      </section>

      {/* Tarjetas Duales: Crear Sala vs Unirse */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Tarjeta A: Crear Sala */}
        <form
          onSubmit={handleCreateRoom}
          className="flex flex-col justify-between rounded-3xl border border-stroke bg-card p-6 shadow-surface"
        >
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-xs font-semibold uppercase tracking-widest text-brand">
                  Para Anfitriones
                </p>
                <h2 className="mt-1 font-display text-2xl font-bold text-ink">Crear Sala</h2>
              </div>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand">
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
                  className={`flex min-h-[60px] items-start gap-2.5 rounded-2xl border p-3 text-left transition-colors ${
                    provider === 'youtube_music'
                      ? 'border-brand bg-brand-soft'
                      : 'border-stroke bg-elevated hover:border-muted'
                  }`}
                >
                  <Music2 className={`mt-0.5 h-5 w-5 shrink-0 ${provider === 'youtube_music' ? 'text-brand' : 'text-muted'}`} />
                  <div>
                    <p className="text-xs font-bold text-ink">YouTube Music Audio</p>
                    <p className="text-[11px] text-muted">100% gratis · Sin Premium</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setProvider('spotify')}
                  className={`flex min-h-[60px] items-start gap-2.5 rounded-2xl border p-3 text-left transition-colors ${
                    provider === 'spotify'
                      ? 'border-brand bg-brand-soft'
                      : 'border-stroke bg-elevated hover:border-muted'
                  }`}
                >
                  <Radio className={`mt-0.5 h-5 w-5 shrink-0 ${provider === 'spotify' ? 'text-brand' : 'text-muted'}`} />
                  <div>
                    <p className="text-xs font-bold text-ink">Spotify Premium</p>
                    <p className="text-[11px] text-muted">Web Player & Connect</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Acordeón Opciones Avanzadas */}
            <div className="rounded-2xl border border-stroke bg-elevated/60">
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
            className="mt-6 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-brand px-5 text-sm font-semibold text-on-brand shadow-surface transition-opacity hover:opacity-95 active:scale-[0.99]"
          >
            <PlusCircle className="h-5 w-5" />
            <span>Crear Sala y Empezar</span>
          </button>
        </form>

        {/* Tarjeta B: Unirse a una Sala */}
        <form
          onSubmit={handleJoinSubmit}
          className="flex flex-col justify-between rounded-3xl border border-stroke bg-card p-6 shadow-surface"
        >
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-xs font-semibold uppercase tracking-widest text-muted">
                  Para Invitados
                </p>
                <h2 className="mt-1 font-display text-2xl font-bold text-ink">Unirse a una Sala</h2>
              </div>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-elevated text-ink">
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
                className="min-h-[56px] w-full rounded-2xl border border-stroke bg-elevated px-4 text-center font-display text-2xl font-bold uppercase tracking-[0.25em] text-ink placeholder:text-muted/50 focus:border-brand"
              />
            </div>

            <div className="rounded-2xl border border-stroke bg-elevated/60 p-4 text-xs text-muted">
              <p className="font-semibold text-ink">¿Tienes Android Smart TV en casa?</p>
              <p className="mt-1">
                Abre la app <strong className="text-ink">PonelePlay TV</strong> en tu televisor, vincula este código y usa el TV como parlante principal o pantalla visual.
              </p>
            </div>
          </div>

          <button
            type="submit"
            className="mt-6 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full border border-stroke bg-elevated px-5 text-sm font-semibold text-ink transition-colors hover:border-brand hover:text-brand active:scale-[0.99]"
          >
            <DoorOpen className="h-5 w-5" />
            <span>Entrar a la Sala</span>
          </button>
        </form>
      </section>

      {/* Sección Mis Salas Recientes */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl font-bold text-ink">Mis Salas Recientes</h2>
          <span className="font-mono text-xs text-muted">Historial sincronizado</span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {RECENT_ROOMS_MOCK.map((r) => (
            <div
              key={r.code}
              className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-stroke bg-card p-4 transition-colors hover:bg-elevated/40"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-brand">{r.code}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      r.isActive
                        ? 'bg-coral-soft text-coral'
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
                className="min-h-[44px] rounded-full border border-stroke bg-elevated px-4 text-xs font-semibold text-ink hover:border-brand hover:text-brand"
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
