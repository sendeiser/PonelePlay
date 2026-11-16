import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Copy,
  History,
  ListMusic,
  Music,
  QrCode,
  Search,
  Settings,
  Tv,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { HostSettingsModal, SearchSongModal, ShareQrModal } from '../components/Modals';
import { NowPlayingHero } from '../components/NowPlayingHero';
import { QueueItemCard } from '../components/QueueItemCard';
import { usePartyPreview } from '../context/PartyPreviewContext';
import { formatDurationMs } from '../data/mockPartyData';

type RoomTab = 'queue' | 'played' | 'participants';

export const LiveRoomPage: React.FC = () => {
  const { code = 'PLAY42' } = useParams();
  const navigate = useNavigate();
  const {
    demoRole,
    setDemoRole,
    queueEmptyPreview,
    setQueueEmptyPreview,
    room,
    queue,
    played,
    participants,
    cooldownRemaining,
    voteItem,
    togglePinItem,
    playNowItem,
    blockItem,
    toggleBanParticipant,
  } = usePartyPreview();

  const [activeTab, setActiveTab] = useState<RoomTab>('queue');
  const [searchOpen, setSearchOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const isHost = demoRole === 'host';
  const myPendingCount = queue.filter((q) => q.proposedById === 'u-guest-you').length;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code.toUpperCase());
    } catch {
      // ignore clipboard restrictions in headless contexts
    }
    toast.success(`Código ${code.toUpperCase()} copiado`);
  };

  return (
    <main className="mx-auto max-w-6xl space-y-5 px-3 py-4 sm:px-6 sm:py-6">
      {/* Barra de conmutación de vista previa (Rol & Estado de Cola) */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-stroke bg-card/80 px-3 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[11px] font-semibold uppercase text-muted">
            Vista Previa:
          </span>
          <button
            type="button"
            onClick={() => setDemoRole('host')}
            className={`min-h-[44px] rounded-xl px-3 font-semibold transition-colors ${
              isHost ? 'bg-neon text-on-neon' : 'bg-elevated text-muted hover:text-ink'
            }`}
          >
            Anfitrión (Host)
          </button>
          <button
            type="button"
            onClick={() => setDemoRole('guest')}
            className={`min-h-[44px] rounded-xl px-3 font-semibold transition-colors ${
              !isHost ? 'bg-brand text-white' : 'bg-elevated text-muted hover:text-ink'
            }`}
          >
            Invitado (Guest)
          </button>
        </div>

        <button
          type="button"
          onClick={() => setQueueEmptyPreview(!queueEmptyPreview)}
          className={`min-h-[44px] rounded-xl border px-3 font-semibold transition-colors ${
            queueEmptyPreview
              ? 'border-amber/60 bg-amber/15 text-amber'
              : 'border-stroke bg-elevated text-muted hover:text-ink'
          }`}
        >
          {queueEmptyPreview ? 'Ver Cola con Temas' : 'Simular Cola Vacía (Autoplay)'}
        </button>
      </div>

      {/* Top Bar de Sala */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stroke bg-card p-3 sm:px-5 sm:py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <Link
            to="/"
            aria-label="Volver al inicio"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-stroke bg-elevated text-ink hover:border-brand"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate font-display text-lg text-ink sm:text-xl">{room.name}</h1>
              <button
                type="button"
                onClick={copyCode}
                className="inline-flex min-h-[44px] min-w-[44px] items-center gap-1 rounded-lg border border-neon/40 bg-neon/10 px-2.5 py-1 font-mono text-xs font-bold text-neon"
                title="Copiar código de sala"
              >
                <span>{code.toUpperCase()}</span>
                <Copy className="h-3 w-3" />
              </button>
            </div>
            <p className="text-xs text-muted">
              Salida: <strong className="text-ink">{room.audioOutput === 'tv' ? 'Smart TV App' : 'Dispositivo Host'}</strong> · {participants.filter((p) => !p.isBanned).length} en la fiesta
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setQrOpen(true)}
            className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-stroke bg-elevated px-3 text-xs font-semibold text-ink hover:border-neon"
          >
            <QrCode className="h-4 w-4 text-neon" />
            <span>QR</span>
          </button>

          <button
            type="button"
            onClick={() => navigate(`/room/${code.toUpperCase()}/tv`)}
            aria-label="Modo TV"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-xl border border-stroke bg-elevated px-3 text-xs font-semibold text-ink hover:border-brand"
          >
            <Tv className="h-4 w-4 text-brand" />
            <span className="hidden sm:inline">Modo TV</span>
          </button>

          {isHost && (
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="Ajustes de sala del Anfitrión"
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-stroke bg-elevated text-ink hover:border-brand"
            >
              <Settings className="h-5 w-5" />
            </button>
          )}
        </div>
      </section>

      {/* Layout responsive Desktop (2 columnas) / Mobile (1 columna) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Columna Izquierda: Sonando Ahora */}
        <div className="min-w-0 lg:col-span-5">
          <NowPlayingHero />
        </div>

        {/* Columna Derecha: Buscador + Tabs + Cola en Vivo */}
        <div className="min-w-0 space-y-4 lg:col-span-7">
          {/* Barra Sticky de Búsqueda + Cupo */}
          <div className="flex min-w-0 flex-wrap items-center gap-2 overflow-hidden rounded-2xl border border-stroke bg-card p-2.5 sm:flex-nowrap">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="flex min-h-[44px] w-full min-w-0 flex-1 items-center gap-2.5 overflow-hidden rounded-xl border border-stroke bg-elevated px-3.5 text-left text-sm text-muted transition-colors hover:border-neon/60 hover:text-ink"
            >
              <Search className="h-4 w-4 shrink-0 text-neon" />
              <span className="min-w-0 truncate">Buscar canción o pegar link de YouTube / Spotify...</span>
            </button>

            <div className="flex shrink-0 items-center gap-2">
              <span className="rounded-xl border border-neon/30 bg-neon/10 px-3 py-2 font-mono text-xs font-semibold tabular-nums-mono text-neon">
                {isHost ? 'HOST ∞' : `${myPendingCount}/${room.maxPendingPerUser} cupo`}
              </span>
              {cooldownRemaining > 0 && (
                <span className="rounded-xl bg-amber/20 px-2.5 py-2 font-mono text-xs font-bold tabular-nums-mono text-amber">
                  {cooldownRemaining}s
                </span>
              )}
            </div>
          </div>

          {/* Navegación de Tabs */}
          <div
            role="tablist"
            aria-label="Secciones de la sala"
            className="grid grid-cols-3 gap-1.5 rounded-2xl border border-stroke bg-card p-1.5"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'queue'}
              onClick={() => setActiveTab('queue')}
              className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-semibold transition-colors sm:text-sm ${
                activeTab === 'queue'
                  ? 'bg-brand text-white shadow-neon-indigo'
                  : 'text-muted hover:text-ink'
              }`}
            >
              <ListMusic className="h-4 w-4 shrink-0" />
              <span className="truncate">Cola ({queue.length})</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'played'}
              onClick={() => setActiveTab('played')}
              className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-semibold transition-colors sm:text-sm ${
                activeTab === 'played'
                  ? 'bg-brand text-white shadow-neon-indigo'
                  : 'text-muted hover:text-ink'
              }`}
            >
              <History className="h-4 w-4 shrink-0" />
              <span className="truncate">Sonaron ({played.length})</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'participants'}
              onClick={() => setActiveTab('participants')}
              className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-semibold transition-colors sm:text-sm ${
                activeTab === 'participants'
                  ? 'bg-brand text-white shadow-neon-indigo'
                  : 'text-muted hover:text-ink'
              }`}
            >
              <Users className="h-4 w-4 shrink-0" />
              <span className="truncate">Gente ({participants.length})</span>
            </button>
          </div>

          {/* Panel Tab 1: Cola en Vivo */}
          {activeTab === 'queue' && (
            <div role="tabpanel" className="space-y-3">
              {queue.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-stroke bg-card p-8 text-center">
                  <Music className="mx-auto h-10 w-10 text-neon" />
                  <h2 className="mt-3 font-display text-xl text-ink">La cola está vacía</h2>
                  <p className="mx-auto mt-1 max-w-md text-sm text-muted">
                    El <strong className="text-ink">Autoplay de respaldo</strong> mantiene la música sonando. ¡Busca el próximo tema y sé el primero en ponerle ritmo!
                  </p>
                  <button
                    type="button"
                    onClick={() => setSearchOpen(true)}
                    className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-neon px-5 text-sm font-bold text-on-neon shadow-neon-green"
                  >
                    <Search className="h-4 w-4" />
                    <span>Proponer Primer Tema</span>
                  </button>
                </div>
              ) : (
                queue.map((item, idx) => (
                  <QueueItemCard
                    key={item.id}
                    item={item}
                    rank={idx + 1}
                    isHost={isHost}
                    onVote={voteItem}
                    onTogglePin={togglePinItem}
                    onPlayNow={playNowItem}
                    onBlock={blockItem}
                  />
                ))
              )}
            </div>
          )}

          {/* Panel Tab 2: Ya Sonaron */}
          {activeTab === 'played' && (
            <div role="tabpanel" className="space-y-2.5">
              {played.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-stroke bg-card p-3 sm:p-4"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <img
                      src={item.song.imageUrl}
                      alt={item.song.title}
                      className="h-12 w-12 shrink-0 rounded-xl border border-stroke object-cover"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{item.song.title}</p>
                      <p className="truncate text-xs text-muted">
                        {item.song.artist} · {item.proposedByAvatar} @{item.proposedByName}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="inline-flex items-center rounded-lg bg-neon/15 px-2.5 py-1 font-mono text-xs font-bold text-neon">
                      +{item.netScore}
                    </span>
                    <p className="mt-1 font-mono text-[10px] text-muted">
                      {formatDurationMs(item.song.durationMs)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Panel Tab 3: Participantes */}
          {activeTab === 'participants' && (
            <div role="tabpanel" className="space-y-2.5">
              {participants.map((p) => (
                <div
                  key={p.id}
                  className={`flex items-center justify-between gap-3 rounded-2xl border p-3.5 ${
                    p.isBanned ? 'border-danger/40 bg-danger/5 opacity-75' : 'border-stroke bg-card'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-stroke bg-elevated text-xl">
                      {p.avatarEmoji}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-sm font-semibold text-ink">@{p.displayName}</p>
                        {p.role === 'host' && (
                          <span className="rounded-full bg-neon/15 px-2 py-0.5 text-[10px] font-bold uppercase text-neon">
                            Anfitrión
                          </span>
                        )}
                        {p.isLinkedAccount && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-brand">
                            <CheckCircle2 className="h-3 w-3" /> Verificado
                          </span>
                        )}
                        {p.isBanned && (
                          <span className="rounded-full bg-danger/20 px-2 py-0.5 text-[10px] font-bold text-danger">
                            Expulsado
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted">
                        <strong className="font-mono text-ink">{p.djPoints}</strong> pts de DJ en la fiesta
                      </p>
                    </div>
                  </div>

                  {isHost && p.role !== 'host' && (
                    <button
                      type="button"
                      onClick={() => toggleBanParticipant(p.id)}
                      className={`flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold ${
                        p.isBanned
                          ? 'border-neon/50 bg-neon/10 text-neon'
                          : 'border-danger/40 bg-danger/10 text-danger hover:bg-danger hover:text-white'
                      }`}
                    >
                      <Ban className="h-3.5 w-3.5" />
                      <span>{p.isBanned ? 'Readmitir' : 'Expulsar'}</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modales */}
      <SearchSongModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <ShareQrModal open={qrOpen} onClose={() => setQrOpen(false)} />
      <HostSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </main>
  );
};
