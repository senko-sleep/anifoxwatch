import { HiAnime } from 'aniwatch';

async function testCategories() {
    const hianime = new HiAnime.Scraper();

    // Try to find movie category
    try {
        console.log('Trying to get movie category...');
        const movieData = await hianime.getCategoryAnime('movies' as any, 1);
        console.log('✅ Movies category found:', movieData.animes?.length || 0, 'movies');
        if (movieData.animes?.length > 0) {
            console.log('First movie:', movieData.animes[0].name, 'Type:', movieData.animes[0].type);
        }
    } catch (error) {
        console.error('❌ Error getting movies category:', error);
    }

    try {
        console.log('\nTrying to get tv category...');
        const tvData = await hianime.getCategoryAnime('tv-series' as any, 1);
        console.log('✅ TV series category found:', tvData.animes?.length || 0, 'series');
        if (tvData.animes?.length > 0) {
            console.log('First TV series:', tvData.animes[0].name, 'Type:', tvData.animes[0].type);
        }
    } catch (error) {
        console.error('❌ Error getting TV series category:', error);
    }

    // Try to find other categories
    const possibleCategories = [
        'movies',
        'tv-series',
        'ova',
        'ona',
        'specials',
        'anime-movies',
        'anime-series',
        'subbed-movies',
        'dubbed-movies',
        'latest-movies'
    ];

    console.log('\nChecking possible categories:');
    for (const category of possibleCategories) {
        try {
            const data = await hianime.getCategoryAnime(category as any, 1);
            console.log(`✅ ${category}:`, data.animes?.length || 0, 'results');
        } catch (error) {
            console.log(`❌ ${category}:`, (error as Error).message);
        }
    }

    try {
        console.log('\nChecking home page for categories...');
        const home = await hianime.getHomePage();
        console.log('Home page sections:', Object.keys(home));
        if (home.trendingAnimes?.length > 0) {
            console.log('First trending:', home.trendingAnimes[0].name, 'Type:', home.trendingAnimes[0].type);
        }
    } catch (error) {
        console.error('❌ Error getting home page:', error);
    }
}

testCategories().catch(console.error);