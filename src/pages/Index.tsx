import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { HeroSection } from '@/components/home/HeroSection';
import { ContinueWatching } from '@/components/home/ContinueWatching';
import { AnimeSlider } from '@/components/home/AnimeSlider';
import { SectionHeader } from '@/components/shared/SectionHeader';
import {
  useAnilistHomeTrending,
  useAnilistHomeSeasonal,
  useAnilistHomeUpcoming,
  useAnilistHomeLatest,
  useAnilistHomeMovies,
  useAnilistHomeAction,
} from '@/hooks/useAnilistHomeSections';
import { useWatchHistory } from '@/hooks/useWatchHistory';
import { useHeroAnime } from '@/hooks/useHeroAnimeMultiSource';
import { AlertCircle, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEffect, useMemo, useCallback } from 'react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
// ─── Helpers ─────────────────────────────────────────────────────────────────
const isHentai = (anime: { title?: string | null; id?: string | null; genres?: (string | null)[] | null } | null) => {
  if (!anime) return false;
  const t = String(anime.title ?? '').toLowerCase();
  const id = String(anime.id ?? '').toLowerCase();
  const g = (anime.genres ?? []).filter((x): x is string => x != null).map((x) => x.toLowerCase());
  return t.includes('hentai') || id.includes('hentai') || id.includes('hanime') || g.includes('hentai') || g.includes('adult');
};

// ─── Component ───────────────────────────────────────────────────────────────
const Index = () => {
  useDocumentTitle('Home');

  const { data: trendingAnime, isLoading: trendingLoading, error: trendingError, refetch: refetchTrending } = useAnilistHomeTrending(24);
  const { currentSeasonLabel, currentSeasonApi, currentSeasonYear } = useMemo(() => {
    const now = new Date();
    const m = now.getMonth();
    const y = now.getFullYear();
    if (m <= 1)  return { currentSeasonLabel: `Winter ${y}`,     currentSeasonApi: 'WINTER', currentSeasonYear: y };
    if (m <= 4)  return { currentSeasonLabel: `Spring ${y}`,     currentSeasonApi: 'SPRING', currentSeasonYear: y };
    if (m <= 7)  return { currentSeasonLabel: `Summer ${y}`,     currentSeasonApi: 'SUMMER', currentSeasonYear: y };
    if (m <= 10) return { currentSeasonLabel: `Fall ${y}`,       currentSeasonApi: 'FALL',   currentSeasonYear: y };
    return       { currentSeasonLabel: `Winter ${y + 1}`, currentSeasonApi: 'WINTER', currentSeasonYear: y + 1 };
  }, []);
  const { data: seasonalData,  isLoading: seasonalLoading,  refetch: refetchSeasonal  } = useAnilistHomeSeasonal(currentSeasonYear, currentSeasonApi, true);
  const { data: upcomingData }                                = useAnilistHomeUpcoming(24);
  const { data: latestAnime,   isLoading: latestLoading,    refetch: refetchLatest   } = useAnilistHomeLatest(24);
  const { data: moviesData,    isLoading: moviesLoading,    refetch: refetchMovies   } = useAnilistHomeMovies(20);
  const { data: actionData,    isLoading: actionLoading,    refetch: refetchAction   } = useAnilistHomeAction(20);
  const { history, removeFromHistory }                        = useWatchHistory();
  const { heroAnime, isLoading: heroLoading }                 = useHeroAnime();

  // Scroll restoration
  const SCROLL_KEY = 'anistream_scroll_positions';
  const PAGE_KEY   = 'home_page';

  useEffect(() => {
    if (trendingLoading) return;
    try {
      const saved = JSON.parse(sessionStorage.getItem(SCROLL_KEY) || '{}');
      const pos = saved[PAGE_KEY];
      if (pos > 0) {
        const restore = () => window.scrollTo({ top: pos, behavior: 'instant' });
        setTimeout(restore, 100);
        setTimeout(restore, 400);
      }
    } catch { /* ignore */ }
  }, [trendingLoading]);

  useEffect(() => {
    let t: NodeJS.Timeout;
    const handler = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        try {
          const saved = JSON.parse(sessionStorage.getItem(SCROLL_KEY) || '{}');
          saved[PAGE_KEY] = window.scrollY;
          sessionStorage.setItem(SCROLL_KEY, JSON.stringify(saved));
        } catch { /* ignore */ }
      }, 150);
    };
    window.addEventListener('scroll', handler, { passive: true });
    return () => { window.removeEventListener('scroll', handler); clearTimeout(t); };
  }, []);

  // De-duplicate & filter
  const { dedupTrending, dedupSeasonal, dedupUpcoming, dedupLatest, dedupMovies, dedupAction } = useMemo(() => {
    const used = new Set<string>();
    const unique = <T extends { id: string }>(list: T[]): T[] =>
      list.filter((x) => { if (used.has(x.id)) return false; used.add(x.id); return true; });

    const safe = <T extends { title?: string | null; id?: string | null; genres?: (string | null)[] | null }>(list: T[]) =>
      list.filter((x) => !isHentai(x));

    return {
      dedupTrending: unique(safe(trendingAnime?.filter((a) => a.status !== 'Upcoming') ?? [])),
      dedupSeasonal: unique(safe(seasonalData?.results ?? [])),
      dedupUpcoming: unique(safe(upcomingData?.results ?? [])),
      dedupLatest:   unique(safe(latestAnime ?? [])),
      dedupMovies:   unique(safe(moviesData?.results ?? [])),
      dedupAction:   unique(safe(actionData?.results ?? [])),
    };
  }, [trendingAnime, seasonalData?.results, upcomingData?.results, latestAnime, moviesData?.results, actionData?.results]);

  const isLoading      = trendingLoading || heroLoading;
  const handleRefresh  = () => { refetchTrending(); };

  // Inline empty-state — shown when a section finishes loading but returned nothing
  const EmptySection = useCallback(({ onRetry }: { onRetry: () => void }) => (
    <div className="flex items-center gap-3 py-3 px-1 text-sm text-muted-foreground">
      <AlertCircle className="w-3.5 h-3.5 shrink-0 text-zinc-600" />
      <span className="text-xs text-zinc-600">Couldn't load — server may be waking up.</span>
      <Button onClick={onRetry} size="sm" variant="ghost" className="h-6 px-2 text-xs text-zinc-500 hover:text-white ml-auto shrink-0">
        <RefreshCw className="w-3 h-3 mr-1" />Retry
      </Button>
    </div>
  ), []);

  const SkeletonRow = () => (
    <div className="flex gap-3 overflow-hidden">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="w-[10rem] sm:w-44 shrink-0 aspect-[2/3] rounded-xl bg-white/[0.04] animate-pulse" />
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-background to-background text-foreground font-sans">
      <Navbar />

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      {heroAnime.length > 0 ? (
        <HeroSection heroAnime={heroAnime} />
      ) : isLoading ? (
        <section className="relative w-full sm:px-6 lg:px-8">
          <div className="mx-auto h-[340px] sm:h-[500px] w-full max-w-7xl animate-pulse sm:rounded-2xl bg-zinc-900/80" />
          <div className="mt-3 flex justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-fox-orange/70" />
            <span className="text-[11px] text-muted-foreground">Loading spotlight…</span>
          </div>
        </section>
      ) : null}

      {/* ── Error banner ──────────────────────────────────────────────── */}
      {trendingError && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-red-950/20 border border-red-500/10 text-sm">
            <AlertCircle className="w-4 h-4 text-red-400/80 shrink-0" />
            <span className="text-zinc-400 flex-1">
              {import.meta.env.DEV
                ? <>Could not load home rows from AniList (network or rate limit). Retry in a moment.</>
                : 'Couldn\'t load anime data. Check your connection and try again.'}
            </span>
            <Button onClick={handleRefresh} size="sm" variant="ghost" className="text-zinc-400 hover:text-white shrink-0 h-7 px-2">
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry
            </Button>
          </div>
        </div>
      )}

      {/* ── Main content ──────────────────────────────────────────────── */}
      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-28 sm:pb-20 space-y-5 sm:space-y-10 pt-3 sm:pt-8">

        {/* Continue Watching */}
        {history.length > 0 && (
          <section>
            <SectionHeader title="Continue Watching" />
            <ContinueWatching items={history} onRemove={removeFromHistory} />
          </section>
        )}

        {/* Trending Now */}
        <section>
          <SectionHeader title="Trending Now" link="/browse?sort=trending" linkText="View all" />
          {trendingLoading ? <SkeletonRow /> : dedupTrending.length > 0
            ? <AnimeSlider anime={dedupTrending.slice(0, 20)} cardSize="md" />
            : <EmptySection onRetry={refetchTrending} />}
        </section>

        {/* This Season */}
        <section>
          <SectionHeader title={currentSeasonLabel} link="/browse?status=ongoing" linkText="Browse" />
          {seasonalLoading ? <SkeletonRow /> : dedupSeasonal.length > 0
            ? <AnimeSlider anime={dedupSeasonal.slice(0, 20)} cardSize="md" />
            : <EmptySection onRetry={refetchSeasonal} />}
        </section>

        {/* Latest Episodes */}
        <section>
          <SectionHeader title="Latest Episodes" link="/browse?sort=recently_released" linkText="More" />
          {latestLoading ? <SkeletonRow /> : dedupLatest.length > 0
            ? <AnimeSlider anime={dedupLatest.slice(0, 20)} cardSize="md" />
            : <EmptySection onRetry={refetchLatest} />}
        </section>

        {/* Action Anime */}
        <section>
          <SectionHeader title="Action Anime" link="/browse?genre=Action" linkText="View all" />
          {actionLoading ? <SkeletonRow /> : dedupAction.length > 0
            ? <AnimeSlider anime={dedupAction.slice(0, 20)} cardSize="md" />
            : <EmptySection onRetry={refetchAction} />}
        </section>

        {/* Popular Movies */}
        <section>
          <SectionHeader title="Popular Movies" link="/browse?type=Movie" linkText="View all" />
          {moviesLoading ? <SkeletonRow /> : dedupMovies.length > 0
            ? <AnimeSlider anime={dedupMovies.slice(0, 20)} cardSize="md" />
            : <EmptySection onRetry={refetchMovies} />}
        </section>

        {/* Coming Soon */}
        {dedupUpcoming.length > 0 && (
          <section>
            <SectionHeader title="Coming Soon" link="/browse?status=upcoming" linkText="All upcoming" />
            <AnimeSlider anime={dedupUpcoming.slice(0, 20)} cardSize="md" />
          </section>
        )}

      </main>

      <Footer />
    </div>
  );
};

export default Index;
