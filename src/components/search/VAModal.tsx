import { useEffect, useRef } from 'react';
import { X, ExternalLink } from 'lucide-react';
import { AniListVoiceActor } from '@/lib/anilist-client';
import { cn } from '@/lib/utils';

interface VAModalProps {
  va: AniListVoiceActor;
  animeTitle: string;
  onClose: () => void;
}

export const VAModal = ({ va, animeTitle, onClose }: VAModalProps) => {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />

      <div className="relative w-full max-w-sm animate-in fade-in zoom-in-95 duration-200">
        <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0d0f16] shadow-2xl shadow-black/70">

          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-fox-orange to-transparent opacity-80" />

          <button
            onClick={onClose}
            className="absolute top-3 right-3 z-10 flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.06] text-zinc-400 hover:bg-white/[0.12] hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="p-6 flex flex-col items-center text-center">
            {/* VA Photo */}
            <div className="relative mb-4">
              <div className="w-28 h-28 rounded-full overflow-hidden ring-2 ring-fox-orange/40 shadow-lg shadow-fox-orange/10">
                {va.image?.medium ? (
                  <img
                    src={va.image.medium}
                    alt={va.name.full}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-3xl text-zinc-600">
                    {va.name.full[0]}
                  </div>
                )}
              </div>
              <div className="absolute inset-0 rounded-full ring-1 ring-fox-orange/20 scale-110 pointer-events-none" />
            </div>

            <h2 className="text-lg font-bold text-white leading-tight mb-0.5">{va.name.full}</h2>
            <p className="text-[11px] text-zinc-500 mb-4">Japanese Voice Actor</p>

            {va.character && (
              <div className="w-full rounded-xl bg-white/[0.04] border border-white/[0.06] p-3 flex items-center gap-3 mb-4">
                {va.character.image && (
                  <img
                    src={va.character.image}
                    alt={va.character.name}
                    className="w-10 h-10 rounded-full object-cover ring-1 ring-white/10 flex-shrink-0"
                    referrerPolicy="no-referrer"
                  />
                )}
                <div className="min-w-0 text-left">
                  <p className="text-[10px] text-zinc-500 mb-0.5">Voices character</p>
                  <p className="text-sm font-semibold text-white truncate">{va.character.name}</p>
                  <p className="text-[10px] text-fox-orange truncate">in {animeTitle}</p>
                </div>
              </div>
            )}

            <a
              href={`https://anilist.co/staff/${va.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "inline-flex items-center gap-1.5 text-[11px] font-medium text-zinc-400 hover:text-fox-orange transition-colors"
              )}
            >
              <ExternalLink className="w-3 h-3" />
              View full profile on AniList
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
