import { useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Film, Star, Mic, Subtitles, Play, Calendar, Building2 } from 'lucide-react';
import { Anime } from '@/types/anime';
import {
  cn,
  normalizeRating,
  isValidAnimeYear,
  isValidEpisodeCount,
  isValidDurationLabel,
  pickAnimePoster,
  isPlaceholderAnimeDescription,
  normalizeAnimeGenresForDisplay,
  sanitizeAnimeStudiosForDisplay,
  sanitizeAnimeDurationForDisplay,
} from '@/lib/utils';
import { WatchHistory } from '@/lib/watch-history';
import { queryKeys } from '@/hooks/useAnime';
import { apiClient } from '@/lib/api-client';
import { apiUrl } from '@/lib/api-config';

interface AnimeCardProps {
  anime: Anime;
  className?: string;
  style?: React.CSSProperties;
  onMouseEnter?: () => void;
}

const TYPE_BADGE: Record<string, string> = {
  Movie:   'bg-violet-600/90',
  OVA:     'bg-amber-600/90',
  ONA:     'bg-emerald-600/90',
  Special: 'bg-rose-600/90',
  TV:      'bg-sky-600/90',
};

/**
 * Global cache of poster URLs that have been successfully loaded during this session.
 * Prevents image flicker when navigating back to the home page — re-mounted cards
 * initialize with imgLoaded=true if the same URL was loaded before.
 */
const loadedImageCache = new Set<string>();

export const AnimeCard = ({ anime, className, style, onMouseEnter }: AnimeCardProps) => {
  const navigateId = anime.streamingId || anime.id;
  const navigate   = useNavigate();
  const location   = useLocation();
  const posterSrc = pickAnimePoster(anime);
  const [imgLoaded, setImgLoaded] = useState(() => posterSrc ? loadedImageCache.has(posterSrc) : false);
  const [imgError,  setImgError]  = useState(false);
  const [useProxy,  setUseProxy]  = useState(false);
  const [hovered, setHovered] = useState(false);

  const historyItem = WatchHistory.get().find(h => h.animeId === anime.id);

  const needsDetail = isPlaceholderAnimeDescription(anime.description);

  const { data: detailAnime } = useQuery({
    queryKey: queryKeys.anime(navigateId),
    queryFn: () => apiClient.getAnime(navigateId),
    enabled: hovered && needsDetail,
    staleTime: 10 * 60 * 1000,
  });

  const merged = useMemo((): Anime => {
    if (!detailAnime) return anime;
    const desc = !isPlaceholderAnimeDescription(detailAnime.description)
      ? detailAnime.description
      : anime.description;
    return {
      ...anime,
      description: desc,
      genres: detailAnime.genres?.length ? detailAnime.genres : anime.genres,
      studios: detailAnime.studios?.length ? detailAnime.studios : anime.studios,
      titleJapanese: detailAnime.titleJapanese ?? anime.titleJapanese,
      rating: detailAnime.rating ?? anime.rating,
      year: detailAnime.year ?? anime.year,
      season: detailAnime.season ?? anime.season,
      episodes: detailAnime.episodes ?? anime.episodes,
      episodesAired: detailAnime.episodesAired ?? anime.episodesAired,
      duration: detailAnime.duration ?? anime.duration,
      subCount: detailAnime.subCount ?? anime.subCount,
      dubCount: detailAnime.dubCount ?? anime.dubCount,
    };
  }, [anime, detailAnime]);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const ep = historyItem ? `&ep=${historyItem.episodeNumber}` : '';
    navigate(`/watch?id=${encodeURIComponent(navigateId)}${ep}`, {
      state: { from: location.pathname + location.search },
    });
  };

  const rating     = normalizeRating(anime.rating);
  const hoverRating = normalizeRating(merged.rating);
  const typeColor  = TYPE_BADGE[anime.type] ?? 'bg-sky-600/90';
  const hasSub = (anime.subCount ?? 0) > 0;
  const hasDub = (anime.dubCount ?? 0) > 0;
  const hoverHasSub = (merged.subCount ?? 0) > 0;
  const hoverHasDub = (merged.dubCount ?? 0) > 0;

  const metaParts = [
    isValidAnimeYear(anime.year) ? String(anime.year) : null,
    anime.type === 'Movie'
      ? 'Film'
      : isValidEpisodeCount(anime.episodes)
        ? `${anime.episodes} eps`
        : null,
  ].filter(Boolean);

  const hoverGenres = useMemo(() => normalizeAnimeGenresForDisplay(merged.genres), [merged.genres]);
  const studioLine =
    sanitizeAnimeStudiosForDisplay(merged.studios)
      .slice(0, 2)
      .join(' · ') ?? '';
  const hoverDuration = sanitizeAnimeDurationForDisplay(merged.duration);
  const seasonYear = [merged.season, isValidAnimeYear(merged.year) ? merged.year : null]
    .filter((v) => v != null && v !== '')
    .join(' ');

  return (
    <a
      href={`/watch?id=${encodeURIComponent(navigateId)}`}
      style={style}
      onMouseEnter={(e) => {
        setHovered(true);
        onMouseEnter?.(e);
      }}
      onMouseLeave={() => setHovered(false)}
      onClick={handleClick}
      className={cn('group relative flex flex-col cursor-pointer touch-manipulation', className)}
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-zinc-900/90 ring-1 ring-white/[0.05] transition-all duration-300 group-hover:ring-white/15 group-hover:shadow-lg group-hover:shadow-black/40">

        {!posterSrc && (
          <div className="absolute inset-0 bg-zinc-900 flex flex-col items-center justify-center gap-2">
            <Film className="w-8 h-8 text-zinc-700" />
            <span className="text-[10px] text-zinc-600 text-center px-3 line-clamp-2">{anime.title}</span>
          </div>
        )}

        {posterSrc && (
          <>
            {!imgLoaded && !imgError && (
              <div className="absolute inset-0 bg-zinc-800/50 animate-pulse" />
            )}

            {imgError && (
              <div className="absolute inset-0 bg-zinc-900 flex flex-col items-center justify-center gap-2">
                <Film className="w-8 h-8 text-zinc-700" />
                <span className="text-[10px] text-zinc-600 text-center px-3 line-clamp-2">{anime.title}</span>
              </div>
            )}

            <img
              src={useProxy ? `${apiUrl('/api/image-proxy')}?url=${encodeURIComponent(posterSrc)}` : posterSrc}
              alt={anime.title}
              className={cn(
                'w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105',
                imgLoaded ? 'opacity-100' : 'opacity-0'
              )}
              loading="lazy"
              referrerPolicy="no-referrer"
              onLoad={() => {
                setImgLoaded(true);
                if (posterSrc) loadedImageCache.add(posterSrc);
              }}
              onError={() => {
                if (!useProxy && posterSrc) {
                  setUseProxy(true);
                } else {
                  setImgError(true);
                }
              }}
            />
          </>
        )}

        {/* Top-left: type badge */}
        <div className="absolute top-1.5 left-1.5 z-10">
          <span className={cn(
            'text-[10px] font-semibold px-1.5 py-[3px] rounded-md text-white backdrop-blur-sm',
            typeColor
          )}>
            {anime.type}
          </span>
        </div>

        {/* Top-right: rating */}
        {rating !== null && (
          <div className="absolute top-1.5 right-1.5 z-10">
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-white bg-black/60 backdrop-blur-sm px-1.5 py-[3px] rounded-md">
              <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
              {rating.toFixed(1)}
            </span>
          </div>
        )}

        {/* Bottom-left: SUB / DUB badges */}
        {(hasSub || hasDub) && (
          <div className="absolute bottom-1.5 left-1.5 z-10 flex gap-1">
            {hasSub && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-sky-300 bg-sky-950/80 backdrop-blur-sm px-1.5 py-[2px] rounded">
                <Subtitles className="w-2.5 h-2.5" />
                {anime.subCount}
              </span>
            )}
            {hasDub && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-green-300 bg-green-950/80 backdrop-blur-sm px-1.5 py-[2px] rounded">
                <Mic className="w-2.5 h-2.5" />
                {anime.dubCount}
              </span>
            )}
          </div>
        )}

        {/* Bottom-right: duration & airing indicator */}
        <div className="absolute bottom-1.5 right-1.5 z-10 flex flex-col items-end gap-1">
          {anime.duration && (
            <span className="px-1.5 py-[2px] rounded bg-black/70 backdrop-blur-md text-[9px] font-bold text-zinc-200 shadow-sm border border-white/5">
              {anime.duration}
            </span>
          )}
          {anime.status === 'Ongoing' && (
            <span className="flex items-center gap-1 px-1.5 py-[2px] rounded bg-black/70 backdrop-blur-md text-[9px] font-bold text-emerald-400 shadow-sm border border-white/5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Airing
            </span>
          )}
        </div>

        {/* Hover: full context — synopsis, genres, status, audio, CTA (does not hide the title below) */}
        <div
          className="absolute inset-0 z-20 pointer-events-none
                     opacity-0 translate-y-1
                     group-hover:opacity-100 group-hover:translate-y-0
                     transition-all duration-300 ease-out"
        >
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/95 to-zinc-950/40" />
          <div className="absolute inset-x-0 bottom-0 max-h-[92%] overflow-hidden flex flex-col justify-end px-2.5 pb-2 pt-8 gap-1.5 text-left">
            <p className="text-[11px] sm:text-xs font-bold text-white leading-tight line-clamp-2 drop-shadow-sm">
              {merged.title}
            </p>

            <div className="flex flex-wrap items-center gap-1">
              {hoverRating !== null && (
                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-200 bg-black/50 px-1.5 py-0.5 rounded border border-amber-500/20">
                  <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400 shrink-0" />
                  {hoverRating.toFixed(1)}
                </span>
              )}
              {seasonYear && (
                <span className="inline-flex items-center gap-0.5 text-[9px] text-zinc-300 bg-black/40 px-1.5 py-0.5 rounded border border-white/10">
                  <Calendar className="w-2.5 h-2.5 shrink-0 opacity-80" />
                  {seasonYear}
                </span>
              )}
              {isValidEpisodeCount(merged.episodes) && (
                <span className="text-[9px] text-zinc-200 bg-white/5 px-1.5 py-0.5 rounded border border-white/10">
                  {merged.episodes} episodes
                </span>
              )}
              {hoverDuration && (
                <span className="text-[9px] text-zinc-400">{hoverDuration}</span>
              )}
            </div>

            {hoverGenres.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {hoverGenres.slice(0, 5).map((g) => (
                  <span
                    key={g}
                    className="text-[8px] font-medium text-zinc-200 bg-white/10 px-1.5 py-0.5 rounded-md border border-white/5"
                  >
                    {g}
                  </span>
                ))}
                {hoverGenres.length > 5 && (
                  <span className="text-[8px] text-zinc-500">+{hoverGenres.length - 5}</span>
                )}
              </div>
            )}

            {studioLine && (
              <p className="text-[9px] text-zinc-400 flex items-start gap-1 line-clamp-2">
                <Building2 className="w-3 h-3 shrink-0 mt-0.5 opacity-70" />
                <span>{studioLine}</span>
              </p>
            )}

            <div className="flex flex-wrap items-center gap-1.5 pt-0.5 border-t border-white/10 mt-0.5">
              {(hoverHasSub || hoverHasDub) ? (
                <>
                  {hoverHasSub && (
                    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-sky-200 bg-sky-950/90 px-1.5 py-0.5 rounded border border-sky-500/25">
                      <Subtitles className="w-2.5 h-2.5" />
                      Sub{merged.subCount != null && merged.subCount > 0 ? ` · ${merged.subCount} eps` : ''}
                    </span>
                  )}
                  {hoverHasDub && (
                    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-green-200 bg-green-950/90 px-1.5 py-0.5 rounded border border-green-500/25">
                      <Mic className="w-2.5 h-2.5" />
                      Dub{merged.dubCount != null && merged.dubCount > 0 ? ` · ${merged.dubCount} eps` : ''}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-[9px] text-zinc-500">Audio availability varies by source</span>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 pt-0.5">
              {historyItem ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-fox-orange">
                  <Play className="w-3 h-3 fill-current" />
                  Continue episode {historyItem.episodeNumber}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-white">
                  <Play className="w-3 h-3 fill-fox-orange text-fox-orange" />
                  Watch now
                </span>
              )}
              <span className="text-[9px] text-zinc-500 shrink-0">{merged.type}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Title below card — always visible (hover no longer hides it) */}
      <div className="mt-2.5 px-0.5 flex flex-col gap-1 overflow-hidden">
        <p className="font-bold text-xs sm:text-[13px] text-zinc-200 group-hover:text-fox-orange line-clamp-2 leading-[1.15] tracking-tight transition-colors duration-200">
          {anime.title}
        </p>
        {metaParts.length > 0 && (
          <p className="text-[10.5px] font-medium text-zinc-500 leading-none">
            {metaParts.join(' · ')}
          </p>
        )}
      </div>
    </a>
  );
};
