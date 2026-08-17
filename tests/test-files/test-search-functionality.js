/**
 * Test script for search functionality
 */

import axios from 'axios';

const API_BASE = 'http://localhost:3001';

async function testSearch() {
    console.log('🔍 Testing Search Functionality...\n');
    
    try {
        // Test 1: Basic search
        console.log('=== Test 1: Basic search for "naruto" ===');
        const searchResponse = await axios.get(`${API_BASE}/api/anime/search?q=naruto`);
        console.log('✅ Search response:', {
            totalResults: searchResponse.data.results?.length || 0,
            source: searchResponse.data.source,
            firstResult: searchResponse.data.results?.[0]?.title || 'N/A'
        });
        
        // Test 2: Hentai search
        console.log('\n=== Test 2: Hentai search for "kiss hug" ===');
        const hentaiSearchResponse = await axios.get(`${API_BASE}/api/anime/search?q=kiss+hug&mode=adult`);
        console.log('✅ Hentai search response:', {
            totalResults: hentaiSearchResponse.data.results?.length || 0,
            source: hentaiSearchResponse.data.source,
            firstResult: hentaiSearchResponse.data.results?.[0]?.title || 'N/A'
        });
        
        // Test 3: Health check
        console.log('\n=== Test 3: API Health check ===');
        const healthResponse = await axios.get(`${API_BASE}/api/health`);
        console.log('✅ API Health:', healthResponse.data);
        
        console.log('\n✅ All search tests passed!');
        
    } catch (error) {
        console.error('❌ Search test failed:', error.response?.data || error.message);
    }
}

testSearch().catch(error => {
    console.error('💥 Test suite failed:', error);
    process.exit(1);
});