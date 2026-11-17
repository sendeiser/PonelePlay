import React, { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Award,
  Copy,
  Crown,
  Disc3,
  Home,
  Music2,
  Trophy,
} from 'lucide-react';
import { toast } from 'sonner';
import { usePartyPreview } from '../context/PartyPreviewContext';
import { formatDurationMs } from '../data/mockPartyData';

export const PartySummaryPage: React.FC = () => {
  const { code = 'PLAY42' } = useParams();
  const navigate = useNavigate();
  const { room, played, nowPlaying, participants, loadRoomByCode } = usePartyPreview();

  useEffect(() => {
    void loadRoomByCode(code);
  }, [code, loadRoomByCode]);

  const allSessionTracks = nowPlaying ? [nowPlaying, ...played] : played;
  const queenTrack = [...allSessionTracks].sort((a, b) => b.netScore - a.netScore)[0];
  const topDjs = [...participants]
    .filter((p) => !p.isBanned)
    .sort((a, b) => b.djPoints - a.djPoints)
    .slice(0, 3);

  const exportTracklist = async () => {
    const text = allSessionTracks
      .map((item, i) => `${i + 1}. ${item.song.title} — ${item.song.artist}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // fallback
    }
    toast.success('Tracklist copiado para importar en YouTube Music');
  };

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-6 sm:px-6 sm:py-10">
      {/* Cabecera celebratoria limpia */}
      <section className="rounded-3xl border border-stroke bg-card p-6 text-center shadow-surface sm:p-10">
        <div className="space-y-3">
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-coral">
            Fin de Fiesta · Sala {code.toUpperCase()}
          </p>
          <h1 className="font-display text-3xl font-extrabold text-ink sm:text-4xl">{room.name}</h1>
          <p className="text-sm text-muted">
            Así sonó la noche. Guarda los temas en tu playlist o mira quién dominó la consola.
          </p>

          <div className="mx-auto mt-6 grid max-w-xl grid-cols-3 gap-3">
            <div className="rounded-2xl border border-stroke bg-elevated p-3">
              <p className="font-display text-2xl font-bold tabular-nums-mono text-brand">
                {allSessionTracks.length}
              </p>
              <p className="text-[11px] text-muted">Temas sonados</p>
            </div>
            <div className="rounded-2xl border border-stroke bg-elevated p-3">
              <p className="font-display text-2xl font-bold tabular-nums-mono text-ink">148</p>
              <p className="text-[11px] text-muted">Votos emitidos</p>
            </div>
            <div className="rounded-2xl border border-stroke bg-elevated p-3">
              <p className="font-display text-2xl font-bold tabular-nums-mono text-ink">
                {participants.length}
              </p>
              <p className="text-[11px] text-muted">Participantes</p>
            </div>
          </div>
        </div>
      </section>

      {/* Podio Top 3 DJs */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-brand" />
          <h2 className="font-display text-xl font-bold text-ink">Podio de DJs de la Noche</h2>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {topDjs.map((dj, index) => {
            const medalStyles = [
              'border-brand/60 bg-card shadow-surface',
              'border-stroke bg-card',
              'border-stroke bg-card',
            ][index];
            const labels = ['1º DJ Oro', '2º DJ Plata', '3º DJ Bronce'];
            return (
              <div
                key={dj.id}
                className={`rounded-3xl border p-5 text-center ${medalStyles}`}
              >
                <span className="inline-flex items-center gap-1 font-mono text-xs font-bold uppercase text-ink">
                  <Award className={`h-4 w-4 ${index === 0 ? 'text-brand' : 'text-muted'}`} />
                  {labels[index]}
                </span>
                <div className="mt-3 text-4xl">{dj.avatarEmoji}</div>
                <h3 className="mt-2 font-display text-xl font-bold text-ink">@{dj.displayName}</h3>
                <p className="mt-1 font-mono text-sm font-bold text-brand">
                  {dj.djPoints} puntos netos
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Canción Reina + Acciones de Exportación */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {queenTrack && (
          <div className="relative overflow-hidden rounded-3xl border border-coral/40 bg-card p-6 shadow-elevated lg:col-span-7">
            <img
              src={queenTrack.song.imageUrl}
              alt=""
              aria-hidden="true"
              className="ambient-cover-blur pointer-events-none absolute inset-0 h-full w-full object-cover"
            />
            <div aria-hidden="true" className="ambient-scrim pointer-events-none absolute inset-0" />
            <div className="relative z-10">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-coral">
                <Crown className="h-4 w-4 text-coral" />
                <span>Canción Reina de la Fiesta</span>
              </div>
              <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row">
                <img
                  src={queenTrack.song.imageUrl}
                  alt={queenTrack.song.title}
                  className="h-28 w-28 shrink-0 rounded-2xl border border-stroke object-cover shadow-elevated"
                />
                <div className="w-full min-w-0 flex-1 text-center sm:text-left">
                  <h3 className="break-words font-display text-xl font-bold leading-snug text-ink sm:text-2xl">
                    {queenTrack.song.title}
                  </h3>
                  <p className="mt-0.5 truncate text-sm text-muted">{queenTrack.song.artist}</p>
                  <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                    <span className="bg-brand-gradient rounded-full px-3 py-1 font-mono text-xs font-bold">
                      +{queenTrack.netScore} votos netos
                    </span>
                    <span className="text-xs text-muted">
                      Propuesta por {queenTrack.proposedByAvatar} @{queenTrack.proposedByName}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col justify-between gap-3 rounded-3xl border border-stroke bg-card p-6 lg:col-span-5">
          <div>
            <h2 className="font-display text-lg font-bold text-ink">Exportar Playlist</h2>
            <p className="mt-1 text-xs text-muted">
              Llevate la música que sonó en la noche a tu plataforma favorita.
            </p>
          </div>
          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => toast.success('Playlist creada en tu cuenta de Spotify')}
              className="bg-brand-gradient flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full px-4 text-sm font-bold shadow-aurora"
            >
              <Disc3 className="h-4 w-4" />
              <span>Guardar como Playlist en Spotify</span>
            </button>

            <button
              type="button"
              onClick={exportTracklist}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full border border-stroke bg-elevated px-4 text-sm font-semibold text-ink hover:border-brand"
            >
              <Copy className="h-4 w-4 text-brand" />
              <span>Copiar Tracklist para YouTube Music</span>
            </button>
          </div>
        </div>
      </section>

      {/* Lista completa de canciones que sonaron */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl font-bold text-ink">Tracklist de la Fiesta</h2>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-stroke bg-elevated px-4 text-xs font-semibold text-ink hover:border-brand"
          >
            <Home className="h-4 w-4" />
            <span>Volver al Inicio</span>
          </button>
        </div>

        <div className="space-y-2">
          {allSessionTracks.map((item, idx) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-stroke bg-card p-3 sm:px-4"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="w-6 font-mono text-xs font-bold text-muted">#{idx + 1}</span>
                <img
                  src={item.song.imageUrl}
                  alt={item.song.title}
                  className="h-11 w-11 shrink-0 rounded-xl object-cover"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{item.song.title}</p>
                  <p className="truncate text-xs text-muted">
                    {item.song.artist} · {item.proposedByAvatar} @{item.proposedByName}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Music2 className="h-3.5 w-3.5 text-muted" />
                <span className="font-mono text-xs text-muted">
                  {formatDurationMs(item.song.durationMs)}
                </span>
                <span className="rounded-lg bg-brand-soft px-2 py-0.5 font-mono text-xs font-bold text-brand">
                  +{item.netScore}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
};
