import { HiAnime } from 'aniwatch';

async function testTypeFilters() {
    const hianime = new HiAnime.Scraper();

    try {
        console.log('Testing search with type filters...');

        // Try searching for movies with type filter
        console.log('\n1. Searching with type: movie');
        const movieResults = await hianime.search('', 1, { type: 'movie' });
        console.log('Results:', movieResults.animes?.length || 0);
        if (movieResults.animes?.length > 0) {
            const types = new Set();
            movieResults.animes.forEach((anime: any) => types.add(anime.type));
            console.log('Types found:', Array.from(types));
            console.log('First 5 titles:');
            movieResults.animes.slice(0, 5).forEach((anime: any) => {
                console.log(`- ${anime.name} (${anime.type})`);
            });
        }

        // Try searching for TV with type filter
        console.log('\n2. Searching with type: tv');
        const tvResults = await hianime.search('', 1, { type: 'tv' });
        console.log('Results:', tvResults.animes?.length || 0);
        if (tvResults.animes?.length > 0) {
            const types = new Set();
            tvResults.animes.forEach((anime: any) => types.add(anime.type));
            console.log('Types found:', Array.from(types));
            console.log('First 5 titles:');
            tvResults.animes.slice(0, 5).forEach((anime: any) => {
                console.log(`- ${anime.name} (${anime.type})`);
            });
        }

        // Try searching for OVA with type filter
        console.log('\n3. Searching with type: ova');
        const ovaResults = await hianime.search('', 1, { type: 'ova' });
        console.log('Results:', ovaResults.animes?.length || 0);
        if (ovaResults.animes?.length > 0) {
            const types = new Set();
            ovaResults.animes.forEach((anime: any) => types.add(anime.type));
            console.log('Types found:', Array.from(types));
            console.log('First 5 titles:');
            ovaResults.animes.slice(0, 5).forEach((anime: any) => {
                console.log(`- ${anime.name} (${anime.type})`);
            });
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

testTypeFilters().catch(console.error);