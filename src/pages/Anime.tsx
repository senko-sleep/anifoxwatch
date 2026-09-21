import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertCircle, ArrowLeft, Check,
  Play, Search,
} from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { AnimeSlider } from '@/components/home/AnimeSlider';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useAnime, useAnimeArtwork, useBrowse, useEpisodeDetails, useEpisodes, useRelatedAnime, useSeasons } from '@/hooks/useAnime';
import { useHentaiTitle } from '@/hooks/useHentai';
import { useResolvedAnimeId } from '@/hooks/useResolvedAnimeId';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { WatchHistory } from '@/lib/watch-history';
import { animePath, watchPathForSlug } from '@/lib/routes';
import { apiUrl } from '@/lib/api-config';
import {
  atmosphereStyle,
  cn,
  ensureHttps,
  isPlaceholderAnimeDescription,
  normalizeAnimeGenresForDisplay,
} from '@/lib/utils';
import type { Episode } from '@/types/anime';
import type { EpisodeDetail } from '@/lib/kitsu-episodes';
import type { SeasonEntry } from '@/lib/anilist-home-queries';

/**
 * The title page — the room each anime gets to itself. Its cover colour lights
 * the header, its own artwork sets the mood, and everything a viewer needs to
 * decide (what it is, whether it's dubbed, where they left off) is answered
 * before the episode list begins.
 */
const EPISODE_PAGE_SIZE = 100;
const NO_EPISODES: Episode[] = [];

function plainText(raw: string | undefined | null): string {
  if (!raw) return '';
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .trim();
}

const AnimePage = ({ adult = false }: { adult?: boolean }) => {
  const { animeId: slug } = useParams<{ animeId: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  // Adult titles are routed at /hentai/<slug>; the route says so, the query doesn't have to.
  const mode = adult || searchParams.get('mode') === 'adult' ? 'adult' : 'safe';

  const { animeId, isResolving } = useResolvedAnimeId(slug, mode);
  // Adult titles come from the adult catalog alone — one request for the details and
  // the series' own episodes, never the generic endpoints (which fuzzy-match AniList).
  const isAdultPage = mode === 'adult';
  const hentaiTitle = useHentaiTitle(slug, isAdultPage);
  const animeQuery = useAnime(animeId, !isResolving && animeId.length > 0 && !isAdultPage);
  const episodesQuery = useEpisodes(animeId, !isResolving && animeId.length > 0 && !isAdultPage);

  const anime = isAdultPage ? hentaiTitle.data?.anime : animeQuery.data;
  const isLoading = isAdultPage ? hentaiTitle.isLoading : animeQuery.isLoading;
  const error = isAdultPage ? hentaiTitle.error : animeQuery.error;
  const episodesLoading = isAdultPage ? hentaiTitle.isLoading : episodesQuery.isLoading;
  const fetchedEpisodes = (isAdultPage ? hentaiTitle.data?.episodes : episodesQuery.data) ?? NO_EPISODES;

  const { data: details } = useEpisodeDetails(animeId, !isResolving && animeId.length > 0 && !isAdultPage);
  // Wide artwork for titles whose episodes have no stills (movies, brand-new shows).
  const { data: artwork } = useAnimeArtwork(animeId, !isResolving && !isAdultPage);
  const fallbackStill = artwork?.banner || artwork?.trailerThumb;

  // When the source returns no list, Kitsu (or the known episode count) still tells us what exists.
  const episodes = useMemo<Episode[]>(() => {
    if (fetchedEpisodes.length || episodesLoading) return fetchedEpisodes;
    // An adult title with no episodes has no source — a made-up list would lead nowhere.
    if (isAdultPage) return fetchedEpisodes;
    const numbers = details && details.size
      ? [...details.keys()].sort((a, b) => a - b)
      : Array.from({ length: Math.min(anime?.episodes || 0, 300) }, (_, i) => i + 1);
    return numbers.map((n) => ({
      id: `${animeId}-ep-${n}`,
      number: n,
      title: '',
      hasSub: true,
      hasDub: false,
      thumbnail: details?.get(n)?.thumbnail,
    }));
  }, [fetchedEpisodes, episodesLoading, details, anime?.episodes, animeId, isAdultPage]);

  // Rich rows (a still per episode) whenever we have pictures — from Kitsu, from the source, or,
  // for a lone episode (a movie), the title's own banner.
  const soleEpisodeStill = episodes.length === 1 ? fallbackStill : undefined;
  const hasDetails = useMemo(
    () =>
      Boolean(details && [...details.values()].some((d) => d.thumbnail || d.synopsis)) ||
      episodes.some((e) => e.thumbnail) ||
      Boolean(soleEpisodeStill),
    [details, episodes, soleEpisodeStill]
  );

  const navigate = useNavigate();
  const { data: seasons = [] } = useSeasons(animeId, !isResolving && animeId.length > 0 && !isAdultPage);
  const currentSeasonId = animeId.match(/^anilist-(\d+)$/)?.[1] ?? '';

  // Open the list already scrolled to where the viewer left off.
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>('[data-current]');
    if (list && row) list.scrollTop = Math.max(0, row.offsetTop - list.clientHeight / 3);
  }, [animeId, episodes.length, hasDetails]);

  useDocumentTitle(anime?.title ?? 'Anime');

  const [episodeQuery, setEpisodeQuery] = useState('');
  const [rangeStart, setRangeStart] = useState(0);

  // Re-read the history whenever the viewer comes back (from the player, another tab, a re-focus).
  const [historyTick, setHistoryTick] = useState(0);
  useEffect(() => {
    const bump = () => setHistoryTick((n) => n + 1);
    const onVisible = () => { if (!document.hidden) bump(); };
    window.addEventListener('focus', bump);
    window.addEventListener('storage', bump);
    window.addEventListener('pageshow', bump);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', bump);
      window.removeEventListener('storage', bump);
      window.removeEventListener('pageshow', bump);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const historyEntry = useMemo(
    () => WatchHistory.get().find((h) => h.animeId === animeId || h.animeId === anime?.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [animeId, anime?.id, historyTick]
  );

  const genres = useMemo(() => normalizeAnimeGenresForDisplay(anime?.genres), [anime?.genres]);
  const synopsis = plainText(anime?.description);
  const hasSynopsis = synopsis && !isPlaceholderAnimeDescription(synopsis);

  // "More like this" — franchise entries, then what AniList users recommend for this title.
  // AniList knows nothing about these titles' watchable siblings, so an adult page
  // draws its "more like this" from the same catalog it plays from: same first genre.
  const { data: related } = useRelatedAnime(
    mode === 'adult' ? undefined : anime?.id,
    mode === 'adult' ? undefined : anime?.titleEnglish || anime?.titleRomaji || anime?.title,
    false
  );
  const { data: sameGenre } = useBrowse(
    { genre: genres[0], mode: 'adult', sort: 'popularity' },
    1,
    mode === 'adult' && Boolean(genres[0]),
    false,
    30
  );
  const relatedItems = useMemo(
    () => (mode === 'adult' ? sameGenre?.results ?? [] : related ?? []).filter((r) => r.id !== anime?.id).slice(0, 18),
    [mode, related, sameGenre, anime?.id]
  );

  const ranges = useMemo(() => {
    if (episodes.length <= EPISODE_PAGE_SIZE) return [] as { start: number; label: string }[];
    const out: { start: number; label: string }[] = [];
    for (let i = 0; i < episodes.length; i += EPISODE_PAGE_SIZE) {
      const first = episodes[i]?.number ?? i + 1;
      const last = episodes[Math.min(i + EPISODE_PAGE_SIZE, episodes.length) - 1]?.number ?? i + EPISODE_PAGE_SIZE;
      out.push({ start: i, label: `${first} – ${last}` });
    }
    return out;
  }, [episodes]);

  const visibleEpisodes = useMemo(() => {
    const q = episodeQuery.trim().toLowerCase();
    const base = ranges.length ? episodes.slice(rangeStart, rangeStart + EPISODE_PAGE_SIZE) : episodes;
    if (!q) return base;
    return episodes.filter(
      (ep) => String(ep.number).includes(q) || (ep.title ?? '').toLowerCase().includes(q)
    );
  }, [episodes, episodeQuery, ranges.length, rangeStart]);


  const watchHref = (episode: number) =>
    watchPathForSlug(slug ?? '', episode, '', null, mode === 'adult');

  const firstEpisode = episodes[0]?.number ?? 1;

  // An episode past 92% counts as finished, so "where you left off" moves on to the next one.
  const finished = Boolean(historyEntry && historyEntry.progress >= 0.92);
  const lastNumber = historyEntry?.episodeNumber;
  const nextNumber = lastNumber != null ? episodes.find((e) => e.number > lastNumber)?.number : undefined;
  const resumeEpisode = lastNumber == null ? undefined : finished ? nextNumber ?? lastNumber : lastNumber;
  const inProgress = Boolean(historyEntry && !finished);
  const remainingLabel = (() => {
    if (!historyEntry || finished || !(historyEntry.duration > 0)) return undefined;
    const mins = Math.max(1, Math.round((historyEntry.duration - historyEntry.timestamp) / 60));
    return `${mins} min left`;
  })();
  const backHref = (location.state as { from?: string } | null)?.from;

  // The synopsis's first sentence leads; the rest sits quietly behind it.
  const [lead, rest] = (() => {
    const m = synopsis.match(/^(.{40,220}?[.!?…])(\s+[\s\S]*)?$/);
    return m ? [m[1].trim(), (m[2] ?? '').trim()] : [synopsis, ''];
  })();
  const beginEpisode = resumeEpisode ?? firstEpisode;
  const beginTitle = (() => {
    const own = episodes.find((e) => e.number === beginEpisode)?.title?.trim();
    if (own && own !== String(beginEpisode) && !/^episode\s*\d+$/i.test(own)) return own;
    return details?.get(beginEpisode)?.title;
  })();

  const beginStill =
    details?.get(beginEpisode)?.thumbnail ||
    episodes.find((e) => e.number === beginEpisode)?.thumbnail ||
    fallbackStill;

  // The alternate title only earns its line when it says something the main title doesn't.
  const altTitle = (() => {
    const alt = anime?.titleJapanese?.trim();
    if (!alt || !anime?.title) return '';
    const norm = (t: string) => t.toLowerCase().replace(/[×✕]/g, 'x').replace(/[^\p{L}\p{N}]+/gu, '');
    return norm(alt) === norm(anime.title) ? '' : alt;
  })();

  const poster = ensureHttps(anime?.coverImage || anime?.image || anime?.cover || '');

  if (!isResolving && !isLoading && (error || !anime)) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="page-x page-bottom flex min-h-[60vh] flex-col items-center justify-center text-center">
          <AlertCircle className="h-8 w-8 text-muted-foreground" />
          <h1 className="mt-4 font-display text-2xl">We couldn't load this title</h1>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            The source may be temporarily down, or this link may point at a title we no longer carry.
          </p>
          <div className="mt-6 flex gap-3">
            <Button asChild className="btn-ember rounded-full px-5"><Link to="/browse">Browse anime</Link></Button>
            <Button asChild variant="ghost" className="rounded-full"><Link to="/">Go home</Link></Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[hsl(236_38%_2.5%)]" style={atmosphereStyle(anime?.accentColor)}>
      <Navbar />

      {/* Info on the left; episodes + seasons live in their own sticky panel on the right. */}
      <div className="relative">
        {/* The room is dark. The only light is the poster's own colour, pooled behind it. */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <div
            className="absolute -left-36 -top-20 h-[36rem] w-[36rem] rounded-full opacity-[0.22] blur-[110px]"
            style={{ background: 'hsl(var(--atmos))' }}
          />
        </div>

        <div className={cn('page-x relative grid gap-x-14 gap-y-12 pt-6 sm:pt-10 lg:grid-cols-[minmax(0,1fr)_28rem]', relatedItems.length === 0 && 'page-bottom')}>
          <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <Link
            to={backHref || '/browse'}
            className="inline-flex items-center gap-2 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            {backHref ? 'Back' : 'Browse'}
          </Link>

          <div className="mt-8 flex flex-col gap-8 sm:flex-row sm:gap-10">
            {/* Poster */}
            <div className="relative w-40 shrink-0 sm:w-52 lg:w-60">
              <div
                aria-hidden
                className="absolute inset-3 rounded-2xl opacity-50 blur-2xl"
                style={{ background: 'hsl(var(--atmos))' }}
              />
              <div
                className="art-frame relative aspect-[2/3] w-full"
                style={{ boxShadow: '0 0 0 1px hsl(0 0% 100% / 0.08), 0 28px 70px -22px hsl(var(--atmos) / 0.6)' }}
              >
                {isLoading || isResolving ? (
                  <div className="absolute inset-0 skeleton rounded-none" />
                ) : poster ? (
                  <img
                    src={poster}
                    alt={anime?.title ?? ''}
                    className="absolute inset-0 h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const el = e.currentTarget as HTMLImageElement;
                      if (!el.dataset.proxied) {
                        el.dataset.proxied = '1';
                        el.src = `${apiUrl('/api/image-proxy')}?url=${encodeURIComponent(poster)}`;
                      }
                    }}
                  />
                ) : (
                  <div className="absolute inset-0 bg-[hsl(234_22%_11%)]" />
                )}
              </div>
            </div>

            {/* Title block */}
            <div className="flex min-w-0 flex-1 flex-col">
              {isLoading || isResolving ? (
                <div className="space-y-3">
                  <div className="skeleton h-9 w-2/3" />
                  <div className="skeleton h-4 w-1/3" />
                  <div className="skeleton h-16 w-full" />
                </div>
              ) : (
                <>
                  {genres.length > 0 && (
                    <p className="eyebrow mb-5 flex flex-wrap items-center gap-x-2.5 !text-[10.5px] text-muted-foreground/70">
                      {genres.slice(0, 3).map((g, i) => (
                        <span key={g} className="inline-flex items-center gap-2.5">
                          {i > 0 && <span className="opacity-40">·</span>}
                          <Link to={`/browse?genres=${encodeURIComponent(g)}`} className="transition-colors hover:text-foreground">
                            {g}
                          </Link>
                        </span>
                      ))}
                    </p>
                  )}

                  <h1 className="font-display text-2xl font-medium leading-[1.15] sm:text-3xl lg:text-[2.4rem]">
                    {anime?.title}
                  </h1>
                  {altTitle && (
                    <p className="mt-2 text-sm text-muted-foreground/70">{altTitle}</p>
                  )}

                  {hasSynopsis && (
                    <div className="mt-7 max-w-lg">
                      <p className="text-[1.0625rem] font-normal leading-[1.65] text-foreground/75">{lead}</p>
                      {rest && (
                        <Dialog>
                          <DialogTrigger asChild>
                            <button
                              type="button"
                              className="mt-3 inline-flex items-center gap-1 text-[12px] text-muted-foreground/70 transition-colors hover:text-foreground"
                            >
                              The full story
                            </button>
                          </DialogTrigger>
                          <DialogContent
                            style={atmosphereStyle(anime?.accentColor)}
                            className="max-h-[82vh] max-w-2xl gap-0 overflow-y-auto rounded-2xl border-white/[0.08] bg-[hsl(236_36%_4%)] p-8 shadow-[0_40px_120px_-30px_hsl(var(--atmos)_/_0.45)] sm:p-12"
                          >
                            <DialogTitle className="eyebrow !text-[10.5px] text-muted-foreground/70">
                              {anime?.title}
                            </DialogTitle>
                            <DialogDescription className="sr-only">Full synopsis</DialogDescription>
                            <div className="mt-8 space-y-6">
                              {synopsis.split(/\n\s*\n/).map((para, i) => (
                                <p
                                  key={i}
                                  className={cn(
                                    'whitespace-pre-line',
                                    i === 0
                                      ? 'text-[1.15rem] font-normal leading-[1.7] text-foreground/85'
                                      : 'text-[16px] leading-[1.95] text-foreground/60'
                                  )}
                                >
                                  {para.trim()}
                                </p>
                              ))}
                            </div>
                          </DialogContent>
                        </Dialog>
                      )}
                    </div>
                  )}

                  {/* An adult title no site carries: say so, rather than offer a Begin that leads nowhere. */}
                  {isAdultPage && episodes.length === 0 && !episodesLoading && (
                    <p className="mt-12 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
                      No site carries this title yet. It's listed so you can find it — it'll be playable once a source adds it.
                    </p>
                  )}

                  {/* The gate: the first frame of where you will be, not a button. */}
                  {(!isAdultPage || episodes.length > 0) && (
                  <Link
                    to={watchHref(beginEpisode)}
                    className="group/begin mt-12 flex items-center gap-5 sm:gap-6 lg:mt-auto lg:flex-col lg:items-start lg:gap-4 lg:pt-10 xl:flex-row xl:items-center xl:gap-6"
                  >
                    <span className="art-frame relative block aspect-video w-44 shrink-0 !rounded-xl shadow-[0_24px_60px_-20px_hsl(var(--atmos)_/_0.6)] sm:w-52">
                      {beginStill ? (
                        <img
                          src={ensureHttps(beginStill)}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover/begin:scale-[1.04]"
                        />
                      ) : (
                        <span className="absolute inset-0" style={{ background: 'hsl(var(--atmos) / 0.25)' }} />
                      )}
                      <span className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/5 to-transparent" />
                      {inProgress && historyEntry && (
                        <span className="absolute inset-x-0 bottom-0 h-[2px] bg-white/15">
                          <span
                            className="block h-full bg-[hsl(var(--atmos))]"
                            style={{ width: `${Math.round(Math.min(1, historyEntry.progress) * 100)}%` }}
                          />
                        </span>
                      )}
                      <span className="absolute inset-0 grid place-items-center">
                        <span className="grid h-12 w-12 place-items-center rounded-full bg-black/40 ring-1 ring-white/40 backdrop-blur-sm transition-all duration-500 group-hover/begin:scale-110 group-hover/begin:bg-black/60 group-hover/begin:ring-white/70">
                          <Play className="ml-0.5 h-4 w-4 fill-current" />
                        </span>
                      </span>
                    </span>
                    <span className="block min-w-0">
                      <span className="eyebrow block !text-[10px]">
                        {resumeEpisode ? (inProgress ? 'Where you left off' : 'Up next') : 'Begin'}
                      </span>
                      <span className="mt-2 block text-[15px] text-foreground/90">
                        Episode {beginEpisode}
                        {inProgress && remainingLabel && <span className="text-muted-foreground/70"> · {remainingLabel}</span>}
                      </span>
                      {beginTitle && (
                        <span className="mt-1 line-clamp-2 block text-[13px] leading-snug text-muted-foreground/80">{beginTitle}</span>
                      )}
                    </span>
                  </Link>
                  )}

                  {/* Announced but not released — the source only carries a teaser for these. */}
                  {anime?.status === 'Upcoming' && (
                    <p className="mt-4 max-w-sm text-[12.5px] leading-relaxed text-amber-300/80">
                      Coming soon — the source only has a preview clip so far.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
          </div>

        <aside
          aria-label="Episodes"
          className="min-w-0 lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1 lg:flex lg:max-h-[calc(100vh-7.5rem)] lg:gap-4 lg:self-start lg:pt-[3.25rem]"
        >
          {seasons.length > 1 && (
            <SeasonShelf
              seasons={seasons}
              currentId={currentSeasonId}
              onPick={(season) => navigate(animePath({ id: `anilist-${season.id}`, title: season.title }))}
            />
          )}

          <div className="min-w-0 flex-1 lg:flex lg:min-h-0 lg:flex-col">
          {episodes.length > 30 && (
            <label className="glass-input mb-5 flex h-10 w-full items-center gap-2 rounded-full px-4">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                value={episodeQuery}
                onChange={(e) => setEpisodeQuery(e.target.value)}
                placeholder="Find an episode"
                className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
              />
            </label>
          )}

          {ranges.length > 1 && !episodeQuery && (
            <div className="mb-3 flex flex-wrap gap-2">
              {ranges.map((r) => (
                <button
                  key={r.start}
                  type="button"
                  onClick={() => setRangeStart(r.start)}
                  className={cn('fox-chip', rangeStart === r.start ? 'fox-chip-active' : 'fox-chip-inactive')}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}

          {episodesLoading ? (
            <div className="grid gap-2">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="skeleton h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : visibleEpisodes.length === 0 ? (
            <p className="text-sm text-muted-foreground/70">
              {episodeQuery ? 'No episode matches that.' : 'Episodes will appear here once a source lists them.'}
            </p>
          ) : (
            <div
              ref={listRef}
              className="scrollbar-thin relative -mx-3 max-h-[34rem] min-h-0 overflow-y-auto px-3 lg:max-h-none lg:flex-1"
            >
            <ul
              className={
                hasDetails
                  ? 'space-y-2'
                  : 'grid gap-2'
              }
            >
              {visibleEpisodes.map((ep) => (
                <EpisodeRow
                  key={ep.id || ep.number}
                  episode={ep}
                  detail={details?.get(ep.number)}
                  stillFallback={soleEpisodeStill}
                  rich={hasDetails}
                  href={watchHref(ep.number)}
                  watched={lastNumber != null && (ep.number < lastNumber || (finished && ep.number === lastNumber))}
                  current={resumeEpisode === ep.number}
                  progress={inProgress && lastNumber === ep.number ? historyEntry?.progress : undefined}
                  remaining={inProgress && lastNumber === ep.number ? remainingLabel : undefined}
                />
              ))}
            </ul>
            </div>
          )}
          </div>
        </aside>

        </div>

        {relatedItems.length > 0 && (
          <section className="page-x page-bottom relative pt-14 sm:pt-20">
            <SectionHeader
              title="More like this"
              subtitle="Sequels, spin-offs and what fans recommend"
            />
            <AnimeSlider anime={relatedItems} />
          </section>
        )}
      </div>

      <Footer />
    </div>
  );
};

/**
 * Seasons as a shelf beside the episodes, not a control above them: bare numbers
 * on the list's edge, the current one marked by a thin accent line. Hovering
 * a number lifts a label with that season's title — nothing reflows.
 * On small screens it lies down as a plain row of text.
 */
const SeasonShelf = ({
  seasons,
  currentId,
  onPick,
}: {
  seasons: SeasonEntry[];
  currentId: string;
  onPick: (season: SeasonEntry) => void;
}) => (
  <nav aria-label="Seasons" className="mb-5 lg:mb-0 lg:w-8 lg:shrink-0">
    <ul className="scrollbar-none flex gap-6 overflow-x-auto lg:flex-col lg:gap-1 lg:overflow-visible">
      {seasons.map((season, i) => {
        const active = String(season.id) === currentId;
        return (
          <li key={season.id} className="group/season relative shrink-0">
            <button
              type="button"
              onClick={() => !active && onPick(season)}
              aria-current={active ? 'true' : undefined}
              aria-label={`Season ${i + 1}: ${season.title}`}
              className={cn(
                'relative flex h-9 items-center text-[13px] tabular-nums transition-colors duration-300 lg:w-8 lg:justify-center',
                active ? 'text-foreground' : 'text-muted-foreground/50 hover:text-foreground'
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'absolute left-0 top-2 hidden h-5 w-0.5 rounded-full bg-[hsl(var(--atmos))] transition-opacity duration-300 lg:block',
                  active ? 'opacity-100' : 'opacity-0'
                )}
              />
              <span className="lg:hidden">Season {i + 1}</span>
              <span className="hidden lg:inline">{i + 1}</span>
            </button>

            <span
              role="tooltip"
              className="pointer-events-none absolute left-full top-1/2 z-30 ml-3 hidden -translate-x-1 -translate-y-1/2 whitespace-nowrap rounded-lg bg-[hsl(236_34%_6%_/_0.92)] px-3 py-2 text-[12px] opacity-0 shadow-[0_12px_32px_-12px_hsl(236_40%_2%)] ring-1 ring-white/[0.08] backdrop-blur-md transition-all duration-300 group-focus-within/season:translate-x-0 group-focus-within/season:opacity-100 group-hover/season:translate-x-0 group-hover/season:opacity-100 lg:block"
            >
              <span className="block text-foreground/90">Season {i + 1}</span>
              <span className="block max-w-[16rem] truncate text-muted-foreground">
                {season.title}
                {season.episodes ? ` · ${season.episodes} eps` : ''}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  </nav>
);

/** One episode. With Kitsu data: a still and a two-line synopsis; without, the compact number tile. */
const EpisodeRow = ({
  episode,
  detail,
  stillFallback,
  rich,
  href,
  watched,
  current,
  progress,
  remaining,
}: {
  episode: Episode;
  detail?: EpisodeDetail;
  /** Picture to use when neither the details nor the episode have one. */
  stillFallback?: string;
  rich: boolean;
  href: string;
  watched: boolean;
  current: boolean;
  progress?: number;
  remaining?: string;
}) => {
  const pct = Math.round(Math.min(1, Math.max(0, progress ?? (watched ? 1 : 0))) * 100);
  const own = episode.title?.trim() && episode.title !== String(episode.number) ? episode.title : '';
  const title = own || detail?.title || `Episode ${episode.number}`;
  const still = detail?.thumbnail || episode.thumbnail || stillFallback;
  const tags = (
    <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
      {episode.hasSub && <span>Sub</span>}
      {episode.hasDub && <span>Dub</span>}
      {episode.isFiller && <span className="text-amber-300/80">Filler</span>}
      {current && <span className="text-[hsl(var(--atmos))]">Continue</span>}
    </span>
  );
  const frame = cn(
    'group flex rounded-xl border transition-colors duration-200',
    current
      ? 'border-[hsl(var(--atmos)_/_0.45)] bg-[hsl(var(--atmos)_/_0.1)]'
      : 'border-white/[0.06] bg-white/[0.025] hover:border-white/[0.14] hover:bg-white/[0.05]'
  );

  if (rich) {
    return (
      <li data-current={current || undefined}>
        <Link
          to={href}
          className={cn(
            'group flex items-center gap-4 rounded-lg px-1.5 py-3 transition-colors duration-300',
            current ? 'bg-[hsl(var(--atmos)_/_0.06)]' : ''
          )}
        >
          <div className="art-frame relative aspect-video w-32 shrink-0 !rounded-lg shadow-[0_12px_32px_-16px_hsl(var(--atmos)_/_0.4)]">
            {still ? (
              <img
                src={ensureHttps(still)}
                alt=""
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                className={cn('absolute inset-0 h-full w-full object-cover', watched && 'opacity-40')}
              />
            ) : (
              <span className="absolute inset-0 bg-white/[0.03]" />
            )}
            {pct > 0 && (
              <span className="absolute inset-x-0 bottom-0 h-[2px] bg-white/10">
                <span
                  className={cn('block h-full bg-[hsl(var(--atmos))]', !progress && 'opacity-40')}
                  style={{ width: `${pct}%` }}
                />
              </span>
            )}
          </div>

          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-[13px] font-medium text-foreground/90">
              <span className="truncate">{title}</span>
              {watched && <Check className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            </span>
            {detail?.synopsis && (
              <span className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground/80">
                {detail.synopsis}
              </span>
            )}
            {current && (
              <span className="mt-1 block text-[11px] text-[hsl(var(--atmos))]">
                {remaining ? `Continue · ${remaining}` : progress ? 'Continue' : 'Up next'}
              </span>
            )}
          </span>
        </Link>
      </li>
    );
  }

  return (
    <li data-current={current || undefined}>
      <Link to={href} className={cn(frame, 'items-center gap-3.5 p-3')}>
        <span
          className={cn(
            'grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[13px] font-semibold tabular-nums',
            current
              ? 'bg-[hsl(var(--atmos))] text-[hsl(234_30%_6%)]'
              : watched
                ? 'bg-white/[0.06] text-muted-foreground'
                : 'bg-white/[0.06] text-foreground/80'
          )}
        >
          {watched ? <Check className="h-4 w-4" /> : episode.number}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-foreground/85">{title}</span>
          <span className="mt-0.5 block">{tags}</span>
        </span>
        <Play className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </Link>
    </li>
  );
};

export default AnimePage;
