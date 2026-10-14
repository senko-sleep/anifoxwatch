import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertCircle, ArrowLeft, BookOpen, Check,
  ListVideo, Play, Search, Star,
} from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { AnimeSlider } from '@/components/home/AnimeSlider';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useAnime, useAnimeArtwork, useBrowse, useEpisodeDetails, useEpisodes, usePrefetchNextEpisode, useRelatedAnime, useSeasons } from '@/hooks/useAnime';
import { useHentaiTitle } from '@/hooks/useHentai';
import { useResolvedAnimeId } from '@/hooks/useResolvedAnimeId';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { WatchHistory } from '@/lib/watch-history';
import { animePath, animeSlug, watchPathForSlug } from '@/lib/routes';
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

  const { data: details } = useEpisodeDetails(animeId, !isResolving && animeId.length > 0 && !isAdultPage, anime?.title);
  // Wide artwork for titles whose episodes have no stills (movies, brand-new shows).
  const { data: artwork } = useAnimeArtwork(animeId, !isResolving && !isAdultPage);
  const fallbackStill = artwork?.banner || artwork?.trailerThumb;
  // Some providers expose an episode list but no per-episode thumbnails. Keep
  // the shelf visual by falling back to the title artwork; Kitsu/source stills
  // remain preferred by EpisodeRow whenever they exist.
  const episodeStillFallback = fallbackStill || anime?.banner || anime?.cover || anime?.image;

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
  const hasDetails = useMemo(
    () =>
      Boolean(details && [...details.values()].some((d) => d.thumbnail || d.synopsis)) ||
      episodes.some((e) => e.thumbnail) ||
      Boolean(episodeStillFallback),
    [details, episodes, episodeStillFallback]
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


  // Build player links from the resolved title, not the incoming legacy URL.
  // That drops stale AniList/source identifiers while the backend retains the
  // source mapping needed to fetch episodes.
  const watchHref = (episode: number) =>
    watchPathForSlug(anime ? animeSlug(anime) : slug ?? '', episode, '', null, mode === 'adult');

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

  // Resolving a stream takes seconds; start it for the episode the Watch button opens while
  // the visitor is still reading this page. The API keeps the answer, so the player's own
  // request for it returns immediately.
  const prefetchEpisode = usePrefetchNextEpisode();
  const beginEpisodeId = episodes.find((e) => e.number === beginEpisode)?.id;
  useEffect(() => {
    if (isAdultPage || !beginEpisodeId || !animeId.startsWith('anilist-')) return;
    const anilistId = parseInt(animeId.slice('anilist-'.length), 10) || undefined;
    prefetchEpisode(animeId, beginEpisodeId, 'sub', beginEpisode, anilistId, anime?.title);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per episode, not per render
  }, [animeId, beginEpisodeId, isAdultPage]);

  // The alternate title only earns its line when it says something the main title doesn't.
  const altTitle = (() => {
    const alt = anime?.titleJapanese?.trim();
    if (!alt || !anime?.title) return '';
    const norm = (t: string) => t.toLowerCase().replace(/[×✕]/g, 'x').replace(/[^\p{L}\p{N}]+/gu, '');
    return norm(alt) === norm(anime.title) ? '' : alt;
  })();

  const poster = ensureHttps(anime?.coverImage || anime?.image || anime?.cover || '');
  const bannerArt = anime?.bannerImage || anime?.banner || artwork?.banner || '';

  // A tall, faint column of the native title on the page edge — the abstract, editorial touch.
  const nativeTitle = anime?.titleJapanese?.trim() || '';
  const verticalTitle = /[぀-ヿ一-鿿]/.test(nativeTitle) ? nativeTitle.split(/[:：(（「～〜]/)[0].trim().slice(0, 18) : '';

  const kicker = [
    anime?.type === 'Movie' ? 'Film' : anime?.type,
    anime?.season && anime?.year
      ? `${anime.season[0].toUpperCase()}${anime.season.slice(1).toLowerCase()} ${anime.year}`
      : anime?.year ? String(anime.year) : null,
    anime?.studios?.[0],
  ].filter(Boolean) as string[];


  const wideArt = bannerArt ? ensureHttps(bannerArt) : poster;
  const scoreValue = anime?.rating
    ? (Number(anime.rating) > 10 ? Number(anime.rating) / 10 : Number(anime.rating)).toFixed(1)
    : null;
  const airingIn = (() => {
    const secs = anime?.timeUntilAiring;
    if (!anime?.nextAiringEpisode || !secs || secs <= 0) return null;
    const mins = Math.floor(secs / 60);
    const d = Math.floor(mins / 1440);
    const h = Math.floor((mins % 1440) / 60);
    return `Episode ${anime.nextAiringEpisode} in ${d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${mins % 60}m` : `${mins}m`}`;
  })();
  const totalEpisodes = anime?.episodes || episodes.length;
  const meta = [
    scoreValue ? { key: 'score', value: scoreValue, tone: 'is-score' } : null,
    totalEpisodes
      ? {
          key: 'eps',
          value:
            anime?.status === 'Ongoing' && episodes.length && anime?.episodes
              ? `${episodes.length} of ${anime.episodes} episodes`
              : `${totalEpisodes} episode${totalEpisodes === 1 ? '' : 's'}`,
        }
      : null,
    anime?.status
      ? { key: 'status', value: anime.status === 'Ongoing' ? 'Airing' : anime.status, tone: anime.status === 'Ongoing' ? 'is-live' : undefined }
      : null,
    airingIn ? { key: 'next', value: airingIn, tone: 'is-next' } : null,
  ].filter(Boolean) as { key: string; value: string; tone?: string }[];

  const hasDub = Boolean(anime?.dubCount) || episodes.some((e) => e.hasDub);
  const premiered = [
    anime?.season ? anime.season[0].toUpperCase() + anime.season.slice(1).toLowerCase() : '',
    anime?.year ?? '',
  ].join(' ').trim();
  const facts = [
    anime?.type ? { label: 'Format', value: anime.type === 'Movie' ? 'Film' : anime.type } : null,
    premiered ? { label: 'Premiered', value: premiered } : null,
    anime?.studios?.[0] ? { label: 'Studio', value: anime.studios[0] } : null,
    anime?.duration ? { label: 'Runtime', value: anime.duration.replace(/\s*per ep\.?/i, '') } : null,
    anime ? { label: 'Audio', value: hasDub ? 'Sub · Dub' : 'Sub' } : null,
    scoreValue ? { label: 'Score', value: scoreValue, tone: 'is-score' } : null,
  ].filter(Boolean) as { label: string; value: string; tone?: string }[];

  const isFilm = anime?.type === 'Movie' && episodes.length <= 1;
  const playLabel = inProgress
    ? `Continue episode ${beginEpisode}`
    : resumeEpisode
      ? `Up next: episode ${beginEpisode}`
      : isFilm
        ? 'Watch film'
        : `Watch episode ${beginEpisode}`;
  const playHint = inProgress ? remainingLabel : beginTitle && !isFilm ? beginTitle : undefined;
  const episodeSummary = episodes.length
    ? [
        anime?.status === 'Ongoing' && anime?.episodes
          ? `${episodes.length} of ${anime.episodes} out`
          : `${episodes.length} episode${episodes.length === 1 ? '' : 's'}`,
        hasDub ? 'Sub & Dub' : 'Subbed',
      ].join(' · ')
    : '';

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
    <div className="title-page relative min-h-screen bg-[hsl(236_38%_2.5%)]" style={atmosphereStyle(anime?.accentColor)}>
      <Navbar />

      {/* Stage: the title's own art, full-bleed under the bar, dissolving into the room below. */}
      <section className="title-stage">
        <div className="title-stage-art" aria-hidden>
          {wideArt && (
            <img src={wideArt} alt="" referrerPolicy="no-referrer" className={cn('title-stage-wide', !bannerArt && 'is-soft')} />
          )}
          {poster && <img src={poster} alt="" referrerPolicy="no-referrer" className="title-stage-tall" />}
          <div className="title-stage-shade" />
        </div>

        <div className="page-x title-grid title-stage-grid">
          <div className="title-stage-copy">
            <Link to={backHref || '/browse'} className="title-back">
              <ArrowLeft className="h-4 w-4" />
              {backHref ? 'Back' : 'Browse'}
            </Link>

            {isLoading || isResolving ? (
              <div className="title-copy space-y-3">
                <div className="skeleton h-3 w-40" />
                <div className="skeleton h-14 w-3/4" />
                <div className="skeleton h-4 w-1/2" />
                <div className="skeleton h-16 w-full max-w-xl" />
              </div>
            ) : (
              <div className="title-copy">
                {kicker.length > 0 && (
                  <p className="title-eyebrow">
                    {kicker.map((k, i) => (
                      <span key={k}>
                        {i > 0 && <i aria-hidden>·</i>}
                        {k}
                      </span>
                    ))}
                  </p>
                )}

                <h1 className={cn('title-name', (anime?.title?.length ?? 0) > 34 && 'is-long', (anime?.title?.length ?? 0) > 60 && 'is-longer')}>
                  {anime?.title}
                </h1>

                {meta.length > 0 && (
                  <p className="title-meta">
                    {meta.map((m) => (
                      <span key={m.key} className={m.tone}>
                        {m.key === 'score' && <Star className="h-3.5 w-3.5 fill-current" />}
                        {m.key === 'status' && m.tone === 'is-live' && <i className="title-live-dot" aria-hidden />}
                        {m.value}
                      </span>
                    ))}
                  </p>
                )}

                {hasSynopsis && <p className="title-synopsis">{lead}</p>}

                {genres.length > 0 && (
                  <div className="title-genres">
                    {genres.slice(0, 4).map((g) => (
                      <Link key={g} to={`/browse?genres=${encodeURIComponent(g)}`}>
                        {g}
                      </Link>
                    ))}
                  </div>
                )}

                {isAdultPage && episodes.length === 0 && !episodesLoading ? (
                  <p className="title-note">
                    No site carries this title yet. It's listed so you can find it — it'll be playable once a source adds it.
                  </p>
                ) : (
                  <div className="title-actions">
                    <Link to={watchHref(beginEpisode)} className="btn-ember title-play">
                      <Play className="h-4 w-4 fill-current" />
                      {playLabel}
                      {inProgress && historyEntry && (
                        <span className="title-play-progress" aria-hidden>
                          <span style={{ width: `${Math.round(Math.min(1, historyEntry.progress) * 100)}%` }} />
                        </span>
                      )}
                    </Link>
                    {hasSynopsis && rest ? (
                      <Dialog>
                        <DialogTrigger asChild>
                          <button type="button" className="title-ghost">
                            <BookOpen className="h-4 w-4" />
                            Full story
                          </button>
                        </DialogTrigger>
                        <DialogContent
                          style={atmosphereStyle(anime?.accentColor)}
                          className="max-h-[82vh] max-w-2xl gap-0 overflow-y-auto rounded-2xl border-white/[0.08] bg-[hsl(236_36%_4%)] p-8 shadow-[0_40px_120px_-30px_hsl(var(--atmos)_/_0.45)] sm:p-12"
                        >
                          <DialogTitle className="eyebrow !text-[10.5px] text-muted-foreground/70">{anime?.title}</DialogTitle>
                          <DialogDescription className="sr-only">Full synopsis</DialogDescription>
                          <div className="mt-8 space-y-6">
                            {synopsis.split(/\n\s*\n/).map((para, i) => (
                              <p
                                key={i}
                                className={cn(
                                  'whitespace-pre-line',
                                  i === 0 ? 'text-[1.15rem] leading-[1.7] text-foreground/85' : 'text-[16px] leading-[1.95] text-foreground/60'
                                )}
                              >
                                {para.trim()}
                              </p>
                            ))}
                          </div>
                        </DialogContent>
                      </Dialog>
                    ) : (
                      <a href="#episodes" className="title-ghost">
                        <ListVideo className="h-4 w-4" />
                        Episodes
                      </a>
                    )}
                    {playHint && <span className="title-play-hint">{playHint}</span>}
                  </div>
                )}

                {anime?.status === 'Upcoming' && (
                  <p className="title-note text-amber-300/80">Coming soon — the source only has a preview clip so far.</p>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <div className={cn('page-x title-grid title-body', relatedItems.length === 0 && 'page-bottom')}>
        {/* Key art: rises out of the stage into the page, carrying the title's own light with it. */}
        <aside className="title-aside" aria-label="About this title">
          <div
            className="title-poster"
            onMouseMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              e.currentTarget.style.setProperty('--rx', `${(((e.clientX - r.left) / r.width - 0.5) * 8).toFixed(2)}deg`);
              e.currentTarget.style.setProperty('--ry', `${(-((e.clientY - r.top) / r.height - 0.5) * 8).toFixed(2)}deg`);
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.setProperty('--rx', '0deg');
              e.currentTarget.style.setProperty('--ry', '0deg');
            }}
          >
            {verticalTitle && <span className="title-poster-native" aria-hidden>{verticalTitle}</span>}
            <div className="title-poster-frame">
              {isLoading || isResolving ? (
                <div className="absolute inset-0 skeleton rounded-none" />
              ) : poster ? (
                <img
                  src={poster}
                  alt={anime?.title ?? ''}
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
              <span className="title-poster-sheen" aria-hidden />
            </div>
          </div>

          {facts.length > 0 && (
            <dl className="title-facts">
              {facts.map((f) => (
                <div key={f.label}>
                  <dt>{f.label}</dt>
                  <dd className={f.tone}>{f.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {altTitle && <p className="title-alt">{altTitle}</p>}
        </aside>

        <section id="episodes" aria-label="Episodes" className="title-episodes">
          <header className="title-ep-head">
            <div className="min-w-0">
              <h2>Episodes</h2>
              {episodeSummary && <p>{episodeSummary}</p>}
            </div>
            {episodes.length > 30 && (
              <label className="title-ep-search">
                <Search className="h-4 w-4 shrink-0" />
                <input
                  value={episodeQuery}
                  onChange={(e) => setEpisodeQuery(e.target.value)}
                  placeholder="Find an episode"
                  aria-label="Find an episode"
                />
              </label>
            )}
          </header>

          {seasons.length > 1 && (
            <SeasonTabs
              seasons={seasons}
              currentId={currentSeasonId}
              onPick={(season) => navigate(animePath({ id: `anilist-${season.id}`, title: season.title }))}
            />
          )}

          {ranges.length > 1 && !episodeQuery && (
            <div className="title-ranges">
              {ranges.map((r) => (
                <button
                  key={r.start}
                  type="button"
                  onClick={() => setRangeStart(r.start)}
                  aria-pressed={rangeStart === r.start}
                  className={cn(rangeStart === r.start && 'is-active')}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}

          {episodesLoading ? (
            <div className="title-ep-list is-rich">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 py-2">
                  <div className="skeleton aspect-video w-40 shrink-0 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <div className="skeleton h-3.5 w-2/3" />
                    <div className="skeleton h-3 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : visibleEpisodes.length === 0 ? (
            <p className="title-note">
              {episodeQuery ? 'No episode matches that.' : 'Episodes will appear here once a source lists them.'}
            </p>
          ) : (
            <div ref={listRef} className={cn('title-ep-scroll scrollbar-thin', visibleEpisodes.length > (hasDetails ? 8 : 60) && 'is-capped')}>
              <ul className={cn('title-ep-list', hasDetails ? 'is-rich' : 'is-tiles')}>
                {visibleEpisodes.map((ep, i) => (
                  <EpisodeRow
                    key={ep.id || ep.number}
                    index={i}
                    episode={ep}
                    detail={details?.get(ep.number)}
                    stillFallback={episodeStillFallback}
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
        </section>
      </div>

      {relatedItems.length > 0 && (
        <section className="page-x page-bottom relative pt-16 sm:pt-24">
          <SectionHeader title="More like this" subtitle="Sequels, spin-offs and what fans recommend" />
          <AnimeSlider anime={relatedItems} />
        </section>
      )}

      <Footer />
    </div>
  );
};

/** Seasons as quiet text tabs above the list; the current one carries the accent underline. */
const SeasonTabs = ({
  seasons,
  currentId,
  onPick,
}: {
  seasons: SeasonEntry[];
  currentId: string;
  onPick: (season: SeasonEntry) => void;
}) => (
  <nav aria-label="Seasons" className="title-seasons scrollbar-none">
    {seasons.map((season, i) => {
      const active = String(season.id) === currentId;
      return (
        <button
          key={season.id}
          type="button"
          onClick={() => !active && onPick(season)}
          aria-current={active ? 'true' : undefined}
          title={`${season.title}${season.episodes ? ` · ${season.episodes} eps` : ''}`}
          className={cn(active && 'is-active')}
        >
          Season {i + 1}
          {season.year && <small>{season.year}</small>}
        </button>
      );
    })}
  </nav>
);

/** One episode. With stills: a wide frame and a two-line synopsis; without, a compact number tile. */
const EpisodeRow = ({
  index,
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
  index: number;
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
  const raw = episode.title?.trim() ?? '';
  const own = raw && raw !== String(episode.number) && !/^episode\s*\d+$/i.test(raw) ? raw : '';
  const named = own || detail?.title || '';
  const still = detail?.thumbnail || episode.thumbnail || stillFallback;
  const delay = { '--i': Math.min(index, 12) } as React.CSSProperties;

  if (!rich) {
    return (
      <li data-current={current || undefined} style={delay}>
        <Link
          to={href}
          title={named ? `Episode ${episode.number} — ${named}` : `Episode ${episode.number}`}
          className={cn('ep-tile', current && 'is-current', watched && 'is-watched')}
        >
          {watched && !current ? <Check className="h-4 w-4" /> : episode.number}
          {pct > 0 && current && <span className="ep-tile-progress" style={{ width: `${pct}%` }} />}
        </Link>
      </li>
    );
  }

  return (
    <li data-current={current || undefined} style={delay}>
      <Link to={href} className={cn('ep-row', current && 'is-current', watched && 'is-watched')}>
        <span className="ep-row-still">
          {still ? (
            <img src={ensureHttps(still)} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
          ) : (
            <span className="absolute inset-0 bg-white/[0.04]" />
          )}
          <span className="ep-row-play" aria-hidden>
            <Play className="h-4 w-4 fill-current" />
          </span>
          {pct > 0 && (
            <span className="ep-row-progress" aria-hidden>
              <span style={{ width: `${pct}%` }} />
            </span>
          )}
        </span>

        <span className="ep-row-text">
          <span className="ep-row-num">
            EP {String(episode.number).padStart(2, '0')}
            {episode.isFiller && <em>Filler</em>}
            {watched && <Check className="h-3 w-3" />}
          </span>
          <span className="ep-row-title">{named || `Episode ${episode.number}`}</span>
          {detail?.synopsis ? (
            <span className="ep-row-syn">{detail.synopsis}</span>
          ) : (
            <span className="ep-row-tags">
              {[episode.hasSub && 'Sub', episode.hasDub && 'Dub'].filter(Boolean).join(' · ')}
            </span>
          )}
          {current && (
            <span className="ep-row-current">{remaining ? `Continue · ${remaining}` : progress ? 'Continue' : 'Up next'}</span>
          )}
        </span>
      </Link>
    </li>
  );
};

export default AnimePage;
