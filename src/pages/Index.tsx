import { useCallback, useEffect, useMemo } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { HeroSection } from '@/components/home/HeroSection';
import { ContinueWatching } from '@/components/home/ContinueWatching';
import { AnimeSlider } from '@/components/home/AnimeSlider';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { Button } from '@/components/ui/button';
import {
  useAnilistHomeAction,
  useAnilistHomeLatest,
  useAnilistHomeMovies,
  useAnilistHomeSeasonal,
  useAnilistHomeTrending,
  useAnilistHomeUpcoming,
} from '@/hooks/useAnilistHomeSections';
import { useWatchHistory } from '@/hooks/useWatchHistory';
import {
  convertAnimeListToHeroAnime,
  getStaticFallbackHeroAnime,
  useHeroAnime,
} from '@/hooks/useHeroAnimeMultiSource';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { Anime } from '@/types/anime';

/**
 * Home. A spotlight, then shelves — the shape of a good video shop: what's new,
 * what's on now, what you left unfinished. Rows keep a fixed order between
 * visits so the page stays a place you can learn rather than a feed.
 */
const isAdultTitle = (anime: { title?: string | null; id?: string | null; genres?: (string | null)[] | null } | null) => {
  if (!anime) return false;
  const t = String(anime.title ?? '').toLowerCase();
  const id = String(anime.id ?? '').toLowerCase();
  const g = (anime.genres ?? []).filter((x): x is string => x != null).map((x) => x.toLowerCase());
  return t.includes('hentai') || id.includes('hentai') || id.includes('hanime') || g.includes('hentai') || g.includes('adult');
};

const SCROLL_KEY = 'anistream_scroll_positions';
const PAGE_KEY = 'home_page';

const Index = () => {
  useDocumentTitle('Home');

  const { data: trendingAnime, isLoading: trendingLoading, error: trendingError, refetch: refetchTrending } =
    useAnilistHomeTrending(24);

  const { currentSeasonLabel, currentSeasonApi, currentSeasonYear } = useMemo(() => {
    const now = new Date();
    const m = now.getMonth();
    const y = now.getFullYear();
    if (m <= 1) return { currentSeasonLabel: `Winter ${y}`, currentSeasonApi: 'WINTER', currentSeasonYear: y };
    if (m <= 4) return { currentSeasonLabel: `Spring ${y}`, currentSeasonApi: 'SPRING', currentSeasonYear: y };
    if (m <= 7) return { currentSeasonLabel: `Summer ${y}`, currentSeasonApi: 'SUMMER', currentSeasonYear: y };
    if (m <= 10) return { currentSeasonLabel: `Fall ${y}`, currentSeasonApi: 'FALL', currentSeasonYear: y };
    return { currentSeasonLabel: `Winter ${y + 1}`, currentSeasonApi: 'WINTER', currentSeasonYear: y + 1 };
  }, []);

  const { data: seasonalData, isLoading: seasonalLoading, refetch: refetchSeasonal } =
    useAnilistHomeSeasonal(currentSeasonYear, currentSeasonApi, true);
  const { data: upcomingData } = useAnilistHomeUpcoming(24);
  const { data: latestAnime, isLoading: latestLoading, refetch: refetchLatest } = useAnilistHomeLatest(24);
  const { data: moviesData, isLoading: moviesLoading, refetch: refetchMovies } = useAnilistHomeMovies(20);
  const { data: actionData, isLoading: actionLoading, refetch: refetchAction } = useAnilistHomeAction(20);
  const { history, removeFromHistory } = useWatchHistory();
  const { heroAnime: rawHeroAnime, isLoading: heroLoading } = useHeroAnime();

  const heroSlides = useMemo(() => {
    if (rawHeroAnime?.length) return rawHeroAnime;
    if (trendingAnime?.length) return convertAnimeListToHeroAnime(trendingAnime);
    if (seasonalData?.results?.length) return convertAnimeListToHeroAnime(seasonalData.results);
    return getStaticFallbackHeroAnime();
  }, [rawHeroAnime, trendingAnime, seasonalData?.results]);

  // Returning to home should return to where you were in it.
  useEffect(() => {
    if (trendingLoading) return;
    try {
      const saved = JSON.parse(sessionStorage.getItem(SCROLL_KEY) || '{}');
      const pos = saved[PAGE_KEY];
      if (pos > 0) {
        const restore = () => window.scrollTo({ top: pos, behavior: 'instant' as ScrollBehavior });
        setTimeout(restore, 100);
        setTimeout(restore, 400);
      }
    } catch { /* ignore */ }
  }, [trendingLoading]);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
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

  // Filtered per row, never deduplicated across rows: a hit belongs in more
  // than one shelf, and hiding it makes the rows look broken.
  const safe = useCallback(<T extends { title?: string | null; id?: string | null; genres?: (string | null)[] | null }>(list: T[]) =>
    list.filter((x) => !isAdultTitle(x)), []);

  const rows: { key: string; title: string; subtitle?: string; link: string; linkText?: string; items: Anime[]; loading: boolean; retry: () => void }[] = [
    {
      key: 'trending',
      title: 'Trending now',
      subtitle: 'What everyone is watching this week',
      link: '/browse?sort=trending',
      items: safe(trendingAnime?.filter((a) => a.status !== 'Upcoming') ?? []),
      loading: trendingLoading,
      retry: refetchTrending,
    },
    {
      key: 'season',
      title: currentSeasonLabel,
      subtitle: 'Airing right now',
      link: '/browse?status=Ongoing',
      linkText: 'Browse the season',
      items: safe(seasonalData?.results ?? []),
      loading: seasonalLoading,
      retry: refetchSeasonal,
    },
    {
      key: 'latest',
      title: 'Fresh episodes',
      subtitle: 'Recently released',
      link: '/browse?sort=recently_released',
      items: safe(latestAnime ?? []),
      loading: latestLoading,
      retry: refetchLatest,
    },
    {
      key: 'action',
      title: 'Action',
      link: '/browse?genres=Action',
      items: safe(actionData?.results ?? []),
      loading: actionLoading,
      retry: refetchAction,
    },
    {
      key: 'movies',
      title: 'Films',
      subtitle: 'One sitting, start to finish',
      link: '/browse?type=Movie',
      items: safe(moviesData?.results ?? []),
      loading: moviesLoading,
      retry: refetchMovies,
    },
    {
      key: 'upcoming',
      title: 'Coming soon',
      subtitle: 'Worth remembering',
      link: '/browse?status=Upcoming',
      items: safe(upcomingData?.results ?? []),
      loading: false,
      retry: () => {},
    },
  ];

  return (
    <div className="min-h-screen">
      <Navbar />

      <HeroSection heroAnime={heroSlides.length ? heroSlides : getStaticFallbackHeroAnime()} />

      {trendingError && (
        <div className="page-x pt-6">
          <div className="glass flex items-center gap-3 rounded-xl p-3.5 text-[13px]">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-300" />
            <span className="flex-1 text-muted-foreground">
              Some rows didn't load — the catalogue service may be rate-limiting us. Everything else still works.
            </span>
            <Button onClick={() => refetchTrending()} size="sm" variant="ghost" className="h-8 shrink-0 rounded-full px-3">
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry
            </Button>
          </div>
        </div>
      )}

      <main className="home-main page-x page-bottom space-y-12 pt-11 sm:space-y-16">
        {history.length > 0 && (
          <section className="home-featured-shelf">
            <SectionHeader title="Pick up where you left off" link="/browse" linkText="Find something new" />
            <ContinueWatching items={history} onRemove={removeFromHistory} />
          </section>
        )}

        {rows.map((row) =>
          row.loading || row.items.length > 0 ? (
            <section key={row.key} className="home-shelf">
              <SectionHeader title={row.title} subtitle={row.subtitle} link={row.link} linkText={row.linkText} />
              <AnimeSlider anime={row.items.slice(0, 20)} loading={row.loading} />
            </section>
          ) : null
        )}

        {!trendingLoading && !heroLoading && rows.every((r) => r.items.length === 0) && (
          <div className="glass rounded-2xl p-10 text-center">
            <h2 className="section-title text-xl">Nothing loaded</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              We couldn't reach the catalogue. This is usually brief — try again in a moment.
            </p>
            <Button onClick={() => refetchTrending()} className="btn-ember mt-5 rounded-full px-5">
              <RefreshCw className="mr-2 h-4 w-4" /> Reload
            </Button>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default Index;
