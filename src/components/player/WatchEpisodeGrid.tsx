import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Play, Search } from 'lucide-react';
import { cn, ensureHttps } from '@/lib/utils';
import type { Episode } from '@/types/anime';
import type { EpisodeDetail } from '@/lib/kitsu-episodes';

const PAGE_SIZE = 100;

interface WatchEpisodeGridProps {
  episodes: Episode[];
  details?: Map<number, EpisodeDetail>;
  currentEpisodeNum: number;
  onEpisodeSelect: (episodeId: string, episodeNum: number) => void;
  isLoading?: boolean;
  /** Progress 0–1 for the episode the viewer is partway through. */
  progressByEpisode?: Map<number, number>;
}

/**
 * The episode shelf beneath the player. Full width, so episodes read as a
 * gallery of stills rather than a cramped column — the same quiet treatment as
 * the title page: artwork carries it, chrome stays out of the way.
 */
export function WatchEpisodeGrid({
  episodes,
  details,
  currentEpisodeNum,
  onEpisodeSelect,
  isLoading = false,
  progressByEpisode,
}: WatchEpisodeGridProps) {
  const [query, setQuery] = useState('');
  const [rangeStart, setRangeStart] = useState(0);
  const currentRef = useRef<HTMLButtonElement>(null);

  const ranges = useMemo(() => {
    if (episodes.length <= PAGE_SIZE) return [] as { start: number; label: string }[];
    const out: { start: number; label: string }[] = [];
    for (let i = 0; i < episodes.length; i += PAGE_SIZE) {
      const first = episodes[i]?.number ?? i + 1;
      const last = episodes[Math.min(i + PAGE_SIZE, episodes.length) - 1]?.number ?? i + PAGE_SIZE;
      out.push({ start: i, label: `${first} – ${last}` });
    }
    return out;
  }, [episodes]);

  // Follow the player: when the episode changes, show the page it lives on.
  useEffect(() => {
    if (!ranges.length) return;
    const index = episodes.findIndex((e) => e.number === currentEpisodeNum);
    if (index >= 0) setRangeStart(Math.floor(index / PAGE_SIZE) * PAGE_SIZE);
  }, [currentEpisodeNum, episodes, ranges.length]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) {
      return episodes.filter(
        (ep) =>
          String(ep.number).includes(q) ||
          (ep.title ?? '').toLowerCase().includes(q) ||
          (details?.get(ep.number)?.title ?? '').toLowerCase().includes(q)
      );
    }
    return ranges.length ? episodes.slice(rangeStart, rangeStart + PAGE_SIZE) : episodes;
  }, [episodes, query, ranges.length, rangeStart, details]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="space-y-2.5">
            <div className="skeleton aspect-video w-full rounded-xl" />
            <div className="skeleton h-3 w-3/4 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (!episodes.length) {
    return (
      <p className="text-sm text-muted-foreground/70">
        Episodes will appear here once a source lists them.
      </p>
    );
  }

  return (
    <div>
      {(ranges.length > 1 || episodes.length > 12) && (
      <div className="mb-6 flex flex-wrap items-center gap-3">
        {ranges.length > 1 && !query && (
          <div className="flex flex-wrap gap-2">
            {ranges.map((r) => (
              <button
                key={r.start}
                type="button"
                onClick={() => setRangeStart(r.start)}
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-[12px] tabular-nums transition-colors duration-300',
                  rangeStart === r.start
                    ? 'bg-white/[0.08] text-foreground'
                    : 'text-muted-foreground/60 hover:text-foreground'
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}

        {episodes.length > 12 && (
          <label className="glass-input ml-auto flex h-9 w-full items-center gap-2 rounded-full px-4 sm:w-56">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find an episode"
              className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
            />
          </label>
        )}
      </div>
      )}

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground/70">No episode matches that.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visible.map((ep) => {
            const detail = details?.get(ep.number);
            const own =
              ep.title?.trim() && ep.title !== String(ep.number) && !/^episode\s*\d+$/i.test(ep.title)
                ? ep.title
                : '';
            const title = own || detail?.title || '';
            const still = detail?.thumbnail || ep.thumbnail;
            const current = ep.number === currentEpisodeNum;
            const progress = progressByEpisode?.get(ep.number) ?? 0;
            const watched = !current && progress >= 0.92;
            const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100);

            return (
              <li key={ep.id || ep.number}>
                <button
                  ref={current ? currentRef : undefined}
                  type="button"
                  onClick={() => onEpisodeSelect(ep.id, ep.number)}
                  className="group block w-full text-left"
                  aria-current={current || undefined}
                >
                  <span
                    className={cn(
                      'art-frame relative block aspect-video w-full !rounded-xl',
                      current && 'ring-1 ring-[hsl(var(--atmos))]'
                    )}
                  >
                    {still ? (
                      <img
                        src={ensureHttps(still)}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        className={cn(
                          'absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]',
                          watched && 'opacity-40'
                        )}
                      />
                    ) : (
                      <span className="absolute inset-0 grid place-items-center bg-white/[0.03] text-lg tabular-nums text-foreground/25">
                        {ep.number}
                      </span>
                    )}

                    <span
                      className={cn(
                        'absolute inset-0 bg-black/30 opacity-0 transition-opacity duration-300 group-hover:opacity-100',
                        current && 'opacity-100'
                      )}
                    />
                    <span
                      className={cn(
                        'absolute inset-0 grid place-items-center opacity-0 transition-opacity duration-300 group-hover:opacity-100',
                        current && 'opacity-100'
                      )}
                    >
                      <span className="grid h-10 w-10 place-items-center rounded-full bg-black/50 ring-1 ring-white/50 backdrop-blur-sm">
                        <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />
                      </span>
                    </span>

                    {pct > 0 && (
                      <span className="absolute inset-x-0 bottom-0 h-[2px] bg-white/15">
                        <span
                          className="block h-full bg-[hsl(var(--atmos))]"
                          style={{ width: `${pct}%` }}
                        />
                      </span>
                    )}
                  </span>

                  <span className="mt-2.5 flex items-center gap-2">
                    <span
                      className={cn(
                        'text-[12px] tabular-nums',
                        current ? 'text-[hsl(var(--atmos))]' : 'text-muted-foreground/60'
                      )}
                    >
                      {ep.number}
                    </span>
                    <span
                      className={cn(
                        'truncate text-[13px]',
                        current ? 'text-foreground' : 'text-foreground/80'
                      )}
                    >
                      {title || `Episode ${ep.number}`}
                    </span>
                    {watched && <Check className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
