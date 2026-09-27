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
  );
  const state = { from: location.pathname + location.search };

  return (
    <div className="resume-row scrollbar-hide">
      {items.map((item, index) => {
        const src = pickMainSrc(item, imagePhase[item.animeId]);
        const left = timeLeftLabel(item);
        const progress = progressValue(item);
        return (
          <article key={item.animeId} className="resume-card">
            <Link
              to={routeFor(item)}
              state={state}
              className="resume-card-link group"
              aria-label={`Continue ${item.animeTitle}, episode ${item.episodeNumber}`}
            >
              <div className="resume-card-art">
                {src ? (
                  <img
                    src={src}
                    alt=""
                    loading={index < 4 ? 'eager' : 'lazy'}
                    decoding="async"
                    referrerPolicy="no-referrer"
                    onError={() => onImageError(item)}
                  />
                ) : <div className="resume-fallback h-full" />}
              </div>
              <div className="resume-card-scrim" />
              <div className="resume-card-copy">
                <h3>{item.animeTitle}</h3>
                <p>Episode {item.episodeNumber} <i /> {left ?? 'Ready to continue'}</p>
              </div>
              <div className="resume-card-progress" aria-label={progressLabel(item)}>
                <span style={{ width: `${progress}%` }} />
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
