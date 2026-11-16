import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Award,
  Copy,
  Crown,
  Disc3,
  Home,
  Music2,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { toast } from 'sonner';
import { usePartyPreview } from '../context/PartyPreviewContext';
import { formatDurationMs } from '../data/mockPartyData';

export const PartySummaryPage: React.FC = () => {
  const { code = 'PLAY42' } = useParams();
  const navigate = useNavigate();
  const { room, played, nowPlaying, participants } = usePartyPreview();

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
      {/* Cabecera celebratoria */}
      <section className="relative overflow-hidden rounded-3xl border border-stroke bg-card p-6 text-center shadow-xl sm:p-10">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-0 h-48 w-96 -translate-x-1/2 rounded-full bg-amber/15 blur-3xl"
        />

        <div className="relative z-10 space-y-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber/40 bg-amber/15 px-3 py-1 font-mono text-xs font-bold uppercase text-amber">
            <Sparkles className="h-3.5 w-3.5" />
            Fin de Fiesta · Sala {code.toUpperCase()}
          </span>
          <h1 className="font-display text-3xl text-ink sm:text-4xl">{room.name}</h1>
          <p className="text-sm text-muted">
            Así sonó la noche. Guarda los temas en tu playlist o mira quién dominó la consola.
          </p>

          <div className="mx-auto mt-6 grid max-w-xl grid-cols-3 gap-3">
            <div className="rounded-2xl border border-stroke bg-elevated p-3">
              <p className="font-display text-2xl tabular-nums-mono text-neon">
                {allSessionTracks.length}
              </p>
              <p className="text-[11px] text-muted">Temas sonados</p>
            </div>
            <div className="rounded-2xl border border-stroke bg-elevated p-3">
              <p className="font-display text-2xl tabular-nums-mono text-ink">148</p>
              <p className="text-[11px] text-muted">Votos emitidos</p>
            </div>
            <div className="rounded-2xl border border-stroke bg-elevated p-3">
              <p className="font-display text-2xl tabular-nums-mono text-brand">
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
          <Trophy className="h-5 w-5 text-amber" />
          <h2 className="font-display text-xl text-ink">Podio de DJs de la Noche</h2>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {topDjs.map((dj, index) => {
            const medalStyles = [
              'border-amber/70 bg-amber/10',
              'border-slate-400/60 bg-elevated',
              'border-orange-500/50 bg-orange-500/10',
            ][index];
            const labels = ['1º DJ Oro', '2º DJ Plata', '3º DJ Bronce'];
            return (
              <div
                key={dj.id}
                className={`rounded-3xl border p-5 text-center shadow-lg ${medalStyles}`}
              >
                <span className="inline-flex items-center gap-1 font-mono text-xs font-bold uppercase text-ink">
                  <Award className="h-4 w-4 text-amber" />
                  {labels[index]}
                </span>
                <div className="mt-3 text-4xl">{dj.avatarEmoji}</div>
                <h3 className="mt-2 font-display text-xl text-ink">@{dj.displayName}</h3>
                <p className="mt-1 font-mono text-sm font-bold text-neon">
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
          <div className="rounded-3xl border border-neon/50 bg-card p-6 shadow-neon-green lg:col-span-7">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-neon">
              <Crown className="h-4 w-4 text-amber" />
              <span>Canción Reina de la Fiesta</span>
            </div>
            <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row">
              <img
                src={queenTrack.song.imageUrl}
                alt={queenTrack.song.title}
                className="h-28 w-28 shrink-0 rounded-2xl border border-stroke object-cover"
              />
              <div className="w-full min-w-0 flex-1 text-center sm:text-left">
                <h3 className="break-words font-display text-xl leading-snug text-ink sm:text-2xl">
                  {queenTrack.song.title}
                </h3>
                <p className="mt-0.5 truncate text-sm text-muted">{queenTrack.song.artist}</p>
                <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                  <span className="rounded-full bg-neon/15 px-3 py-1 font-mono text-xs font-bold text-neon">
                    +{queenTrack.netScore} votos netos
                  </span>
                  <span className="text-xs text-muted">
                    Propuesta por {queenTrack.proposedByAvatar} @{queenTrack.proposedByName}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col justify-between gap-3 rounded-3xl border border-stroke bg-card p-6 lg:col-span-5">
          <div>
            <h2 className="font-display text-lg text-ink">Exportar Playlist</h2>
            <p className="mt-1 text-xs text-muted">
              Llevate la música que sonó en la noche a tu plataforma favorita.
            </p>
          </div>
          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => toast.success('Playlist creada en tu cuenta de Spotify (Preview)')}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-neon px-4 text-sm font-bold text-on-neon shadow-neon-green"
            >
              <Disc3 className="h-4 w-4" />
              <span>Guardar como Playlist en Spotify</span>
            </button>

            <button
              type="button"
              onClick={exportTracklist}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl border border-stroke bg-elevated px-4 text-sm font-semibold text-ink hover:border-ytm"
            >
              <Copy className="h-4 w-4 text-ytm" />
              <span>Copiar Tracklist para YouTube Music</span>
            </button>
          </div>
        </div>
      </section>

      {/* Lista completa de canciones que sonaron */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl text-ink">Tracklist de la Fiesta</h2>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-stroke bg-elevated px-4 text-xs font-semibold text-ink hover:border-brand"
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
                <span className="rounded-lg bg-neon/15 px-2 py-0.5 font-mono text-xs font-bold text-neon">
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
