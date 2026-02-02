import { HiAnime } from 'aniwatch';

async function testSearchFilters() {
    const hianime = new HiAnime.Scraper();

    // Try search with filters
    try {
        console.log('Testing search with filters...');

        // Try searching for movies
        const movieSearch = await hianime.search('movie', 1, { type: 'movie' });
        console.log('Movie search results:', movieSearch.animes?.length || 0);
        if (movieSearch.animes?.length > 0) {
            console.log('First 5 results types:');
            movieSearch.animes.slice(0, 5).forEach((anime: any) => {
                console.log(`- ${anime.name} (${anime.type})`);
            });
        }

        // Try searching for TV shows
        const tvSearch = await hianime.search('tv', 1, { type: 'tv' });
        console.log('TV search results:', tvSearch.animes?.length || 0);
        if (tvSearch.animes?.length > 0) {
            console.log('First 5 results types:');
            tvSearch.animes.slice(0, 5).forEach((anime: any) => {
                console.log(`- ${anime.name} (${anime.type})`);
            });
        }

        // Try getting home page animes
        const home = await hianime.getHomePage();
        console.log('\nHome page sections:');
        console.log('- Spotlight:', home.spotlightAnimes?.length || 0);
        console.log('- Trending:', home.trendingAnimes?.length || 0);
        console.log('- Latest episodes:', home.latestEpisodeAnimes?.length || 0);
        console.log('- Upcoming:', home.topUpcomingAnimes?.length || 0);
        console.log('- Top 10:', home.top10Animes?.today?.length || 0);
        console.log('- Top airing:', home.topAiringAnimes?.length || 0);
        console.log('- Most popular:', home.mostPopularAnimes?.length || 0);
        console.log('- Most favorite:', home.mostFavoriteAnimes?.length || 0);
        console.log('- Latest completed:', home.latestCompletedAnimes?.length || 0);

        // Check types of most popular animes
        if (home.mostPopularAnimes?.length > 0) {
            console.log('\nMost popular animes types:');
            const types = new Map();
            home.mostPopularAnimes.forEach((anime: any) => {
                const type = anime.type || 'unknown';
                types.set(type, (types.get(type) || 0) + 1);
            });
            Array.from(types.entries()).forEach(([type, count]) => {
                console.log(`- ${type}: ${count}`);
            });
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

testSearchFilters().catch(console.error);