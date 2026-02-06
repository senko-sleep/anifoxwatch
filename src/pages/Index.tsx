import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { HeroSection } from '@/components/home/HeroSection';
import { AnimeGrid } from '@/components/anime/AnimeGrid';
import { AiringSchedule } from '@/components/home/AiringSchedule';
import { WeeklyLeaderboard } from '@/components/home/WeeklyLeaderboard';
import { ContinueWatching } from '@/components/home/ContinueWatching';
import { AnimeSlider } from '@/components/home/AnimeSlider';
import { FeaturedSpotlight } from '@/components/home/FeaturedSpotlight';
import { useTrending, useLatest, useTopRated, useSchedule, useLeaderboard, useSeasonal, usePopular, useUpcoming } from '@/hooks/useAnime';
import { useWatchHistory } from '@/hooks/useWatchHistory';
import { apiClient } from '@/lib/api-client';
import { AniListClient } from '@/lib/anilist-client';
import { Loader2, AlertCircle, RefreshCw, TrendingUp, Clock, Award, Flame, Sparkles, Calendar, Star, Zap, Heart, Film, Tv } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const Index = () => {
  useDocumentTitle('Home');
  const { data: trendingAnime, isLoading: trendingLoading, error: trendingError, refetch: refetchTrending } = useTrending(1, 20);
  const { data: latestAnime, isLoading: latestLoading, error: latestError, refetch: refetchLatest } = useLatest();
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

  const [featuredAnime, setFeaturedAnime] = useState([]);
  const [featuredLoading, setFeaturedLoading] = useState(false);

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

  // Filter all anime lists to exclude hentai content
  const filteredTrending = trendingAnime?.filter(a => !isHentai(a)) || [];
  const filteredLatest = latestAnime?.filter(a => !isHentai(a)) || [];
  const filteredSeasonal = seasonalData?.results?.filter(a => !isHentai(a)) || [];
  const filteredPopular = popularAnime?.filter(a => !isHentai(a)) || [];
  const filteredUpcoming = upcomingData?.results?.filter(a => !isHentai(a)) || [];
  const filteredLeaderboard = leaderboardData?.results?.filter(a => !isHentai(a)) || [];

  // Filter best anime from top rated
  const filteredTopRated = topAnimeList?.map(item => item.anime).filter(a => !isHentai(a)) || [];

  // Deduplicate anime across all sections - track which IDs have been used
  const usedAnimeIds = new Set<string>();
  
  const getUniqueAnime = <T extends { id: string }>(animeList: T[]): T[] => {
    return animeList.filter(anime => {
      if (usedAnimeIds.has(anime.id)) return false;
      usedAnimeIds.add(anime.id);
      return true;
    });
  };

  // Apply deduplication to each section
  const dedupTrending = getUniqueAnime(filteredTrending);
  const dedupLatest = getUniqueAnime(filteredLatest);
  const dedupSeasonal = getUniqueAnime(filteredSeasonal);
  const dedupPopular = getUniqueAnime(filteredPopular);
  const dedupUpcoming = getUniqueAnime(filteredUpcoming);
  const dedupLeaderboard = getUniqueAnime(filteredLeaderboard);
  const dedupTopRated = getUniqueAnime(filteredTopRated);

  // Create featured anime from trending (reset used IDs)
  usedAnimeIds.clear();
  const featuredAnimeIds = new Set(dedupTrending.slice(0, 5).map(a => a.id));
  const featuredAnimeList = dedupTrending.filter(a => featuredAnimeIds.has(a.id));

  // Filter schedule for today
  const todaySchedule = scheduleData?.schedule?.filter(item => {
    // Only show items airing in next 24h
    const now = Date.now() / 1000;
    const timeUntil = item.airingAt - now;
    return timeUntil < 86400 && timeUntil > -3600;
  }).slice(0, 5) || [];

  const isLoading = trendingLoading || latestLoading || topLoading || featuredLoading;
  const hasError = trendingError || latestError;

  // Fetch detailed info for featured anime with AniList images
  useEffect(() => {
    if (dedupTrending && dedupTrending.length > 0) {
      const fetchFeaturedDetails = async () => {
        setFeaturedLoading(true);
        const featuredIds = dedupTrending.filter(a => a.status !== 'Upcoming').slice(0, 5);

        try {
          // Fetch detailed info for each featured anime with AniList enrichment
          const detailedAnime = await Promise.all(
            featuredIds.map(async (anime) => {
              try {
                // First get detailed info from our API
                const detailed = await apiClient.getAnime(anime.id);
                const baseAnime = detailed || anime;

                // Then enrich with AniList images
                const enrichedAnime = await AniListClient.enrichAnimeWithImages(baseAnime);
                return enrichedAnime;
              } catch {
                // Fallback to just AniList enrichment
                return await AniListClient.enrichAnimeWithImages(anime);
              }
            })
          );
          setFeaturedAnime(detailedAnime);
        } catch (error) {
          console.error('Failed to fetch featured anime details:', error);
          // Fallback to basic trending anime
          setFeaturedAnime(featuredIds);
        } finally {
          setFeaturedLoading(false);
        }
      };

      fetchFeaturedDetails();
    }
  }, [trendingAnime]);

  const handleRefresh = () => {
    refetchTrending();
    refetchLatest();
    refetchTop();
  };

  // Save/Restore scroll position
  useEffect(() => {
    if (!isLoading) {
      try {
        const positions = JSON.parse(sessionStorage.getItem(SCROLL_POSITIONS_KEY) || '{}');
        const pos = positions[pageKey];
        if (pos > 0) {
          setTimeout(() => {
            window.scrollTo({ top: pos, behavior: 'instant' });
          }, 100);
        }
      } catch (e) { /* ignore */ }
    }
  }, [isLoading]);

  useEffect(() => {
    const handleScroll = () => {
      try {
        const positions = JSON.parse(sessionStorage.getItem(SCROLL_POSITIONS_KEY) || '{}');
        positions[pageKey] = window.scrollY;
        sessionStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify(positions));
      } catch (e) { /* ignore */ }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <Navbar />

      {/* Hero Section with Enhanced Design */}
      {(featuredAnime.length > 0 || dedupTrending.length > 0) ? (
        <div className="relative">
          <HeroSection featuredAnime={featuredAnime.length > 0 ? featuredAnime : dedupTrending.slice(0, 5)} />
          <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-background via-background/90 to-transparent pointer-events-none" />
        </div>
      ) : isLoading ? (
        <div className="h-[70vh] flex items-center justify-center bg-gradient-to-b from-fox-dark to-background">
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
      <main className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-16">

        {/* Continue Watching - Full Width */}
        {history.length > 0 && (
          <section className="animate-fade-in">
            <SectionHeader
              title="Continue Watching"
              subtitle="Pick up where you left off"
              icon={Clock}
              iconBg="from-fox-orange to-orange-600"
              iconColor="text-white"
            />
            <ContinueWatching items={history} onRemove={removeFromHistory} />
          </section>
        )}

        {/* Two Column Layout for Main Content + Sidebar */}
        <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
          {/* Main Column */}
          <div className="flex-1 min-w-0 space-y-16">

            {/* New This Season */}
            <section className="animate-fade-in">
              <SectionHeader
                title="New This Season"
                subtitle="Fresh anime airing now"
                icon={Calendar}
                iconBg="from-green-500 to-emerald-600"
                link="/browse?status=ongoing"
                linkText="View All"
              />
              {seasonalLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-6 gap-y-8">
                  {[...Array(10)].map((_, i) => (
                    <div key={i} className="aspect-[2/3] rounded-xl bg-fox-surface animate-pulse" />
                  ))}
                </div>
              ) : dedupSeasonal.length > 0 ? (
                <AnimeGrid anime={dedupSeasonal.slice(0, 10)} columns={5} />
              ) : (
                <EmptyState message="No seasonal content available" />
              )}
            </section>

            {/* Latest Episodes */}
            <section className="animate-fade-in">
              <SectionHeader
                title="Latest Episodes"
                subtitle="Fresh releases just for you"
                icon={Clock}
                iconBg="from-blue-500 to-cyan-500"
                link="/schedule"
                linkText="Full Schedule"
              />
              {latestLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-6 gap-y-8">
                  {[...Array(10)].map((_, i) => (
                    <div key={i} className="aspect-[2/3] rounded-xl bg-fox-surface animate-pulse" />
                  ))}
                </div>
              ) : dedupLatest && dedupLatest.length > 0 ? (
                <AnimeGrid anime={dedupLatest.slice(0, 10)} columns={5} />
              ) : (
                <EmptyState message="No new episodes available" />
              )}
            </section>

            {/* Trending Slider */}
            <section className="animate-fade-in">
              <SectionHeader
                title="Trending Now"
                icon={TrendingUp}
                iconBg="from-fox-orange to-orange-600"
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
              ) : (
                <EmptyState message="No trending content available" />
              )}
            </section>

            {/* Popular Anime Slider */}
            <section className="animate-fade-in">
              <SectionHeader
                title="Popular Anime"
                subtitle="Fan favorites you'll love"
                icon={Heart}
                iconBg="from-pink-500 to-rose-500"
                link="/browse?sort=popularity"
                linkText="Discover More"
              />
              {popularLoading ? (
                <div className="flex gap-4 overflow-hidden">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="w-44 shrink-0 aspect-[2/3] rounded-xl bg-fox-surface animate-pulse" />
                  ))}
                </div>
              ) : dedupPopular && dedupPopular.length > 0 ? (
                <AnimeSlider anime={dedupPopular.slice(0, 12)} cardSize="md" />
              ) : null}
            </section>

            {/* Top Rated Grid */}
            <section className="animate-fade-in">
              <SectionHeader
                title="Top Rated"
                subtitle="Highest rated anime of all time"
                icon={Award}
                iconBg="from-yellow-500 to-amber-500"
                link="/browse?sort=rating"
                linkText="View Rankings"
              />
              {topLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-6 gap-y-8">
                  {[...Array(10)].map((_, i) => (
                    <div key={i} className="aspect-[2/3] rounded-xl bg-fox-surface animate-pulse" />
                  ))}
                </div>
              ) : dedupTopRated.length > 0 ? (
                <AnimeGrid anime={dedupTopRated.slice(0, 10)} columns={5} />
              ) : (
                <EmptyState message="No top rated content available" />
              )}
            </section>

            {/* Upcoming Anime */}
            {dedupUpcoming && dedupUpcoming.length > 0 && (
              <section className="animate-fade-in">
                <SectionHeader
                  title="Coming Soon"
                  subtitle="Upcoming anime to look forward to"
                  icon={Sparkles}
                  iconBg="from-purple-500 to-violet-500"
                  link="/browse?status=upcoming"
                  linkText="See All Upcoming"
                />
                <AnimeSlider anime={dedupUpcoming.slice(0, 10)} cardSize="md" />
              </section>
            )}

          </div>

          {/* Sidebar */}
          <aside className="w-full lg:w-80 shrink-0 space-y-6">

            {/* Airing Today Widget */}
            <div className="bg-gradient-to-br from-fox-surface/50 to-fox-surface/20 rounded-2xl p-6 border border-white/5 backdrop-blur-sm shadow-lg">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-fox-orange to-orange-600 flex items-center justify-center">
                  <Tv className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="font-bold">Airing Today</h3>
                  <p className="text-xs text-muted-foreground">Don't miss new episodes</p>
                </div>
              </div>
              <AiringSchedule schedule={todaySchedule} isLoading={scheduleLoading} />
              <Link to="/schedule" className="block mt-4">
                <Button variant="outline" size="sm" className="w-full text-xs border-white/10 hover:bg-white/5">
                  <Calendar className="w-3 h-3 mr-2" />
                  Full Schedule
                </Button>
              </Link>
            </div>

            {/* Weekly Leaderboard Widget */}
            <div className="bg-gradient-to-br from-fox-surface/50 to-fox-surface/20 rounded-2xl p-6 border border-white/5 backdrop-blur-sm shadow-lg">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-yellow-500 to-amber-600 flex items-center justify-center">
                  <Award className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="font-bold">Weekly Top 10</h3>
                  <p className="text-xs text-muted-foreground">Most watched this week</p>
                </div>
              </div>
              <WeeklyLeaderboard anime={dedupLeaderboard} isLoading={leaderboardLoading} />
            </div>

            {/* Quick Stats */}
            <div className="bg-gradient-to-br from-fox-surface/50 to-fox-surface/20 rounded-2xl p-6 border border-white/5 backdrop-blur-sm shadow-lg">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center">
                  <Zap className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="font-bold">Quick Stats</h3>
                  <p className="text-xs text-muted-foreground">Your anime journey</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-fox-surface/30 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-fox-orange">{history.length}</p>
                  <p className="text-xs text-muted-foreground">Watching</p>
                </div>
                <div className="bg-fox-surface/30 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-green-500">{dedupTrending.length}</p>
                  <p className="text-xs text-muted-foreground">Trending</p>
                </div>
                <div className="bg-fox-surface/30 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-purple-500">{dedupSeasonal.length}</p>
                  <p className="text-xs text-muted-foreground">This Season</p>
                </div>
                <div className="bg-fox-surface/30 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-yellow-500">{dedupTopRated.length}</p>
                  <p className="text-xs text-muted-foreground">Top Rated</p>
                </div>
              </div>
            </div>

          </aside>
        </div>
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
