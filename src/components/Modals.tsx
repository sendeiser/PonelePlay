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
  const [loadingSkeleton, setLoadingSkeleton] = useState(false);

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
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
    >
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border border-stroke bg-card shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between gap-3 border-b border-stroke px-4 py-3.5 sm:px-6">
          <div className="min-w-0">
            <h2 className="font-display text-lg text-ink">Buscar o Pegar Link</h2>
            <p className="text-xs text-muted">
              Compatible con texto, YouTube, YouTube Music y Spotify
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar buscador"
            className="flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-stroke bg-elevated text-muted hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 p-4 sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neon" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ej: Duki, María Becerra o pegá link..."
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
            <button
              type="button"
              onClick={() => {
                setLoadingSkeleton(true);
                window.setTimeout(() => setLoadingSkeleton(false), 700);
              }}
              className="min-h-[44px] shrink-0 rounded-xl border border-stroke bg-elevated px-3.5 text-xs font-semibold text-muted hover:text-ink"
            >
              Simular Carga
            </button>
          </div>

          {cooldownRemaining > 0 && (
            <div className="rounded-xl border border-amber/40 bg-amber/10 px-3 py-2 text-xs font-medium text-amber">
              Cooldown anti-spam activo: espera{' '}
              <span className="tabular-nums-mono font-bold">{cooldownRemaining}s</span> para proponer un tema nuevo (puedes sumar +1 a temas ya en cola).
            </div>
          )}

          <div className="max-h-[52vh] space-y-2.5 overflow-y-auto pr-1">
            {loadingSkeleton ? (
              Array.from({ length: 4 }).map((_, idx) => (
                <div
                  key={idx}
                  className="flex animate-pulse items-center gap-3 rounded-2xl border border-stroke bg-elevated p-3"
                >
                  <div className="h-12 w-12 rounded-xl bg-card" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-2/3 rounded bg-card" />
                    <div className="h-3 w-1/3 rounded bg-card" />
                  </div>
                  <div className="h-10 w-24 rounded-xl bg-card" />
                </div>
              ))
            ) : filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stroke py-10 text-center">
                <Music className="mx-auto h-8 w-8 text-muted" />
                <p className="mt-2 text-sm font-medium text-ink">No encontramos canciones para "{query}"</p>
                <p className="text-xs text-muted">Prueba otro artista o pega el enlace directo de YouTube / Spotify.</p>
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
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-sm font-semibold text-ink">{song.title}</p>
                          {song.cached && (
                            <span className="shrink-0 rounded bg-neon/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-neon">
                              CACHÉ
                            </span>
                          )}
                        </div>
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
                        className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl bg-neon px-3.5 text-xs font-bold text-on-neon shadow-neon-green disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Plus className="h-4 w-4" />
                        <span>Proponer</span>
                      </button>
                    )}

                    {status === 'in_queue' && (
                      <button
                        type="button"
                        onClick={() => proposeSong(song)}
                        className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl border border-neon/50 bg-neon/15 px-3 text-xs font-semibold text-neon hover:bg-neon/25"
                      >
                        <ThumbsUp className="h-4 w-4" />
                        <span>+1 Voto (En cola)</span>
                      </button>
                    )}

                    {status === 'playing' && (
                      <span className="inline-flex min-h-[44px] shrink-0 items-center rounded-xl border border-brand/40 bg-brand/20 px-3 text-xs font-semibold text-ink">
                        Sonando ahora
                      </span>
                    )}

                    {status === 'blocked' && (
                      <span className="inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-xl border border-danger/40 bg-danger/15 px-3 text-xs font-semibold text-danger">
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
      <div className="w-full max-w-md rounded-3xl border border-stroke bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl text-ink">Invitar a la Fiesta</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar modal de compartir"
            className="flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-stroke bg-elevated text-muted hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col items-center rounded-2xl border border-stroke bg-elevated p-5 text-center">
          <div className="rounded-2xl bg-white p-3.5 shadow-lg">
            <QRCodeSVG value={joinUrl} size={184} level="M" />
          </div>
          <p className="mt-4 text-xs font-medium text-muted">Código de sala (sin instalar nada)</p>
          <p className="mt-1 font-display text-3xl tracking-[0.2em] text-neon">{room.code}</p>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <button
            type="button"
            onClick={copyLink}
            className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-stroke bg-elevated px-4 text-sm font-semibold text-ink hover:border-brand"
          >
            {copied ? <Check className="h-4 w-4 text-neon" /> : <Copy className="h-4 w-4" />}
            <span>{copied ? 'Copiado' : 'Copiar Enlace'}</span>
          </button>

          <a
            href={`https://wa.me/?text=${encodeURIComponent(`¡Sumate a votar la música en ${room.name}! Entrá sin instalar nada: ${joinUrl}`)}`}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-neon px-4 text-sm font-bold text-on-neon shadow-neon-green"
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
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-stroke bg-card p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-xl text-ink">Ajustes del Anfitrión</h2>
            <p className="text-xs text-muted">Controla reglas anti-spam, Autoplay y motor</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ajustes"
            className="flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-stroke bg-elevated text-muted hover:text-ink"
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
              className="w-full accent-neon"
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
              className="w-full accent-neon"
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
                  Opcional: YouTube Music funciona 100% sin cuenta Premium.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  updateRoom({ spotifyConnected: !room.spotifyConnected });
                  toast.success(
                    room.spotifyConnected ? 'Spotify desconectado' : 'Cuenta Spotify vinculada (Demo)'
                  );
                }}
                className={`min-h-[44px] rounded-xl px-4 text-xs font-bold ${
                  room.spotifyConnected
                    ? 'border border-neon/40 bg-neon/15 text-neon'
                    : 'bg-brand text-white'
                }`}
              >
                {room.spotifyConnected ? 'Conectado' : 'Conectar Spotify'}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
              <div className="flex-1">
                <h3 className="text-sm font-bold text-danger">Zona de Cierre de Fiesta</h3>
                <p className="mt-1 text-xs text-muted">
                  Al finalizar la sala se detiene la votación y todos ven el Podio de DJs y la exportación de playlist.
                </p>
                {!confirmEnd ? (
                  <button
                    type="button"
                    onClick={() => setConfirmEnd(true)}
                    className="mt-3 min-h-[44px] rounded-xl border border-danger bg-card px-4 text-xs font-bold text-danger hover:bg-danger hover:text-white"
                  >
                    Finalizar Fiesta
                  </button>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={endParty}
                      className="min-h-[44px] rounded-xl bg-danger px-4 text-xs font-bold text-white"
                    >
                      Confirmar y Ver Resumen
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmEnd(false)}
                      className="min-h-[44px] rounded-xl border border-stroke bg-elevated px-4 text-xs font-semibold text-ink"
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
      <div className="w-full max-w-md rounded-3xl border border-stroke bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-neon" />
            <h2 className="font-display text-xl text-ink">Identidad Híbrida</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar modal de cuenta"
            className="flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-stroke bg-elevated text-muted hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-sm text-muted">
          Estás navegando con acceso instantáneo por sesión anónima segura (<code className="font-mono text-xs text-neon">auth.uid()</code>). Puedes vincular una cuenta para conservar tu historial y trofeos de DJ entre dispositivos.
        </p>

        <div className="mt-5 space-y-2.5">
          <button
            type="button"
            onClick={() => {
              toast.success('Cuenta vinculada con Google (Preview)');
              onClose();
            }}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-bold text-slate-900 shadow"
          >
            <Link2 className="h-4 w-4 text-brand" />
            <span>Continuar con Google</span>
          </button>

          <button
            type="button"
            onClick={() => {
              toast.success('Magic Link enviado a tu correo (Preview)');
              onClose();
            }}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-stroke bg-elevated px-4 text-sm font-semibold text-ink hover:border-brand"
          >
            <span>Vincular con Email Magic Link</span>
          </button>
        </div>
      </div>
    </div>
  );
};
