import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Info, Play, RefreshCw } from 'lucide-react';
import { AnimeSlider } from '@/components/home/AnimeSlider';
import { ContinueWatching } from '@/components/home/ContinueWatching';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { useHentaiHome } from '@/hooks/useHentai';
import { useWatchHistory } from '@/hooks/useWatchHistory';
import { animePath, watchPath } from '@/lib/routes';
import { atmosphereStyle, cn, ensureHttps } from '@/lib/utils';
import type { Anime } from '@/types/anime';

const browseGenre = (name: string) => `/browse?mode=adult&genres=${encodeURIComponent(name)}`;

/**
 * The adult catalog's default screen: what's featured, what's coming, what's new,
 * and a few genre shelves — from its own API, the same way the anime side has
 * curated home rows. Everything here is real data from the source: poster,
 * synopsis, rating, episode count.
 */
export const HentaiHome = () => {
  const { data, isLoading, error, refetch, isFetching } = useHentaiHome();
  const { history, removeFromHistory } = useWatchHistory();
  const adultHistory = useMemo(() => history.filter((item) => item.isAdult), [history]);

  if (isLoading) {
    return (
      <div className="space-y-10" aria-busy>
        <div className="skeleton h-[22rem] w-full rounded-2xl" />
        {[0, 1].map((i) => (
          <div key={i} className="space-y-3">
            <div className="skeleton h-5 w-40 rounded" />
            <div className="flex gap-4 overflow-hidden">
              {Array.from({ length: 7 }).map((_, j) => (
                <div key={j} className="skeleton aspect-[2/3] w-40 shrink-0 rounded-xl" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error || !data || (!data.featured.length && !data.sections.length)) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <p className="text-sm text-muted-foreground">The adult catalog isn't reachable right now.</p>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="mt-4 inline-flex h-9 items-center gap-2 rounded-full px-4 text-[13px] text-foreground/80 ring-1 ring-white/[0.1] transition-colors hover:bg-white/[0.05] disabled:opacity-50"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
          Try again
        </button>
      </div>
    );
  }

  const nameForSlug = (slug: string, fallback: string) => data.genres.find((g) => g.slug === slug)?.name ?? fallback;
  // Keep the home surface intentionally edited; the complete taxonomy belongs
  // to Browse's persistent Filters panel rather than competing with the hero.
  const curatedGenreNames = ['Action', 'Comedy', 'Ecchi', 'Fantasy', 'Harem', 'Romance', 'School', 'Supernatural'];
  const curatedGenres = [
    ...curatedGenreNames
      .map((name) => data.genres.find((genre) => genre.name.toLowerCase() === name.toLowerCase()))
      .filter((genre): genre is (typeof data.genres)[number] => Boolean(genre)),
    ...data.genres.filter((genre) => !curatedGenreNames.some((name) => genre.name.toLowerCase() === name.toLowerCase())),
  ].slice(0, 8);

  return (
    <div className="space-y-12">
      {adultHistory.length > 0 && (
        <section>
          <SectionHeader title="Pick up where you left off" />
          <ContinueWatching items={adultHistory} onRemove={removeFromHistory} />
        </section>
      )}

      {data.featured.length > 0 && <Featured items={data.featured} />}

      {data.genres.length > 0 && (
        <section aria-label="Discover by genre" className="border-y border-white/[0.06] py-4 sm:py-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/65">Browse by mood</p>
              <p className="mt-1 text-sm text-foreground/75">A few starting points from the catalog.</p>
            </div>
            <p className="text-xs text-muted-foreground/60">More genres are in Filters.</p>
          </div>

          <div className="mt-3 flex flex-wrap gap-x-1 gap-y-1.5">
            {curatedGenres.map((genre) => (
              <Link
                key={genre.slug}
                to={browseGenre(genre.name)}
                className="rounded-md px-2.5 py-1 text-[12px] text-muted-foreground ring-1 ring-white/[0.08] transition-colors hover:bg-white/[0.04] hover:text-foreground hover:ring-white/[0.16] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
              >
                {genre.name}
              </Link>
            ))}
          </div>

        </section>
      )}

      {data.sections.map((section) => (
        <section key={section.key}>
          <SectionHeader
            title={section.title}
            subtitle={section.subtitle}
            link={section.genre ? browseGenre(nameForSlug(section.genre, section.title)) : undefined}
          />
          <AnimeSlider anime={section.items} />
        </section>
      ))}
    </div>
  );
};

/** One featured title at a time, with its own cover as the light. Calm — it never auto-advances. */
const Featured = ({ items }: { items: Anime[] }) => {
  const [index, setIndex] = useState(0);
  const location = useLocation();
  const item = items[Math.min(index, items.length - 1)];
  const from = { from: location.pathname + location.search };

  const facts = [
    item.year,
    item.episodes > 0 ? `${item.episodes} episode${item.episodes === 1 ? '' : 's'}` : null,
    item.studios?.[0],
    item.uncensored ? 'Uncensored' : null,
  ].filter(Boolean);

  const poster = ensureHttps(item.image);
  // AniList's wide banner makes a better backdrop than a stretched poster, when there is one.
  const backdrop = ensureHttps(item.banner || item.image);
  const upcoming = item.status === 'Upcoming';
  const playable = !item.watchableOn || item.watchableOn.length > 0;

  return (
    <section aria-label="Featured" style={atmosphereStyle(item.accentColor)}>
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-[hsl(234_28%_7%)]">
        {backdrop && (
          <img
            src={backdrop}
            alt=""
            aria-hidden
            referrerPolicy="no-referrer"
            className={cn('absolute inset-0 h-full w-full object-cover', item.banner ? 'opacity-40' : 'scale-110 opacity-30 blur-3xl')}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-[hsl(234_32%_5%_/_0.9)] via-[hsl(234_32%_5%_/_0.6)] to-[hsl(234_32%_5%_/_0.3)]" />

        <div className="relative flex flex-col gap-6 p-5 sm:flex-row sm:items-end sm:p-8 lg:p-10">
          <Link
            to={animePath(item)}
            aria-hidden
            tabIndex={-1}
            className="art-frame relative block aspect-[2/3] w-28 shrink-0 sm:w-40 lg:w-48"
          >
            {poster && (
              <img
                src={poster}
                alt=""
                referrerPolicy="no-referrer"
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}
          </Link>

          <div className="min-w-0 flex-1">
            <p className="eyebrow text-[hsl(var(--primary))]">{upcoming ? 'Coming soon' : 'Featured'}{!playable && <span className="ml-2 text-muted-foreground">· No source yet</span>}</p>
            <h2 className="mt-2 text-2xl font-semibold leading-tight sm:text-3xl">{item.title}</h2>

            <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
              {item.rating ? <span className="font-medium text-amber-200">★ {item.rating.toFixed(1)}</span> : null}
              {facts.map((f) => (
                <span key={String(f)}>{f}</span>
              ))}
            </p>

            {item.description && (
              <p className="mt-4 line-clamp-3 max-w-2xl text-[14px] leading-relaxed text-foreground/65">
                {item.description}
              </p>
            )}

            {item.genres.length > 0 && (
              <p className="mt-3 flex flex-wrap gap-x-2 text-[12px] text-muted-foreground/70">
                {item.genres.slice(0, 4).map((g, i) => (
                  <span key={g}>
                    {i > 0 && <span className="mr-2 opacity-40">·</span>}
                    {g}
                  </span>
                ))}
              </p>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-2.5">
              {!upcoming && playable && (
                <Link
                  to={watchPath(item, 1)}
                  state={from}
                  className="btn-ember inline-flex h-11 items-center gap-2 rounded-full px-6 text-sm font-semibold"
                >
                  <Play className="h-4 w-4 fill-current" />
                  Watch
                </Link>
              )}
              <Link
                to={animePath(item)}
                state={from}
                className="glass-button inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-medium text-foreground/85"
              >
                <Info className="h-4 w-4" />
                Details
              </Link>
            </div>
          </div>
        </div>
      </div>

      {items.length > 1 && (
        <ul className="scrollbar-none mt-3 flex gap-2.5 overflow-x-auto pb-1">
          {items.map((it, i) => (
            <li key={it.id} className="shrink-0">
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Feature ${it.title}`}
                aria-current={i === index}
                className={cn(
                  'art-frame relative block aspect-[2/3] w-12 transition-opacity duration-300 sm:w-14',
                  i === index ? 'ring-2 ring-[hsl(var(--primary))] ring-offset-2 ring-offset-background' : 'opacity-50 hover:opacity-100'
                )}
              >
                {it.image && (
                  <img
                    src={ensureHttps(it.image)}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
