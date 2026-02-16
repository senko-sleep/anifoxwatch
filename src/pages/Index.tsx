import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { HeroSection } from '@/components/home/HeroSection';
import { AiringSchedule } from '@/components/home/AiringSchedule';
import { WeeklyLeaderboard } from '@/components/home/WeeklyLeaderboard';
import { ContinueWatching } from '@/components/home/ContinueWatching';
import { AnimeSlider } from '@/components/home/AnimeSlider';
import { useTrending, useTopRated, useSchedule, useLeaderboard, useSeasonal, usePopular, useUpcoming } from '@/hooks/useAnime';
import { useWatchHistory } from '@/hooks/useWatchHistory';
import { useHeroAnime } from '@/hooks/useHeroAnimeMultiSource';
import { AlertCircle, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLocation } from 'react-router-dom';
import { useEffect, useMemo } from 'react';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';


const Index = () => {
  useDocumentTitle('Home');
  const { data: trendingAnime, isLoading: trendingLoading, error: trendingError, refetch: refetchTrending } = useTrending(1, 20);
  const { data: topAnimeList, isLoading: topLoading, refetch: refetchTop } = useTopRated(1, 15);
  const { data: scheduleData, isLoading: scheduleLoading } = useSchedule();
  const { data: leaderboardData, isLoading: leaderboardLoading } = useLeaderboard('trending');
  const { data: seasonalData, isLoading: seasonalLoading } = useSeasonal();
  const { data: popularAnime, isLoading: popularLoading } = usePopular(2); // Page 2 for variety
  const { data: upcomingData, isLoading: upcomingLoading } = useUpcoming();
  const { history, removeFromHistory } = useWatchHistory();
  const location = useLocation();

  const SCROLL_POSITIONS_KEY = 'anistream_scroll_positions';
  const pageKey = 'home_page';

  // Hero banner data fetched directly from AniList GraphQL (no rate limits, HD banners)
  const { heroAnime, isLoading: heroLoading } = useHeroAnime();

  // Filter out hentai content from homepage
  const isHentai = (anime: { title?: string | null; id?: string | null; genres?: (string | null)[] | null } | null) => {
    if (!anime) return false;
    
    const title = anime.title ? String(anime.title).toLowerCase() : '';
    const id = anime.id ? String(anime.id).toLowerCase() : '';
    const genres = anime.genres ? anime.genres
      .filter((g): g is string => g != null)
      .map((g: string) => String(g).toLowerCase()) : [];
    
    // Check for hentai-related keywords
    if (title.includes('hentai') || 
        id.includes('hentai') || 
        id.includes('hanime') ||
        genres.includes('hentai') || 
        genres.includes('adult') ||
        title.includes('girls love') ||
        title.includes('boys love') ||
        title.includes('yaoi') ||
        title.includes('yuri')) {
      return true;
    }
    return false;
  };

  // Deduplicate and filter anime across all sections using useMemo
  const {
    dedupTrending,
    dedupSeasonal,
    dedupPopular,
    dedupUpcoming,
    dedupLeaderboard,
    dedupTopRated
  } = useMemo(() => {
    // Filter hentai content
    const filteredTrending = trendingAnime?.filter(a => !isHentai(a)) || [];
    const filteredSeasonal = seasonalData?.results?.filter(a => !isHentai(a)) || [];
    const filteredPopular = popularAnime?.filter(a => !isHentai(a)) || [];
    const filteredUpcoming = upcomingData?.results?.filter(a => !isHentai(a)) || [];
    const filteredLeaderboard = leaderboardData?.results?.filter(a => !isHentai(a)) || [];
    const filteredTopRated = topAnimeList?.map(item => item.anime).filter(a => !isHentai(a)) || [];

    // Deduplicate across sections
    const usedIds = new Set<string>();
    
    const getUnique = <T extends { id: string }>(list: T[]): T[] => {
      return list.filter(item => {
        if (usedIds.has(item.id)) return false;
        usedIds.add(item.id);
        return true;
      });
    };

    return {
      dedupTrending: getUnique(filteredTrending),
      dedupSeasonal: getUnique(filteredSeasonal),
      dedupPopular: getUnique(filteredPopular),
      dedupUpcoming: getUnique(filteredUpcoming),
      dedupLeaderboard: getUnique(filteredLeaderboard),
      dedupTopRated: getUnique(filteredTopRated)
    };
  }, [trendingAnime, seasonalData?.results, popularAnime, upcomingData?.results, leaderboardData?.results, topAnimeList]);

  // Filter schedule for today
  const todaySchedule = scheduleData?.schedule?.filter(item => {
    // Only show items airing in next 24h
    const now = Date.now() / 1000;
    const timeUntil = item.airingAt - now;
    return timeUntil < 86400 && timeUntil > -3600;
  }).slice(0, 10) || [];

  const isLoading = trendingLoading || topLoading || heroLoading;
  const hasError = trendingError;

  const handleRefresh = () => {
    refetchTrending();
    refetchTop();
  };

  // Save/Restore scroll position with better timing
  useEffect(() => {
    if (!isLoading) {
      try {
        const positions = JSON.parse(sessionStorage.getItem(SCROLL_POSITIONS_KEY) || '{}');
        const pos = positions[pageKey];
        if (pos > 0) {
          // Wait for images to load before restoring scroll
          const restoreScroll = () => {
            window.scrollTo({ top: pos, behavior: 'instant' });
          };
          
          // Try multiple times to ensure images are loaded
          setTimeout(restoreScroll, 100);
          setTimeout(restoreScroll, 300);
          setTimeout(restoreScroll, 500);
        }
      } catch (e) { /* ignore */ }
    }
  }, [isLoading, pageKey]);

  useEffect(() => {
    let scrollTimeout: NodeJS.Timeout;
    const handleScroll = () => {
      // Debounce scroll saving to improve performance
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        try {
          const positions = JSON.parse(sessionStorage.getItem(SCROLL_POSITIONS_KEY) || '{}');
          positions[pageKey] = window.scrollY;
          sessionStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify(positions));
        } catch (e) { /* ignore */ }
      }, 150);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, [pageKey]);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <Navbar />

      {/* Hero Section */}
      {heroAnime.length > 0 ? (
        <HeroSection heroAnime={heroAnime} />
      ) : isLoading ? (
        <div className="h-[50vh] sm:h-[70vh] flex items-center justify-center bg-gradient-to-b from-fox-dark to-background">
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-4 border-fox-orange/20 border-t-fox-orange animate-spin" />
              <Sparkles className="w-6 h-6 text-fox-orange absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <p className="text-muted-foreground text-sm animate-pulse">Loading amazing content...</p>
          </div>
        </div>
      ) : null}

      {/* Error State */}
      {hasError && (
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-4 p-6 rounded-2xl bg-gradient-to-r from-red-950/30 to-red-900/10 border border-red-900/30 backdrop-blur-xl shadow-lg">
            <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-red-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-red-400">Connection Error</h3>
              <p className="text-sm text-zinc-400 mt-0.5">Unable to load content. Please check your connection and try again.</p>
            </div>
            <Button
              onClick={handleRefresh}
              className="bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 h-10 px-5"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </div>
        </div>
      )}

      {/* Main Content Layout */}
      <main className="max-w-[1800px] mx-auto px-3 sm:px-6 lg:px-8 relative z-10 space-y-8 sm:space-y-12 pb-10 sm:pb-16">

        {/* Continue Watching */}
        {history.length > 0 && (
          <section className="animate-fade-in">
            <SectionHeader
              title="Continue Watching"
              subtitle="Pick up where you left off"
            />
            <ContinueWatching items={history} onRemove={removeFromHistory} />
          </section>
        )}

        {/* Trending Now */}
        <section className="animate-fade-in">
          <SectionHeader
            title="Trending Now"
            link="/browse?sort=trending"
            linkText="View All"
          />
          {trendingLoading ? (
            <div className="flex gap-4 overflow-hidden">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="w-44 shrink-0 aspect-[2/3] rounded-xl bg-fox-surface animate-pulse" />
              ))}
            </div>
          ) : dedupTrending && dedupTrending.length > 0 ? (
            <AnimeSlider
              anime={dedupTrending.filter(a => a.status !== 'Upcoming').slice(0, 15)}
              cardSize="md"
            />
          ) : null}
        </section>

        {/* Airing Today */}
        {(scheduleLoading || todaySchedule.length > 0) && (
          <section className="animate-fade-in">
            <SectionHeader
              title="Airing Today"
              subtitle="Don't miss new episodes"
              link="/schedule"
              linkText="Full Schedule"
            />
            <AiringSchedule schedule={todaySchedule} isLoading={scheduleLoading} />
          </section>
        )}

        {/* New This Season */}
        <section className="animate-fade-in">
          <SectionHeader
            title="New This Season"
            subtitle="Fresh anime airing now"
            link="/browse?status=ongoing"
            linkText="View All"
          />
          {seasonalLoading ? (
            <div className="flex gap-4 overflow-hidden">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="w-44 shrink-0 aspect-[2/3] rounded-xl bg-fox-surface animate-pulse" />
              ))}
            </div>
          ) : dedupSeasonal.length > 0 ? (
            <AnimeSlider anime={dedupSeasonal.slice(0, 15)} cardSize="md" />
          ) : null}
        </section>

        {/* Popular Anime */}
        <section className="animate-fade-in">
          <SectionHeader
            title="Popular Anime"
            subtitle="Fan favorites you'll love"
            link="/browse?sort=popularity"
            linkText="Discover More"
          />
          {popularLoading ? (
            <div className="flex gap-4 overflow-hidden">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="w-44 shrink-0 aspect-[2/3] rounded-xl bg-fox-surface animate-pulse" />
              ))}
            </div>
          ) : dedupPopular && dedupPopular.length > 0 ? (
            <AnimeSlider anime={dedupPopular.slice(0, 15)} cardSize="md" />
          ) : null}
        </section>

        {/* Coming Soon */}
        {dedupUpcoming && dedupUpcoming.length > 0 && (
          <section className="animate-fade-in">
            <SectionHeader
              title="Coming Soon"
              subtitle="Upcoming anime to look forward to"
              link="/browse?status=upcoming"
              linkText="See All Upcoming"
            />
            <AnimeSlider anime={dedupUpcoming.slice(0, 15)} cardSize="md" />
          </section>
        )}

      </main>

      <Footer />
    </div>
  );
};

// Empty State Component
const EmptyState = ({ message }: { message: string }) => (
  <div className="text-center py-20 bg-gradient-to-br from-fox-surface/30 to-fox-surface/10 rounded-3xl border border-white/5">
    <div className="w-16 h-16 rounded-2xl bg-fox-surface/50 flex items-center justify-center mx-auto mb-4">
      <AlertCircle className="w-8 h-8 text-muted-foreground" />
    </div>
    <p className="text-muted-foreground">{message}</p>
  </div>
);

export default Index;
