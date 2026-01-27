import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { HeroSection } from '@/components/home/HeroSection';
import { AnimeGrid } from '@/components/anime/AnimeGrid';
import { TopAnimeList } from '@/components/anime/TopAnimeList';
import { useTrending, useLatest, useTopRated } from '@/hooks/useAnime';
import { Loader2, AlertCircle, RefreshCw, TrendingUp, Clock, Award } from 'lucide-react';
import { Button } from '@/components/ui/button';

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

      {/* Hero Section */}
      {featuredAnime.length > 0 ? (
        <div className="relative">
          <HeroSection featuredAnime={featuredAnime} />
          <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background via-background/80 to-transparent pointer-events-none" />
        </div>
      ) : isLoading ? (
        <div className="h-[60vh] flex items-center justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-zinc-600" />
        </div>
      ) : null}

      {/* Error State */}
      {hasError && (
        <div className="max-w-[2000px] mx-auto px-6 py-6">
          <div className="flex items-center gap-4 p-5 rounded-lg bg-red-950/20 border border-red-900/30 backdrop-blur-sm">
            <AlertCircle className="w-6 h-6 text-red-400 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="font-semibold text-red-400 text-sm">Connection Error</h3>
              <p className="text-xs text-zinc-500 mt-0.5">Unable to load content. Check your connection.</p>
            </div>
            <Button
              onClick={handleRefresh}
              size="sm"
              variant="outline"
              className="border-red-900/50 text-red-400 hover:bg-red-950/30 h-8 px-3"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Retry
            </Button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-[2000px] mx-auto px-6 py-10">
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-10">
          <div className="xl:col-span-9 space-y-14">
            {/* Trending Now */}
            <section className="animate-fade-in">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <TrendingUp className="w-5 h-5 text-muted-foreground" />
                  <h2 className="text-2xl font-semibold tracking-tight">Trending Now</h2>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground hover:bg-fox-surface transition-all h-8 px-3 text-sm"
                >
                  View All
                </Button>
              </div>

              {trendingLoading ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-4">
                  {[...Array(32)].map((_, i) => (
                    <div
                      key={i}
                      className="aspect-[2/3] rounded-md bg-fox-surface/40 animate-pulse"
                      style={{ animationDelay: `${i * 30}ms` }}
                    />
                  ))}
                </div>
              ) : trendingAnime && trendingAnime.length > 0 ? (
                <AnimeGrid anime={trendingAnime.slice(0, 32)} columns={8} />
              ) : (
                <div className="text-center py-16 bg-fox-surface/20 rounded-xl border border-border/60">
                  <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">No trending content available</p>
                </div>
              )}
            </section>

            {/* Latest Episodes */}
            <section className="animate-fade-in" style={{ animationDelay: '100ms' }}>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-muted-foreground" />
                  <h2 className="text-2xl font-semibold tracking-tight">Latest Episodes</h2>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground hover:bg-fox-surface transition-all h-8 px-3 text-sm"
                >
                  Schedule
                </Button>
              </div>

              {latestLoading ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-4">
                  {[...Array(32)].map((_, i) => (
                    <div
                      key={i}
                      className="aspect-[2/3] rounded-md bg-fox-surface/40 animate-pulse"
                      style={{ animationDelay: `${i * 30}ms` }}
                    />
                  ))}
                </div>
              ) : latestAnime && latestAnime.length > 0 ? (
                <AnimeGrid anime={latestAnime.slice(0, 32)} columns={8} />
              ) : (
                <div className="text-center py-16 bg-fox-surface/20 rounded-xl border border-border/60">
                  <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">No new episodes available</p>
                </div>
              )}
            </section>

            {/* Top Rated */}
            <section className="animate-fade-in" style={{ animationDelay: '200ms' }}>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <Award className="w-5 h-5 text-amber-500/80" />
                  <h2 className="text-2xl font-semibold tracking-tight">Top Rated</h2>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground hover:bg-fox-surface transition-all h-8 px-3 text-sm"
                >
                  View All
                </Button>
              </div>

              {topLoading ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-4">
                  {[...Array(32)].map((_, i) => (
                    <div
                      key={i}
                      className="aspect-[2/3] rounded-md bg-fox-surface/40 animate-pulse"
                      style={{ animationDelay: `${i * 30}ms` }}
                    />
                  ))}
                </div>
              ) : bestAnime.length > 0 ? (
                <AnimeGrid anime={bestAnime.slice(0, 32)} columns={8} />
              ) : (
                <div className="text-center py-16 bg-fox-surface/20 rounded-xl border border-border/60">
                  <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">No top rated content available</p>
                </div>
              )}
            </section>
          </div>

          <aside className="hidden xl:block xl:col-span-3">
            <div className="sticky top-24 rounded-2xl bg-fox-surface/30 border border-border/60 p-5">
              <TopAnimeList items={topAnimeList || []} />
            </div>
          </aside>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Index;