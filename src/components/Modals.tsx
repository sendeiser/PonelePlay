import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Ban,
  Check,
  Copy,
  Link2,
  Plus,
  Search,
  Share2,
  Sparkles,
  ThumbsUp,
  X,
  Music,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { usePartyPreview } from '../context/PartyPreviewContext';
import { FALLBACK_GENRES, SEARCH_CATALOG_MOCK, formatDurationMs } from '../data/mockPartyData';

interface ModalProps {
  open: boolean;
  onClose: () => void;
}

export const SearchSongModal: React.FC<ModalProps> = ({ open, onClose }) => {
  const { queue, nowPlaying, blockedSongIds, proposeSong, cooldownRemaining } = usePartyPreview();
  const [query, setQuery] = useState('');

  if (!open) return null;

  const filtered = SEARCH_CATALOG_MOCK.filter((song) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      song.title.toLowerCase().includes(q) ||
      song.artist.toLowerCase().includes(q) ||
      q.includes('youtu') ||
      q.includes('spotify')
    );
  });

  const getSongStatus = (songId: string) => {
    if (blockedSongIds.includes(songId)) return 'blocked';
    if (nowPlaying?.song.id === songId) return 'playing';
    if (queue.some((item) => item.song.id === songId)) return 'in_queue';
    return 'available';
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Buscar y proponer canción"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4"
    >
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border border-stroke bg-card shadow-elevated sm:rounded-3xl">
        <div className="flex items-center justify-between gap-3 border-b border-stroke px-4 py-3.5 sm:px-6">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-bold text-ink">Agregar Canción</h2>
            <p className="text-xs text-muted">
              Busca por nombre o pega un enlace de YouTube / Spotify
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar buscador"
            className="flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full border border-stroke bg-elevated text-muted hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 p-4 sm:p-6">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ej: Duki, María Becerra o pegá un link..."
              className="min-h-[44px] w-full rounded-xl border border-stroke bg-elevated pl-10 pr-10 text-sm text-ink placeholder:text-muted focus:border-brand"
              autoFocus
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Limpiar búsqueda"
                className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {cooldownRemaining > 0 && (
            <div className="rounded-xl border border-amber/40 bg-amber/10 px-3 py-2 text-xs font-medium text-amber">
              Espera <span className="tabular-nums-mono font-bold">{cooldownRemaining}s</span> para proponer otro tema nuevo.
            </div>
          )}

          <div className="max-h-[55vh] space-y-2.5 overflow-y-auto pr-1">
            {filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stroke py-10 text-center">
                <Music className="mx-auto h-8 w-8 text-muted" />
                <p className="mt-2 text-sm font-medium text-ink">Sin resultados para "{query}"</p>
                <p className="text-xs text-muted">Prueba otro artista o pega el enlace directo.</p>
              </div>
            ) : (
              filtered.map((song) => {
                const status = getSongStatus(song.id);
                return (
                  <div
                    key={song.id}
                    className="flex flex-col gap-2.5 rounded-2xl border border-stroke bg-elevated p-3 sm:flex-row sm:items-center sm:gap-3"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <img
                        src={song.imageUrl}
                        alt={song.title}
                        className="h-12 w-12 shrink-0 rounded-xl border border-stroke object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">{song.title}</p>
                        <p className="truncate text-xs text-muted">
                          {song.artist} · <span className="tabular-nums-mono">{formatDurationMs(song.durationMs)}</span>
                        </p>
                      </div>
                    </div>

                    {status === 'available' && (
                      <button
                        type="button"
                        disabled={cooldownRemaining > 0}
                        onClick={() => proposeSong(song)}
                        className="flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-full bg-brand px-4 text-xs font-semibold text-on-brand disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Plus className="h-4 w-4" />
                        <span>Proponer</span>
                      </button>
                    )}

                    {status === 'in_queue' && (
                      <button
                        type="button"
                        onClick={() => proposeSong(song)}
                        className="flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-full border border-brand/50 bg-brand-soft px-4 text-xs font-semibold text-brand"
                      >
                        <ThumbsUp className="h-4 w-4" />
                        <span>+1 Voto (En cola)</span>
                      </button>
                    )}

                    {status === 'playing' && (
                      <span className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-full border border-stroke bg-card px-4 text-xs font-medium text-muted">
                        Sonando ahora
                      </span>
                    )}

                    {status === 'blocked' && (
                      <span className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1 rounded-full border border-danger/40 bg-danger/10 px-4 text-xs font-medium text-danger">
                        <Ban className="h-3.5 w-3.5" />
                        <span>Bloqueada</span>
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const ShareQrModal: React.FC<ModalProps> = ({ open, onClose }) => {
  const { room } = usePartyPreview();
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const joinUrl = `${window.location.origin}/join/${room.code}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      toast.success('Enlace de invitación copiado');
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.success(`Link listo: ${joinUrl}`);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Compartir sala y código QR"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-3xl border border-stroke bg-card p-6 shadow-elevated">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-xl font-bold text-ink">Invitar a la Fiesta</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar modal de compartir"
            className="flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full border border-stroke bg-elevated text-muted hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col items-center rounded-2xl border border-stroke bg-elevated p-5 text-center">
          <div className="rounded-2xl bg-white p-3.5 shadow-sm">
            <QRCodeSVG value={joinUrl} size={184} level="M" />
          </div>
          <p className="mt-4 text-xs font-medium text-muted">Código de sala (sin instalar nada)</p>
          <p className="mt-1 font-display text-3xl font-bold tracking-[0.2em] text-brand">{room.code}</p>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <button
            type="button"
            onClick={copyLink}
            className="flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-stroke bg-elevated px-4 text-sm font-semibold text-ink hover:bg-canvas"
          >
            {copied ? <Check className="h-4 w-4 text-brand" /> : <Copy className="h-4 w-4" />}
            <span>{copied ? 'Copiado' : 'Copiar Enlace'}</span>
          </button>

          <a
            href={`https://wa.me/?text=${encodeURIComponent(`¡Sumate a votar la música en ${room.name}! Entrá sin instalar nada: ${joinUrl}`)}`}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-brand px-4 text-sm font-semibold text-on-brand"
          >
            <Share2 className="h-4 w-4" />
            <span>WhatsApp</span>
          </a>
        </div>
      </div>
    </div>
  );
};

export const HostSettingsModal: React.FC<ModalProps> = ({ open, onClose }) => {
  const { room, updateRoom } = usePartyPreview();
  const navigate = useNavigate();
  const [confirmEnd, setConfirmEnd] = useState(false);

  if (!open) return null;

  const endParty = () => {
    updateRoom({ isActive: false, isPlaying: false });
    toast.success('Fiesta finalizada. Generando podio y resumen...');
    onClose();
    navigate(`/room/${room.code}/summary`);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ajustes del Anfitrión"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-stroke bg-card p-6 shadow-elevated">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-xl font-bold text-ink">Ajustes de Sala</h2>
            <p className="text-xs text-muted">Reglas anti-spam, Autoplay y motor de audio</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ajustes"
            className="flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full border border-stroke bg-elevated text-muted hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-ink" htmlFor="max-pending">
              Máximo de canciones pendientes por invitado ({room.maxPendingPerUser})
            </label>
            <input
              id="max-pending"
              type="range"
              min={1}
              max={15}
              value={room.maxPendingPerUser}
              onChange={(e) => updateRoom({ maxPendingPerUser: Number(e.target.value) })}
              className="w-full accent-brand"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-ink" htmlFor="cooldown-sec">
              Cooldown entre propuestas ({room.cooldownSeconds}s)
            </label>
            <input
              id="cooldown-sec"
              type="range"
              min={0}
              max={120}
              step={5}
              value={room.cooldownSeconds}
              onChange={(e) => updateRoom({ cooldownSeconds: Number(e.target.value) })}
              className="w-full accent-brand"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-ink" htmlFor="fallback-genre">
              Género de Autoplay (cuando la cola queda vacía)
            </label>
            <select
              id="fallback-genre"
              value={room.fallbackGenre}
              onChange={(e) => updateRoom({ fallbackGenre: e.target.value })}
              className="min-h-[44px] w-full rounded-xl border border-stroke bg-elevated px-3 text-sm text-ink"
            >
              {FALLBACK_GENRES.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-2xl border border-stroke bg-elevated p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">Spotify Premium OAuth PKCE</p>
                <p className="text-xs text-muted">
                  Opcional: YouTube Music funciona sin cuenta Premium.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  updateRoom({ spotifyConnected: !room.spotifyConnected });
                  toast.success(
                    room.spotifyConnected ? 'Spotify desconectado' : 'Cuenta Spotify vinculada'
                  );
                }}
                className={`min-h-[44px] rounded-full px-4 text-xs font-semibold ${
                  room.spotifyConnected
                    ? 'border border-brand/50 bg-brand-soft text-brand'
                    : 'bg-brand text-on-brand'
                }`}
              >
                {room.spotifyConnected ? 'Conectado' : 'Conectar Spotify'}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-danger/35 bg-danger/5 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
              <div className="flex-1">
                <h3 className="text-sm font-bold text-danger">Finalizar Fiesta</h3>
                <p className="mt-1 text-xs text-muted">
                  Se cerrará la votación y todos podrán ver el Podio de DJs y exportar el tracklist.
                </p>
                {!confirmEnd ? (
                  <button
                    type="button"
                    onClick={() => setConfirmEnd(true)}
                    className="mt-3 min-h-[44px] rounded-full border border-danger bg-card px-4 text-xs font-semibold text-danger hover:bg-danger hover:text-white"
                  >
                    Finalizar Fiesta
                  </button>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={endParty}
                      className="min-h-[44px] rounded-full bg-danger px-4 text-xs font-semibold text-white"
                    >
                      Confirmar y Ver Resumen
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmEnd(false)}
                      className="min-h-[44px] rounded-full border border-stroke bg-elevated px-4 text-xs font-semibold text-ink"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const AccountLinkModal: React.FC<ModalProps> = ({ open, onClose }) => {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Vincular cuenta opcional"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-3xl border border-stroke bg-card p-6 shadow-elevated">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-brand" />
            <h2 className="font-display text-xl font-bold text-ink">Tu Cuenta</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar modal de cuenta"
            className="flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full border border-stroke bg-elevated text-muted hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-sm text-muted">
          Puedes usar PonelePlay sin registrarte o vincular tu cuenta para guardar tu historial de fiestas y premios de DJ entre dispositivos.
        </p>

        <div className="mt-5 space-y-2.5">
          <button
            type="button"
            onClick={() => {
              toast.success('Cuenta vinculada con Google');
              onClose();
            }}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full bg-brand px-4 text-sm font-semibold text-on-brand"
          >
            <Link2 className="h-4 w-4" />
            <span>Continuar con Google</span>
          </button>

          <button
            type="button"
            onClick={() => {
              toast.success('Enlace mágico enviado a tu correo');
              onClose();
            }}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full border border-stroke bg-elevated px-4 text-sm font-semibold text-ink hover:bg-canvas"
          >
            <span>Vincular con Email</span>
          </button>
        </div>
      </div>
    </div>
  );
};
