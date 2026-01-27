/**
 * Test the proxy stream functionality
 */

import axios from 'axios';

const API_BASE = 'http://localhost:3001/api';

async function testProxyStream() {
    console.log('🧪 Testing Proxy Stream Functionality\n');
    console.log('='.repeat(60));
    
    try {
        // Step 1: Get episodes for a known anime
        console.log('\n📍 Step 1: Get episodes');
        const episodesRes = await axios.get(`${API_BASE}/anime/hianime-one-piece-100/episodes`);
        const episodes = episodesRes.data.episodes || [];
        console.log(`✅ Found ${episodes.length} episodes`);
        
        if (episodes.length === 0) {
            console.log('❌ No episodes found');
            return;
        }
        
        const firstEp = episodes[0];
        console.log(`   First episode: ${firstEp.id}`);
        
        // Step 2: Get streaming links (with proxy)
        console.log('\n📍 Step 2: Get streaming links (proxied)');
        const streamRes = await axios.get(`${API_BASE}/stream/watch/${encodeURIComponent(firstEp.id)}`, {
            params: { server: 'hd-1', category: 'sub' }
        });
        
        const streamData = streamRes.data;
        console.log(`✅ Got ${streamData.sources?.length || 0} sources`);
        
        if (streamData.sources?.length > 0) {
            const source = streamData.sources[0];
            console.log(`\n📺 Stream URL preview:`);
            console.log(`   ${source.url.substring(0, 100)}...`);
            console.log(`   Quality: ${source.quality}`);
            console.log(`   Is proxied: ${source.url.includes('/api/stream/proxy')}`);
            
            // Step 3: Test the proxy endpoint
            console.log('\n📍 Step 3: Test proxy endpoint');
            try {
                const proxyRes = await axios.get(source.url, {
                    timeout: 15000,
                    validateStatus: () => true
                });
                
                console.log(`   Proxy response status: ${proxyRes.status}`);
                console.log(`   Content-Type: ${proxyRes.headers['content-type']}`);
                
                if (proxyRes.status === 200) {
                    const content = typeof proxyRes.data === 'string' ? proxyRes.data : proxyRes.data.toString();
                    const isM3u8 = content.includes('#EXTM3U');
                    console.log(`   Is valid m3u8: ${isM3u8}`);
                    
                    if (isM3u8) {
                        // Check if URLs inside are also proxied
                        const hasProxiedUrls = content.includes('/api/stream/proxy');
                        console.log(`   URLs inside are proxied: ${hasProxiedUrls}`);
                        
                        // Show first few lines
                        console.log('\n   📄 M3U8 content preview:');
                        content.split('\n').slice(0, 10).forEach(line => {
                            console.log(`      ${line.substring(0, 100)}`);
                        });
                    }
                    
                    console.log('\n' + '*'.repeat(60));
                    console.log('🎉 PROXY IS WORKING!');
                    console.log('*'.repeat(60));
                } else {
                    console.log(`❌ Proxy returned error: ${proxyRes.status}`);
                    console.log(`   Response: ${JSON.stringify(proxyRes.data).substring(0, 200)}`);
                }
            } catch (proxyError: any) {
                console.log(`❌ Proxy request failed: ${proxyError.message}`);
            }
        }
        
    } catch (error: any) {
        console.error('❌ Test failed:', error.message);
        if (error.response?.data) {
            console.log('Error response:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

testProxyStream();
