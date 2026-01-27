import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { HeroSection } from '@/components/home/HeroSection';
import { AnimeGrid } from '@/components/anime/AnimeGrid';
import { TopAnimeList } from '@/components/anime/TopAnimeList';
import { useTrending, useLatest, useTopRated } from '@/hooks/useAnime';
import { Loader2, AlertCircle, RefreshCw, TrendingUp, Clock, Award, Flame, Sparkles, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

const Index = () => {
  const { data: trendingAnime, isLoading: trendingLoading, error: trendingError, refetch: refetchTrending } = useTrending();
  const { data: latestAnime, isLoading: latestLoading, error: latestError, refetch: refetchLatest } = useLatest();
  const { data: topAnimeList, isLoading: topLoading, refetch: refetchTop } = useTopRated(1, 24);

  const isLoading = trendingLoading || latestLoading || topLoading;
  const hasError = trendingError || latestError;

  const handleRefresh = () => {
    refetchTrending();
    refetchLatest();
    refetchTop();
  };

  const featuredAnime = trendingAnime?.slice(0, 5) || [];
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

      {/* Quick Categories Bar */}
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 -mt-6 relative z-10">
        <div className="flex items-center gap-3 overflow-x-auto pb-4 scrollbar-hide">
          {[
            { label: 'Trending', icon: Flame, color: 'from-orange-500 to-red-500' },
            { label: 'New Releases', icon: Sparkles, color: 'from-blue-500 to-purple-500' },
            { label: 'Top Rated', icon: Star, color: 'from-amber-500 to-orange-500' },
            { label: 'Action', icon: null, color: 'from-red-500 to-pink-500' },
            { label: 'Romance', icon: null, color: 'from-pink-500 to-rose-500' },
            { label: 'Comedy', icon: null, color: 'from-yellow-500 to-orange-500' },
            { label: 'Fantasy', icon: null, color: 'from-purple-500 to-indigo-500' },
          ].map((cat, idx) => (
            <Link
              key={cat.label}
              to={`/search?genre=${cat.label.toLowerCase()}`}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium whitespace-nowrap transition-all",
                "bg-fox-surface/60 hover:bg-fox-surface border border-white/5 hover:border-white/10",
                "hover:scale-105 hover:shadow-lg"
              )}
            >
              {cat.icon && <cat.icon className="w-4 h-4" />}
              {cat.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 lg:gap-12">
          {/* Main Content Area */}
          <div className="xl:col-span-9 space-y-16">

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
                <Link to="/search?sort=trending">
                  <Button
                    variant="ghost"
                    className="text-muted-foreground hover:text-foreground hover:bg-fox-surface/80 transition-all h-10 px-4 rounded-xl"
                  >
                    View All
                    <span className="ml-2">→</span>
                  </Button>
                </Link>
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
          </div>

          {/* Sidebar - Top Anime Rankings */}
          <aside className="hidden xl:block xl:col-span-3">
            <div className="sticky top-24 space-y-6">
              {/* Top 10 Rankings Card */}
              <div className="rounded-3xl bg-gradient-to-b from-fox-surface/80 to-fox-surface/40 border border-white/5 p-6 backdrop-blur-xl shadow-2xl">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
                    <Star className="w-5 h-5 text-white fill-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">Top 10 Anime</h3>
                    <p className="text-xs text-muted-foreground">This season's best</p>
                  </div>
                </div>
                <TopAnimeList items={topAnimeList?.slice(0, 10) || []} />
              </div>

              {/* Quick Stats Card */}
              <div className="rounded-3xl bg-gradient-to-br from-fox-orange/10 to-orange-500/5 border border-fox-orange/20 p-6">
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-fox-orange" />
                  Quick Stats
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-3 rounded-xl bg-background/50">
                    <div className="text-2xl font-bold text-fox-orange">{trendingAnime?.length || 0}</div>
                    <div className="text-xs text-muted-foreground">Trending</div>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-background/50">
                    <div className="text-2xl font-bold text-blue-400">{latestAnime?.length || 0}</div>
                    <div className="text-xs text-muted-foreground">New Episodes</div>
                  </div>
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
