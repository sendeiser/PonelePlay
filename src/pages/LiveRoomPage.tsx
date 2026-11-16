import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
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
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const {
    demoRole,
    setDemoRole,
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

  // Soporte silencioso por URL para pruebas E2E sin barras artificiales en la UI
  useEffect(() => {
    const roleParam = searchParams.get('role');
    if (roleParam === 'guest' || roleParam === 'host') {
      setDemoRole(roleParam);
    }
    const emptyParam = searchParams.get('empty');
    setQueueEmptyPreview(emptyParam === '1');
  }, [searchParams, setDemoRole, setQueueEmptyPreview]);

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
    <main className="mx-auto max-w-4xl space-y-4 px-3 py-4 sm:px-6 sm:py-6">
      {/* Top Bar minimalista de Sala */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stroke bg-card p-3 sm:px-5 sm:py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <Link
            to="/"
            aria-label="Volver al inicio"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-stroke bg-elevated text-ink hover:border-brand"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate font-display text-lg font-bold text-ink sm:text-xl">{room.name}</h1>
              <button
                type="button"
                onClick={copyCode}
                className="inline-flex min-h-[44px] min-w-[44px] items-center gap-1.5 rounded-full border border-stroke bg-elevated px-3 py-1 font-mono text-xs font-bold text-brand hover:border-brand"
                title="Copiar código de sala"
              >
                <span>{code.toUpperCase()}</span>
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="text-xs text-muted">
              Audio: <strong className="text-ink">{room.audioOutput === 'tv' ? 'Smart TV' : 'Dispositivo Host'}</strong> · {participants.filter((p) => !p.isBanned).length} en la fiesta
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setQrOpen(true)}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-full border border-stroke bg-elevated px-3.5 text-xs font-semibold text-ink hover:border-brand"
          >
            <QrCode className="h-4 w-4 text-brand" />
            <span>QR</span>
          </button>

          <button
            type="button"
            onClick={() => navigate(`/room/${code.toUpperCase()}/tv`)}
            aria-label="Modo TV"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-full border border-stroke bg-elevated px-3.5 text-xs font-semibold text-ink hover:border-brand"
          >
            <Tv className="h-4 w-4 text-ink" />
            <span className="hidden sm:inline">Modo TV</span>
          </button>

          {isHost && (
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="Ajustes de sala del Anfitrión"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-stroke bg-elevated text-ink hover:border-brand"
            >
              <Settings className="h-5 w-5" />
            </button>
          )}
        </div>
      </section>

      {/* Reproductor Compacto y Elegante */}
      <NowPlayingHero />

      {/* Buscador + Cupo */}
      <div className="flex min-w-0 flex-wrap items-center gap-2 overflow-hidden rounded-2xl border border-stroke bg-card p-2.5 sm:flex-nowrap">
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="flex min-h-[44px] w-full min-w-0 flex-1 items-center gap-2.5 overflow-hidden rounded-xl border border-stroke bg-elevated px-3.5 text-left text-sm text-muted transition-colors hover:border-brand/60 hover:text-ink"
        >
          <Search className="h-4 w-4 shrink-0 text-brand" />
          <span className="min-w-0 truncate">Buscar canción o pegar link de YouTube / Spotify...</span>
        </button>

        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-xl bg-brand-soft px-3 py-2 font-mono text-xs font-semibold tabular-nums-mono text-brand">
            {isHost ? 'HOST ∞' : `${myPendingCount}/${room.maxPendingPerUser} cupo`}
          </span>
          {cooldownRemaining > 0 && (
            <span className="rounded-xl bg-amber/15 px-2.5 py-2 font-mono text-xs font-bold tabular-nums-mono text-amber">
              {cooldownRemaining}s
            </span>
          )}
        </div>
      </div>

      {/* Tabs de Cola / Historial / Participantes */}
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
              ? 'bg-brand text-on-brand'
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
              ? 'bg-brand text-on-brand'
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
              ? 'bg-brand text-on-brand'
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
              <Music className="mx-auto h-10 w-10 text-brand" />
              <h2 className="mt-3 font-display text-xl font-bold text-ink">La cola está vacía</h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted">
                El <strong className="text-ink">Autoplay de respaldo</strong> mantiene la música sonando. ¡Busca el próximo tema y sé el primero en ponerle ritmo!
              </p>
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-brand px-5 text-sm font-semibold text-on-brand"
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
                <span className="inline-flex items-center rounded-lg bg-brand-soft px-2.5 py-1 font-mono text-xs font-bold text-brand">
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
                      <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-bold uppercase text-brand">
                        Anfitrión
                      </span>
                    )}
                    {p.isLinkedAccount && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-muted">
                        <CheckCircle2 className="h-3 w-3 text-brand" /> Verificado
                      </span>
                    )}
                    {p.isBanned && (
                      <span className="rounded-full bg-danger/15 px-2 py-0.5 text-[10px] font-bold text-danger">
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
                  className={`flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold ${
                    p.isBanned
                      ? 'border-brand/50 bg-brand-soft text-brand'
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

      {/* Modales */}
      <SearchSongModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <ShareQrModal open={qrOpen} onClose={() => setQrOpen(false)} />
      <HostSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </main>
  );
};
