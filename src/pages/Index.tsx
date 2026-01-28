import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { HeroSection } from '@/components/home/HeroSection';
import { AnimeGrid } from '@/components/anime/AnimeGrid';
import { TopAnimeList } from '@/components/anime/TopAnimeList';
import { useTrending, useLatest, useTopRated, useAnime } from '@/hooks/useAnime';
import { apiClient } from '@/lib/api-client';
import { AniListClient } from '@/lib/anilist-client';
import { Loader2, AlertCircle, RefreshCw, TrendingUp, Clock, Award, Flame, Sparkles, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';

const Index = () => {
  const { data: trendingAnime, isLoading: trendingLoading, error: trendingError, refetch: refetchTrending } = useTrending();
  const { data: latestAnime, isLoading: latestLoading, error: latestError, refetch: refetchLatest } = useLatest();
  const { data: topAnimeList, isLoading: topLoading, refetch: refetchTop } = useTopRated(1, 24);

  const [featuredAnime, setFeaturedAnime] = useState([]);
  const [featuredLoading, setFeaturedLoading] = useState(false);

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

  const bestAnime = topAnimeList?.map(item => item.anime) || [];

  return (
    <div className="min-h-screen bg-background">
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

      {/* Error State - Premium Design */}
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

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-16">
        {/* Trending Now Section */}
        <section className="animate-fade-in">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-fox-orange to-orange-600 flex items-center justify-center shadow-lg shadow-fox-orange/20">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Trending Now</h2>
                <p className="text-muted-foreground text-sm mt-0.5">Most popular anime this week</p>
              </div>
            </div>
          </div>

          {trendingLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-5">
              {[...Array(18)].map((_, i) => (
                <div
                  key={i}
                  className="aspect-[2/3] rounded-xl bg-gradient-to-br from-fox-surface to-fox-surface/50 animate-pulse"
                  style={{ animationDelay: `${i * 50}ms` }}
                />
              ))}
            </div>
          ) : trendingAnime && trendingAnime.length > 0 ? (
            <AnimeGrid anime={trendingAnime.slice(0, 18)} columns={6} />
          ) : (
            <EmptyState message="No trending content available" />
          )}
        </section>

        {/* Latest Episodes Section */}
        <section className="animate-fade-in" style={{ animationDelay: '100ms' }}>
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
                <Clock className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Latest Episodes</h2>
                <p className="text-muted-foreground text-sm mt-0.5">Fresh releases just for you</p>
              </div>
            </div>
            <Link to="/schedule">
              <Button
                variant="ghost"
                className="text-muted-foreground hover:text-foreground hover:bg-fox-surface/80 transition-all h-10 px-4 rounded-xl"
              >
                Schedule
                <span className="ml-2">→</span>
              </Button>
            </Link>
          </div>

          {latestLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-5">
              {[...Array(18)].map((_, i) => (
                <div
                  key={i}
                  className="aspect-[2/3] rounded-xl bg-gradient-to-br from-fox-surface to-fox-surface/50 animate-pulse"
                  style={{ animationDelay: `${i * 50}ms` }}
                />
              ))}
            </div>
          ) : latestAnime && latestAnime.length > 0 ? (
            <AnimeGrid anime={latestAnime.slice(0, 18)} columns={6} />
          ) : (
            <EmptyState message="No new episodes available" />
          )}
        </section>

        {/* Top Rated Section */}
        <section className="animate-fade-in" style={{ animationDelay: '200ms' }}>
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-yellow-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
                <Award className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Top Rated</h2>
                <p className="text-muted-foreground text-sm mt-0.5">Highest rated anime of all time</p>
              </div>
            </div>
            <Link to="/search?sort=rating">
              <Button
                variant="ghost"
                className="text-muted-foreground hover:text-foreground hover:bg-fox-surface/80 transition-all h-10 px-4 rounded-xl"
              >
                View All
                <span className="ml-2">→</span>
              </Button>
            </Link>
          </div>

          {topLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-5">
              {[...Array(18)].map((_, i) => (
                <div
                  key={i}
                  className="aspect-[2/3] rounded-xl bg-gradient-to-br from-fox-surface to-fox-surface/50 animate-pulse"
                  style={{ animationDelay: `${i * 50}ms` }}
                />
              ))}
            </div>
          ) : bestAnime.length > 0 ? (
            <AnimeGrid anime={bestAnime.slice(0, 18)} columns={6} />
          ) : (
            <EmptyState message="No top rated content available" />
          )}
        </section>
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
