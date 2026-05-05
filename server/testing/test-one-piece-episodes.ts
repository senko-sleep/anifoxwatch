import { GogoanimeSource } from '../src/sources/gogoanime-source.js';
import axios from 'axios';
import * as cheerio from 'cheerio';

async function debugEpisodeExtraction() {
    console.log('=== Debugging One Piece Episode Extraction ===\n');
    
    const source = new GogoanimeSource();
    const baseUrl = 'https://anitaku.to';
    const animeId = 'one-piece';
    
    // Step 1: Fetch the category page
    console.log('1. Fetching category page...');
    try {
        const response = await axios.get(`${baseUrl}/category/${animeId}`, {
            timeout: 15000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        });
        
        const $ = cheerio.load(response.data);
        const html = response.data;
        
        // Step 2: Extract episode info
        console.log('\n2. Looking for episode data in page...');
        
        // Check for movie_id
        const movieId = $('#movie_id').val();
        console.log(`   movie_id: ${movieId || 'NOT FOUND'}`);
        
        // Check for alias_anime
        const alias = $('#alias_anime').val();
        console.log(`   alias_anime: ${alias || 'NOT FOUND'}`);
        
        // Check for ep_end in episode_page li
        const epEndFromLi = $('#episode_page li').last().find('a').attr('ep_end');
        console.log(`   ep_end from li: ${epEndFromLi || 'NOT FOUND'}`);
        
        // Search script content for ep_end
        const scriptContent = $('script:contains("episode_page")').html() || 
                             $('script').toArray().map(s => $(s).html()).join('\n');
        const epEndMatch = scriptContent.match(/ep_end\s*=\s*["'](\d+)["']/) || 
                          scriptContent.match(/ep_end["']?\s*:\s*["']?(\d+)/);
        console.log(`   ep_end from script regex: ${epEndMatch ? epEndMatch[1] : 'NOT FOUND'}`);
        
        // Check schema.org data
        const schemaScript = $('script[type="application/ld+json"]').html();
        let schemaEps = 0;
        if (schemaScript) {
            try {
                const schema = JSON.parse(schemaScript);
                schemaEps = schema.numberOfEpisodes || 0;
                console.log(`   schema.org episodes: ${schemaEps || 'NOT FOUND'}`);
            } catch (e) {
                console.log(`   schema.org: Failed to parse - ${e}`);
            }
        } else {
            console.log('   schema.org: No script tag found');
        }
        
        // Check for any episode list elements
        const episodeLinks = $('a[href*="episode"]').length;
        console.log(`   Episode links found: ${episodeLinks}`);
        
        // Look for episode count in any element
        const epCountElements = $('[class*="ep"], [id*="ep"]').length;
        console.log(`   Elements with 'ep' in class/id: ${epCountElements}`);
        
        // Try to find active episode count display
        const activeEpText = $('.active, .anime_video_body, .anime_info_body').text();
        const epCountInText = activeEpText.match(/(\d+)\s*episodes?/i);
        console.log(`   Episode count in text: ${epCountInText ? epCountInText[1] : 'NOT FOUND'}`);
        
    } catch (error) {
        console.error('   ERROR:', error);
    }
    
    // Step 3: Test getEpisodes method
    console.log('\n3. Testing getEpisodes method...');
    const episodes = await source.getEpisodes(`gogoanime-${animeId}`);
    console.log(`   Episodes returned: ${episodes.length}`);
    if (episodes.length > 0) {
        console.log(`   First episode: ${episodes[0].id}, number: ${episodes[0].number}`);
        console.log(`   Last episode: ${episodes[episodes.length - 1].id}, number: ${episodes[episodes.length - 1].number}`);
    }
    
    // Step 4: Test streaming with dub vs sub
    console.log('\n4. Testing streaming links (sub vs dub)...');
    if (episodes.length > 0) {
        const firstEp = episodes[0];
        
        console.log('\n   Testing SUB...');
        const subStream = await source.getStreamingLinks(firstEp.id, undefined, 'sub');
        console.log(`   Sources: ${subStream.sources.length}`);
        subStream.sources.forEach((s, i) => {
            console.log(`     [${i}] ${s.quality}: ${s.url?.substring(0, 80)}...`);
        });
        
        console.log('\n   Testing DUB...');
        const dubStream = await source.getStreamingLinks(firstEp.id, undefined, 'dub');
        console.log(`   Sources: ${dubStream.sources.length}`);
        dubStream.sources.forEach((s, i) => {
            console.log(`     [${i}] ${s.quality}: ${s.url?.substring(0, 80)}...`);
        });
        
        // Check if they're the same
        const sameUrls = subStream.sources.length === dubStream.sources.length && 
                        subStream.sources.every((s, i) => s.url === dubStream.sources[i]?.url);
        console.log(`\n   Are sub and dub the same? ${sameUrls ? 'YES (BUG!)' : 'NO'}`);
    }
}

debugEpisodeExtraction()
    .then(() => {
        console.log('\n=== Test Complete ===');
        process.exit(0);
    })
    .catch(e => {
        console.error('Test failed:', e);
        process.exit(1);
    });
