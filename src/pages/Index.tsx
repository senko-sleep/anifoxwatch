import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { HeroSection } from '@/components/home/HeroSection';
import { AnimeGrid } from '@/components/anime/AnimeGrid';
import { TopAnimeList } from '@/components/anime/TopAnimeList';
import { mockAnimeList, topAnimeList, getTrendingAnime, getLatestAnime } from '@/data/mockAnime';

const Index = () => {
  const featuredAnime = mockAnimeList.slice(0, 5);
  const trendingAnime = getTrendingAnime();
  const latestAnime = getLatestAnime();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      
      {/* Hero */}
      <HeroSection featuredAnime={featuredAnime} />

      {/* Main Content */}
      <main className="flex-1 container py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Anime Grids */}
          <div className="flex-1 space-y-10">
            <AnimeGrid anime={trendingAnime} title="Trending Now" />
            <AnimeGrid anime={latestAnime} title="Latest Episodes" />
          </div>

          {/* Sidebar - Top 10 */}
          <div className="lg:w-80 flex-shrink-0">
            <TopAnimeList items={topAnimeList} />
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Index;
