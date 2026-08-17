/**
 * Test script for streaming functionality
 * Tests both hentai and anime streaming with new routing
 */

import axios from 'axios';

const API_BASE = 'http://localhost:3001';

async function testHentaiResolution() {
    console.log('\n=== Testing Hentai Resolution ===');
    
    try {
        // Test hentai slug resolution
        const hentaiSlug = 'a-kiss-for-the-petals-joined-in-love-with-you';
        console.log(`Testing slug resolution for: ${hentaiSlug}`);
        
        const response = await axios.get(`${API_BASE}/api/anime/resolve-slug?slug=${encodeURIComponent(hentaiSlug)}&mode=adult`);
        console.log('✅ Hentai slug resolved:', response.data);
        
        // Check if it found the expected title
        if (response.data.title) {
            console.log(`🎯 Found title: "${response.data.title}"`);
            if (response.data.title.includes('Sono Hanabira') || response.data.title.includes('Reo x Mai')) {
                console.log('✅ Correctly found "Sono Hanabira ni Kuchizuke wo: Reo x Mai Diaries" variant');
            }
        }
        
        return response.data;
    } catch (error) {
        console.error('❌ Hentai resolution failed:', error.response?.data || error.message);
        return null;
    }
}

async function testAnimeResolution() {
    console.log('\n=== Testing Anime Resolution ===');
    
    try {
        // Test anime slug resolution
        const animeSlug = 'chainsmoker-cat';
        console.log(`Testing slug resolution for: ${animeSlug}`);
        
        const response = await axios.get(`${API_BASE}/api/anime/resolve-slug?slug=${animeSlug}&mode=safe`);
        console.log('✅ Anime slug resolved:', response.data);
        
        return response.data;
    } catch (error) {
        console.error('❌ Anime resolution failed:', error.response?.data || error.message);
        return null;
    }
}

async function testStreaming(animeId, episode = 1, type = 'anime') {
    console.log(`\n=== Testing Streaming for ${type} ===`);
    console.log(`Anime ID: ${animeId}, Episode: ${episode}`);
    
    try {
        // First try to get episodes to find the correct episode ID
        const episodesResponse = await axios.get(`${API_BASE}/api/anime/episodes?id=${encodeURIComponent(animeId)}`, {
            timeout: 15000
        });
        
        console.log(`✅ Episodes found: ${episodesResponse.data.episodes?.length || 0}`);
        
        if (episodesResponse.data.episodes && episodesResponse.data.episodes.length > 0) {
            const targetEpisode = episodesResponse.data.episodes[episode - 1] || episodesResponse.data.episodes[0];
            console.log(`Using episode ID: ${targetEpisode.id}`);
            animeId = targetEpisode.id;
        } else {
            console.log('❌ No episodes found, using direct ID');
            // Fall back to direct streaming attempt
        }
        
        const response = await axios.get(`${API_BASE}/api/stream/watch/${encodeURIComponent(animeId)}?ep=${episode}`, {
            timeout: 30000
        });
        
        console.log('✅ Streaming response received');
        console.log(`Sources found: ${response.data.sources?.length || 0}`);
        console.log(`Source: ${response.data.source}`);
        console.log(`Category: ${response.data.category}`);
        
        if (response.data.sources && response.data.sources.length > 0) {
            console.log('First source:', {
                quality: response.data.sources[0].quality,
                type: response.data.sources[0].type,
                isM3U8: response.data.sources[0].isM3U8
            });
        }
        
        return response.data;
    } catch (error) {
        console.error('❌ Streaming failed:', error.response?.data || error.message);
        return null;
    }
}

async function testHanimeSearch() {
    console.log('\n=== Testing Hanime Search ===');
    
    try {
        const query = 'Sono Hanabira';
        console.log(`Searching for: ${query}`);
        
        const response = await axios.get(`${API_BASE}/api/anime/search?q=${encodeURIComponent(query)}&source=Hanime&mode=adult`);
        console.log('✅ Hanime search results:', {
            totalResults: response.data.results?.length || 0,
            source: response.data.source
        });
        
        if (response.data.results && response.data.results.length > 0) {
            console.log('First result:', {
                id: response.data.results[0].id,
                title: response.data.results[0].title
            });
        }
        
        return response.data;
    } catch (error) {
        console.error('❌ Hanime search failed:', error.response?.data || error.message);
        return null;
    }
}

async function runTests() {
    console.log('🚀 Starting streaming tests...\n');
    
    // Test 1: Hentai resolution with correct slug
    const hentaiSlug = 'a-kiss-for-the-petals-joined-in-love-with-you';
    console.log(`\n=== Testing Hentai URL: /watch/hentai/${hentaiSlug}?ep=1 ===`);
    const hentaiResult = await testHentaiResolution();
    
    // Test 2: Anime resolution with correct slug
    const animeSlug = 'chainsmoker-cat';
    console.log(`\n=== Testing Anime URL: /watch/anime/${animeSlug}?ep=2 ===`);
    const animeResult = await testAnimeResolution();
    
    // Test 3: Test hentai streaming (should find "Sono Hanabira ni Kuchizuke wo: Reo x Mai Diaries")
    if (hentaiResult && hentaiResult.id) {
        console.log(`\n=== Testing Hentai Streaming ===`);
        console.log(`Found: ${hentaiResult.title}`);
        await testStreaming(hentaiResult.id, 1, 'hentai');
    }
    
    // Test 4: Test anime streaming
    if (animeResult && animeResult.id) {
        console.log(`\n=== Testing Anime Streaming ===`);
        console.log(`Found: ${animeResult.title}`);
        
        // Try episode 1 first
        const streamResult = await testStreaming(animeResult.id, 1, 'anime');
        
        // If episode 1 fails, try the original anime ID directly
        if (!streamResult) {
            console.log('\n=== Trying direct anime ID streaming ===');
            try {
                const directResponse = await axios.get(`${API_BASE}/api/stream/watch/${encodeURIComponent(animeResult.id)}?ep=1`, {
                    timeout: 30000
                });
                console.log('✅ Direct streaming response received');
                console.log(`Sources found: ${directResponse.data.sources?.length || 0}`);
                console.log(`Source: ${directResponse.data.source}`);
            } catch (error) {
                console.error('❌ Direct streaming failed:', error.response?.data || error.message);
            }
        }
    }
    
    console.log('\n✅ All tests completed!');
}

// Run tests
runTests().catch(error => {
    console.error('💥 Test suite failed:', error);
    process.exit(1);
});