import { SourceManager } from './src/services/source-manager.js';

async function testFormatSearch() {
    console.log('Testing format-specific search with SourceManager...');

    const sourceManager = new SourceManager();

    try {
        console.log('\n=== Test 1: Browsing for Movies ===');
        const movieResult = await sourceManager.browseAnime({
            type: 'Movie',
            sort: 'popularity'
        });

        console.log(`Found ${movieResult.anime.length} movies`);
        if (movieResult.anime.length > 0) {
            console.log('First 10 movie titles:');
            movieResult.anime.slice(0, 10).forEach((anime, index) => {
                console.log(`${index + 1}. ${anime.title} (Type: ${anime.type})`);
            });

            // Verify all results are movies
            const allAreMovies = movieResult.anime.every(anime => anime.type === 'Movie');
            console.log(`\n✅ All results are movies: ${allAreMovies}`);
        }

        console.log('\n=== Test 2: Browsing for TV Shows ===');
        const tvResult = await sourceManager.browseAnime({
            type: 'TV',
            sort: 'popularity'
        });

        console.log(`Found ${tvResult.anime.length} TV shows`);
        if (tvResult.anime.length > 0) {
            console.log('First 10 TV show titles:');
            tvResult.anime.slice(0, 10).forEach((anime, index) => {
                console.log(`${index + 1}. ${anime.title} (Type: ${anime.type})`);
            });

            // Verify all results are TV shows
            const allAreTV = tvResult.anime.every(anime => anime.type === 'TV');
            console.log(`\n✅ All results are TV shows: ${allAreTV}`);
        }

        console.log('\n=== Test 3: Browsing for OVA ===');
        const ovaResult = await sourceManager.browseAnime({
            type: 'OVA',
            sort: 'popularity'
        });

        console.log(`Found ${ovaResult.anime.length} OVAs`);
        if (ovaResult.anime.length > 0) {
            console.log('First 10 OVA titles:');
            ovaResult.anime.slice(0, 10).forEach((anime, index) => {
                console.log(`${index + 1}. ${anime.title} (Type: ${anime.type})`);
            });

            // Verify all results are OVAs
            const allAreOVA = ovaResult.anime.every(anime => anime.type === 'OVA');
            console.log(`\n✅ All results are OVAs: ${allAreOVA}`);
        }

        console.log('\n=== Test 4: Browsing for ONAs ===');
        const onaResult = await sourceManager.browseAnime({
            type: 'ONA',
            sort: 'popularity'
        });

        console.log(`Found ${onaResult.anime.length} ONAs`);
        if (onaResult.anime.length > 0) {
            console.log('First 10 ONA titles:');
            onaResult.anime.slice(0, 10).forEach((anime, index) => {
                console.log(`${index + 1}. ${anime.title} (Type: ${anime.type})`);
            });

            // Verify all results are ONAs
            const allAreONA = onaResult.anime.every(anime => anime.type === 'ONA');
            console.log(`\n✅ All results are ONAs: ${allAreONA}`);
        }

        console.log('\n=== Test 5: Browsing for Specials ===');
        const specialResult = await sourceManager.browseAnime({
            type: 'Special',
            sort: 'popularity'
        });

        console.log(`Found ${specialResult.anime.length} specials`);
        if (specialResult.anime.length > 0) {
            console.log('First 10 special titles:');
            specialResult.anime.slice(0, 10).forEach((anime, index) => {
                console.log(`${index + 1}. ${anime.title} (Type: ${anime.type})`);
            });

            // Verify all results are specials
            const allAreSpecial = specialResult.anime.every(anime => anime.type === 'Special');
            console.log(`\n✅ All results are specials: ${allAreSpecial}`);
        }

        console.log('\n🎉 All format-specific browse tests completed successfully!');

    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

testFormatSearch().catch(console.error);