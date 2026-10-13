import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import type { WatchHistoryItem } from '@/lib/watch-history';
import { ensureHttps } from '@/lib/utils';
import { watchPath } from '@/lib/routes';

interface ContinueWatchingProps {
  items: WatchHistoryItem[];
  onRemove: (id: string) => void;
}

type ImagePhase = 'primary' | 'poster' | 'none';

function pickMainSrc(item: WatchHistoryItem, phase: ImagePhase | undefined): string {
  const poster = ensureHttps(item.animeImage);
  const frame = item.frameThumbnail?.trim() ? ensureHttps(item.frameThumbnail) : '';
  if (phase === 'none') return '';
  return phase === 'poster' || !frame ? poster : frame;
}

function timeLeftLabel(item: WatchHistoryItem): string | null {
  if (!(item.duration > 0) || item.timestamp >= item.duration) return null;
  return `${Math.max(1, Math.round((item.duration - item.timestamp) / 60))} min left`;
}

const progressValue = (item: WatchHistoryItem) => Math.min(100, Math.max(0, Math.round(item.progress * 100)));
const progressLabel = (item: WatchHistoryItem) => `${progressValue(item)}% watched`;

/** One uniform, scrollable row of resumable episodes — a poster anchors each frame. */
export const ContinueWatching = ({ items, onRemove }: ContinueWatchingProps) => {
  const location = useLocation();
  const [imagePhase, setImagePhase] = useState<Record<string, ImagePhase>>({});
  const signature = useMemo(
    () => items.map((item) => `${item.animeId}\u001f${item.animeImage}\u001f${item.frameThumbnail ?? ''}`).join('\u0002'),
    [items],
  );

  useEffect(() => { setImagePhase({}); }, [signature]);

  const onImageError = useCallback((item: WatchHistoryItem) => {
    setImagePhase((previous) => {
      const current = previous[item.animeId];
      if (item.frameThumbnail?.trim() && current !== 'poster' && current !== 'none') {
        return { ...previous, [item.animeId]: 'poster' };
      }
      return { ...previous, [item.animeId]: 'none' };
    });
  }, []);

  if (!items.length) return null;

  const routeFor = (item: WatchHistoryItem) => watchPath(
    { id: item.animeId, title: item.animeTitle, source: item.source },
    item.episodeNumber,
    item.audioType ? new URLSearchParams({ lang: item.audioType }).toString() : '',
  );
  const state = { from: location.pathname + location.search };

  return (
    <div className="resume-row scrollbar-hide" style={{ gap: '.9rem', paddingBottom: '.5rem' }}>
      {items.map((item, index) => {
        const src = pickMainSrc(item, imagePhase[item.animeId]);
        const left = timeLeftLabel(item);
        const progress = progressValue(item);
        return (
          <article key={item.animeId} className="resume-card !basis-[42vw] md:!basis-[clamp(220px,25vw,320px)]">
            <Link
              to={routeFor(item)}
              state={state}
              className="resume-card-link group"
              aria-label={`Continue ${item.animeTitle}, episode ${item.episodeNumber}`}
              style={{ display: 'flex', flexDirection: 'column', aspectRatio: 'auto', overflow: 'visible', borderRadius: 0, boxShadow: 'none', background: 'transparent' }}
            >
              <div className="resume-card-art" style={{ position: 'relative', inset: 'auto', width: '100%', aspectRatio: '16 / 9', overflow: 'hidden', borderRadius: '.55rem', background: 'hsl(234 26% 7%)' }}>
                {src ? (
                  <img
                    src={src}
                    alt=""
                    loading={index < 4 ? 'eager' : 'lazy'}
                    decoding="async"
                    referrerPolicy="no-referrer"
                    onError={() => onImageError(item)}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : <div className="resume-fallback h-full" />}
                <div className="resume-card-progress" aria-label={progressLabel(item)} style={{ position: 'absolute', right: 0, bottom: 0, left: 0, width: '100%' }}>
                  <span style={{ width: `${progress}%` }} />
                </div>
              </div>
              <div className="resume-card-copy" style={{ position: 'static', padding: 0, marginTop: '.45rem' }}>
                <h3>{item.animeTitle}</h3>
                <p>Episode {item.episodeNumber} <i /> {left ?? 'Ready to continue'}</p>
              </div>
            </Link>
            <button
              type="button"
              aria-label={`Remove ${item.animeTitle} from Continue watching`}
              className="resume-card-remove"
              onClick={() => onRemove(item.animeId)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </article>
        );
      })}
    </div>
  );
};
