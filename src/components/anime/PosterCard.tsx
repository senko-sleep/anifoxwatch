import { useRef, useState, type CSSProperties } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  atmosphereStyle,
  cn,
  ensureHttps,
  isValidAnimeYear,
  isValidEpisodeCount,
} from '@/lib/utils';
import { animePath, type AnimeRef } from '@/lib/routes';
import { apiUrl } from '@/lib/api-config';

/**
 * The one card every anime appears in — home rows, browse grid, search results.
 * Artwork leads; the glass only ever frames it. A title's own cover colour is
 * piped in as `--atmos`, so each show lights its own card on hover instead of
 * every card glowing the same brand orange.
 */

export interface PosterCardItem {
  id: string;
  title: string;
  titleEnglish?: string | null;
  titleRomaji?: string | null;
  image?: string;
  cover?: string;
  coverImage?: string;
  bannerImage?: string;
  accentColor?: string;
  rating?: number;
  type?: string;
  status?: string;
  episodes?: number;
  year?: number;
  genres?: string[];
  source?: string;
  isMature?: boolean;
  streamingId?: string;
  /** Adult catalog: sites that can play it. An empty list means no site carries it. */
  watchableOn?: string[];
}

interface PosterCardProps {
  anime: PosterCardItem;
  /** 0–1 watch progress; draws the resume line along the bottom edge. */
  progress?: number;
  /** Episode the viewer left off on, shown in place of "Watch". */
  resumeEpisode?: number;
  className?: string;
  style?: CSSProperties;
  priority?: boolean;
  onMouseEnter?: (e: React.MouseEvent) => void;
}

function posterUrl(a: PosterCardItem): string {
  return ensureHttps(a.coverImage || a.image || a.cover || a.bannerImage || '');
}

/** Poster with a proxy retry — hotlink-blocked covers still render. */
const PosterImage = ({ src, alt, priority }: { src: string; alt: string; priority?: boolean }) => {
  const [current, setCurrent] = useState(src);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const triedProxy = useRef(false);
  const lastSrc = useRef(src);

  if (lastSrc.current !== src) {
    lastSrc.current = src;
    triedProxy.current = false;
    setCurrent(src);
    setLoaded(false);
    setFailed(false);
  }

  if (!src || failed) {
    return (
      <div className="absolute inset-0 grid place-items-center bg-[hsl(234_22%_11%)] px-3 text-center">
        <span className="line-clamp-3 font-display text-[13px] italic text-muted-foreground">{alt}</span>
      </div>
    );
  }

  return (
    <>
      {!loaded && <div className="absolute inset-0 skeleton rounded-none" />}
      <img
        src={current}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        referrerPolicy="no-referrer"
        className={cn(
          'absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ease-glide',
          loaded ? 'opacity-100' : 'opacity-0'
        )}
        fetchPriority={priority ? 'high' : 'low'}
        onLoad={() => setLoaded(true)}
        onError={() => {
          if (!triedProxy.current) {
            triedProxy.current = true;
            setCurrent(`${apiUrl('/api/image-proxy')}?url=${encodeURIComponent(src)}`);
          } else {
            setFailed(true);
          }
        }}
      />
    </>
  );
};

export const PosterCard = ({
  anime,
  progress,
  resumeEpisode,
  className,
  style,
  priority,
  onMouseEnter,
}: PosterCardProps) => {
  const location = useLocation();
  const airing = anime.status === 'Ongoing';
  const unavailable = Array.isArray(anime.watchableOn) && anime.watchableOn.length === 0;

  const meta = [
    isValidAnimeYear(anime.year) ? String(anime.year) : null,
    anime.type === 'Movie'
      ? 'Film'
      : isValidEpisodeCount(anime.episodes)
        ? `${anime.episodes} ep${anime.episodes === 1 ? '' : 's'}`
        : anime.type || null,
  ].filter(Boolean);

  const pct = progress != null ? Math.round(Math.min(Math.max(progress, 0), 1) * 100) : null;

  return (
    <Link
      to={animePath(anime as AnimeRef)}
      state={{ from: location.pathname + location.search }}
      onMouseEnter={onMouseEnter}
      style={atmosphereStyle(anime.accentColor, style as Record<string, string | number>)}
      className={cn('group flex w-full flex-col focus:outline-none', className)}
    >
        <div className="art-frame aspect-[2/3] w-full">
        <PosterImage src={posterUrl(anime)} alt={anime.title} priority={priority} />

        {/* Status — one indicator only, top right, never a wall of badges. */}
        {unavailable ? (
          <span className="glass-chip absolute right-2 top-2 z-10 rounded-full px-2 py-1 text-[10px] font-medium text-muted-foreground">
            No source yet
          </span>
        ) : airing && (
          <span className="glass-chip absolute right-2 top-2 z-10 inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-semibold text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Airing
          </span>
         )}

        {/* Resume line — the only thing that outranks the artwork. */}
        {pct !== null && pct > 0 && (
          <div className="absolute inset-x-0 bottom-0 z-20 h-[3px] bg-[hsl(236_34%_4%_/_0.6)]">
            <div
              className="h-full rounded-r-full bg-[hsl(var(--atmos))]"
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Title always sits below the artwork, never on top of a face. */}
      <div className="mt-2.5 flex flex-col gap-1">
         <p className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground/90 sm:text-sm">
           {anime.title}
         </p>
        {meta.length > 0 && (
          <p className="text-[11px] text-muted-foreground">{meta.join(' · ')}</p>
        )}
      </div>
    </Link>
  );
};

/** Matching placeholder so loading rows keep the page's rhythm. */
export const PosterCardSkeleton = ({ className }: { className?: string }) => (
  <div className={cn('flex w-full flex-col', className)}>
    <div className="skeleton aspect-[2/3] w-full rounded-[0.875rem]" />
    <div className="skeleton mt-2.5 h-3.5 w-4/5" />
    <div className="skeleton mt-1.5 h-3 w-1/3" />
  </div>
);
