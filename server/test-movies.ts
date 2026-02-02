import { SourceManager } from './src/services/source-manager.js';

async function testMovies() {
    const sourceManager = new SourceManager();

    console.log('Testing movie browsing...');

    const result = await sourceManager.browseAnime({
        type: 'Movie',
        sort: 'popularity'
    });

    console.log(`Found ${result.anime.length} movies`);

    const allAreMovies = result.anime.every(anime => anime.type === 'Movie');
    console.log(`All results are movies: ${allAreMovies}`);

    if (!allAreMovies) {
        const nonMovies = result.anime.filter(anime => anime.type !== 'Movie');
        console.log('Non-movie results found:');
        nonMovies.forEach(anime => {
            console.log(`- ${anime.title} (${anime.type})`);
        });
    }

    console.log('\nFirst 5 movie details:');
    result.anime.slice(0, 5).forEach((movie, index) => {
        console.log(`${index + 1}. ${movie.title}`);
        console.log(`   Type: ${movie.type}`);
        console.log(`   Year: ${movie.year}`);
        console.log(`   Episodes: ${movie.episodes}`);
        console.log(`   Rating: ${movie.rating}`);
    });
}

testMovies().catch(console.error);