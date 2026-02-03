import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { HeroSection } from '@/components/home/HeroSection';
import { AnimeGrid } from '@/components/anime/AnimeGrid';
import { AiringSchedule } from '@/components/home/AiringSchedule';
import { WeeklyLeaderboard } from '@/components/home/WeeklyLeaderboard';
import { ContinueWatching } from '@/components/home/ContinueWatching';
import { useTrending, useLatest, useTopRated, useSchedule, useLeaderboard, useSeasonal } from '@/hooks/useAnime';
import { useWatchHistory } from '@/hooks/useWatchHistory';
import { apiClient } from '@/lib/api-client';
import { AniListClient } from '@/lib/anilist-client';
import { Loader2, AlertCircle, RefreshCw, TrendingUp, Clock, Award, Flame, Sparkles, Calendar, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { SectionHeader } from '@/components/shared/SectionHeader';

const Index = () => {
  const { data: trendingAnime, isLoading: trendingLoading, error: trendingError, refetch: refetchTrending } = useTrending();
  const { data: latestAnime, isLoading: latestLoading, error: latestError, refetch: refetchLatest } = useLatest();
  const { data: topAnimeList, isLoading: topLoading, refetch: refetchTop } = useTopRated(1, 12);
  const { data: scheduleData, isLoading: scheduleLoading } = useSchedule();
  const { data: leaderboardData, isLoading: leaderboardLoading } = useLeaderboard('trending');
  const { data: seasonalData, isLoading: seasonalLoading } = useSeasonal();
  const { history, removeFromHistory } = useWatchHistory();
  const location = useLocation();

  const SCROLL_POSITIONS_KEY = 'anistream_scroll_positions';
  const pageKey = 'home_page';

  const [featuredAnime, setFeaturedAnime] = useState([]);
  const [featuredLoading, setFeaturedLoading] = useState(false);

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
    if (trendingAnime && trendingAnime.length > 0) {
      const fetchFeaturedDetails = async () => {
        setFeaturedLoading(true);
        const featuredIds = trendingAnime.slice(0, 5);

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

  const bestAnime = topAnimeList?.map(item => item.anime) || [];

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <Navbar />

      {/* Hero Section with Enhanced Design */}
      {featuredAnime.length > 0 ? (
        <div className="relative">
          <HeroSection featuredAnime={featuredAnime} />
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
      <main className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">

        <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
          {/* Main Column */}
          <div className="flex-1 min-w-0 space-y-12">

            {/* Continue Watching Section */}
            {history.length > 0 && (
              <section className="animate-fade-in mb-8">
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

            {/* Trending Section */}
            <section className="animate-fade-in relative z-10">
              <SectionHeader
                title="Trending Now"
                subtitle="Most popular anime right now"
                icon={TrendingUp}
                iconBg="from-fox-orange to-orange-600"
                link="/api/anime/trending"
                linkText="See All"
              />

              {trendingLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {[...Array(10)].map((_, i) => (
                    <div key={i} className="aspect-[2/3] rounded-xl bg-fox-surface animate-pulse" />
                  ))}
                </div>
              ) : trendingAnime && trendingAnime.length > 0 ? (
                // Filter out 'Upcoming' or 'Not Yet Released' from trending standard view
                // Also filter out any anime with incomplete data if possible (like missing images)
                <AnimeGrid
                  anime={trendingAnime
                    .filter(a => a.status !== 'Upcoming' && a.rating !== undefined)
                    .slice(0, 10)}
                  columns={5}
                />
              ) : (
                <EmptyState message="No trending content available" />
              )}
            </section>

            {/* Seasonal Section */}
            <section className="animate-fade-in relative z-10" style={{ animationDelay: '150ms' }}>
              <SectionHeader
                title="New This Season"
                subtitle="Fresh anime airing now"
                icon={Calendar}
                iconBg="from-green-500 to-emerald-600"
                link="/api/anime/seasonal"
                linkText="View Season"
              />

              {seasonalLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {[...Array(10)].map((_, i) => (
                    <div key={i} className="aspect-[2/3] rounded-xl bg-fox-surface animate-pulse" />
                  ))}
                </div>
              ) : seasonalData?.results ? (
                <AnimeGrid anime={seasonalData.results.slice(0, 10)} columns={5} />
              ) : (
                <EmptyState message="No seasonal content available" />
              )}
            </section>

            {/* Latest Episodes */}
            <section className="animate-fade-in relative z-10" style={{ animationDelay: '100ms' }}>
              <SectionHeader
                title="Latest Episodes"
                subtitle="Fresh releases just for you"
                icon={Clock}
                iconBg="from-blue-500 to-cyan-500"
                link="/schedule"
                linkText="Full Schedule"
              />

              {latestLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {[...Array(10)].map((_, i) => (
                    <div key={i} className="aspect-[2/3] rounded-xl bg-fox-surface animate-pulse" />
                  ))}
                </div>
              ) : latestAnime && latestAnime.length > 0 ? (
                <AnimeGrid anime={latestAnime.slice(0, 10)} columns={5} />
              ) : (
                <EmptyState message="No new episodes available" />
              )}
            </section>

          </div>

          {/* Sidebar */}
          <aside className="w-full lg:w-80 shrink-0 space-y-6">

            {/* Airing Today Widget */}
            <div className="bg-fox-surface/30 rounded-2xl p-6 border border-white/5 backdrop-blur-sm shadow-lg">
              <div className="flex items-center gap-2 mb-6">
                <Clock className="w-4 h-4 text-fox-orange" />
                <h3 className="font-bold text-lg">Airing Today</h3>
              </div>
              <AiringSchedule schedule={todaySchedule} isLoading={scheduleLoading} />
            </div>

            {/* Weekly Leaderboard Widget */}
            <div className="bg-fox-surface/30 rounded-2xl p-6 border border-white/5 backdrop-blur-sm shadow-lg">
              <div className="flex items-center gap-2 mb-6">
                <Award className="w-4 h-4 text-yellow-500" />
                <h3 className="font-bold text-lg">Weekly Top 10</h3>
              </div>
              <WeeklyLeaderboard anime={leaderboardData?.results || []} isLoading={leaderboardLoading} />
            </div>

            {/* Top Rated Mini List */}
            <div className="bg-fox-surface/30 rounded-2xl p-6 border border-white/5 backdrop-blur-sm shadow-lg">
              <div className="flex items-center gap-2 mb-6">
                <Flame className="w-4 h-4 text-red-500" />
                <h3 className="font-bold text-lg">All-Time Best</h3>
              </div>

              <div className="space-y-4">
                {topLoading ? (
                  [...Array(3)].map((_, i) => (
                    <div key={i} className="h-16 bg-fox-surface/50 rounded-lg animate-pulse" />
                  ))
                ) : bestAnime.slice(0, 5).map((anime, i) => (
                  <Link
                    key={anime.id}
                    to={`/watch?id=${encodeURIComponent(anime.id)}`}
                    state={{ from: location.pathname + location.search }}
                    className="flex gap-3 items-center group p-2 rounded-lg hover:bg-fox-surface/50 transition-colors"
                  >
                    <span className={cn(
                      "w-6 text-center font-bold text-lg",
                      i === 0 ? "text-yellow-500" : "text-muted-foreground"
                    )}>{i + 1}</span>
                    <div className="w-12 h-16 rounded bg-fox-surface overflow-hidden shrink-0 shadow-sm relative">
                      <img src={anime.image} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate group-hover:text-fox-orange transition-colors">{anime.title}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">
                          <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                          {anime.rating ? (anime.rating > 10 ? anime.rating / 10 : anime.rating).toFixed(1) : 'N/A'}
                        </span>
                        <span>•</span>
                        <span>{anime.type || 'TV'}</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              <Link to="/search?sort=rating" className="block mt-6">
                <Button variant="outline" size="sm" className="w-full text-xs border-white/10 hover:bg-white/5">View All Top Rated</Button>
              </Link>
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
