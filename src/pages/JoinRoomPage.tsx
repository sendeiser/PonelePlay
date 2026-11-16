import React, { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertOctagon,
  ArrowRight,
  Link2,
  Music2,
  SearchX,
  Trophy,
} from 'lucide-react';
import { toast } from 'sonner';
import { usePartyPreview } from '../context/PartyPreviewContext';
import { AVATAR_OPTIONS } from '../data/mockPartyData';
import { JoinEdgeState } from '../types/jukebox';

export const JoinRoomPage: React.FC = () => {
  const { code = 'PLAY42' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { room, setDemoRole } = usePartyPreview();

  const [nickname, setNickname] = useState('luqui');
  const [avatar, setAvatar] = useState('⚡');

  const paramState = searchParams.get('state');
  const edgeState: JoinEdgeState =
    paramState === 'ended' || paramState === 'banned' || paramState === 'not_found'
      ? paramState
      : !room.isActive
      ? 'ended'
      : 'active';

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (nickname.trim().length < 2) {
      toast.error('Tu apodo debe tener al menos 2 caracteres');
      return;
    }
    setDemoRole('guest');
    toast.success(`¡Bienvenido a ${room.name}, @${nickname.trim()}!`);
    navigate(`/room/${code.toUpperCase()}?role=guest`);
  };

  return (
    <main className="mx-auto max-w-xl px-4 py-8 sm:px-6 sm:py-12">
      {edgeState === 'active' && (
        <section className="rounded-3xl border border-stroke bg-card p-6 shadow-elevated sm:p-8">
          <div className="space-y-2 border-b border-stroke pb-5 text-center">
            <div className="mx-auto inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand">
              <Music2 className="h-3.5 w-3.5" />
              <span>
                {room.activeProvider === 'youtube_music'
                  ? 'YouTube Music Sin Premium'
                  : 'Spotify Premium'}
              </span>
            </div>

            <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">{room.name}</h1>
            <p className="text-xs text-muted">
              Anfitrión: <strong className="text-ink">{room.hostName}</strong> · Sala{' '}
              <span className="font-mono font-bold text-brand">{code.toUpperCase()}</span>
            </p>
          </div>

          <form onSubmit={handleJoin} className="mt-6 space-y-5">
            <div>
              <label htmlFor="guest-nickname" className="mb-1.5 block text-xs font-semibold text-ink">
                ¿Cómo te dicen en la fiesta? (Apodo)
              </label>
              <input
                id="guest-nickname"
                type="text"
                maxLength={24}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Ej: Martu, Tincho, DJ Luqui..."
                className="min-h-[48px] w-full rounded-xl border border-stroke bg-elevated px-4 text-sm text-ink focus:border-brand"
              />
            </div>

            <div>
              <span className="mb-2 block text-xs font-semibold text-ink">Elige tu Avatar</span>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {AVATAR_OPTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setAvatar(emoji)}
                    aria-label={`Elegir avatar ${emoji}`}
                    aria-pressed={avatar === emoji}
                    className={`flex min-h-[48px] min-w-[44px] items-center justify-center rounded-xl border text-xl transition-all ${
                      avatar === emoji
                        ? 'border-brand bg-brand-soft'
                        : 'border-stroke bg-elevated hover:border-muted'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-brand px-5 text-sm font-semibold text-on-brand shadow-surface transition-opacity hover:opacity-95 active:scale-[0.99]"
            >
              <span>Entrar a Votar y Proponer</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <div className="mt-5 border-t border-stroke pt-4 text-center">
            <button
              type="button"
              onClick={() => toast.info('Puedes vincular Google o Email desde el botón Cuenta arriba')}
              className="inline-flex min-h-[44px] items-center gap-1.5 text-xs font-medium text-muted hover:text-brand"
            >
              <Link2 className="h-3.5 w-3.5" />
              <span>¿Ya tienes cuenta? Vincular Google o Email para guardar tu historial</span>
            </button>
          </div>
        </section>
      )}

      {edgeState === 'ended' && (
        <section className="rounded-3xl border border-stroke bg-card p-8 text-center shadow-elevated">
          <Trophy className="mx-auto h-12 w-12 text-amber" />
          <h1 className="mt-4 font-display text-2xl font-bold text-ink">Esta fiesta ya terminó</h1>
          <p className="mt-2 text-sm text-muted">
            La sala <strong className="font-mono text-ink">{code.toUpperCase()}</strong> fue cerrada por el anfitrión, pero ya está listo el podio de DJs y la playlist final.
          </p>
          <button
            type="button"
            onClick={() => navigate(`/room/${code}/summary`)}
            className="mt-6 inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-brand px-6 text-sm font-semibold text-on-brand shadow-surface"
          >
            <Trophy className="h-4 w-4" />
            <span>Ver Resumen de la Fiesta</span>
          </button>
        </section>
      )}

      {edgeState === 'banned' && (
        <section className="rounded-3xl border border-danger/40 bg-card p-8 text-center shadow-elevated">
          <AlertOctagon className="mx-auto h-12 w-12 text-danger" />
          <h1 className="mt-4 font-display text-2xl font-bold text-ink">Acceso restringido</h1>
          <p className="mt-2 text-sm text-muted">
            El anfitrión restringió tu participación en la sala <strong className="font-mono text-ink">{code.toUpperCase()}</strong>.
          </p>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-full border border-stroke bg-elevated px-5 text-sm font-semibold text-ink"
          >
            Volver al Inicio
          </button>
        </section>
      )}

      {edgeState === 'not_found' && (
        <section className="rounded-3xl border border-stroke bg-card p-8 text-center shadow-elevated">
          <SearchX className="mx-auto h-12 w-12 text-muted" />
          <h1 className="mt-4 font-display text-2xl font-bold text-ink">Sala no encontrada</h1>
          <p className="mt-2 text-sm text-muted">
            No existe ninguna sala con el código <strong className="font-mono text-ink">{code.toUpperCase()}</strong>. Verifica con el anfitrión.
          </p>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-full bg-brand px-5 text-sm font-semibold text-on-brand"
          >
            Probar otro código
          </button>
        </section>
      )}
    </main>
  );
};
