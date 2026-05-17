
import { sourceManager } from '../server/src/services/source-manager.js';
import axios from 'axios';

async function testStreaming() {
    const episodeId = 'anilist-6347';
    const epNum = 5;
    
    console.log(`\n🚀 Testing Streaming for ID: ${episodeId}, Episode: ${epNum}`);
    
    const categories = ['sub', 'dub'] as const;
    
    for (const category of categories) {
        console.log(`\n--- Testing ${category.toUpperCase()} ---`);
        
        try {
            console.log(`Fetching servers...`);
            const servers = await sourceManager.getEpisodeServers(episodeId);
            console.log(`Found ${servers.length} servers: ${servers.map(s => s.name).join(', ')}`);
            
            if (servers.length === 0) {
                // Try direct streaming links if no servers found (some sources don't list servers separately)
                console.log(`No servers listed, trying direct getStreamingLinks...`);
                const links = await sourceManager.getStreamingLinks(episodeId, undefined, category, epNum, 6347);
                await validateLinks(links, category, 'auto');
            } else {
                for (const server of servers) {
                    console.log(`\nTesting Server: ${server.name} (${server.type})`);
                    try {
                        const links = await sourceManager.getStreamingLinks(episodeId, server.name, category, epNum, 6347);
                        await validateLinks(links, category, server.name);
                    } catch (err) {
                        console.error(`❌ Failed to get links for server ${server.name}:`, err instanceof Error ? err.message : err);
                    }
                }
            }
        } catch (err) {
            console.error(`❌ Error testing ${category}:`, err instanceof Error ? err.message : err);
        }
    }
}

async function validateLinks(links: any, category: string, serverName: string) {
    if (!links || !links.sources || links.sources.length === 0) {
        console.log(`❌ No sources found for ${category} on ${serverName}`);
        return;
    }
    
    console.log(`✅ Found ${links.sources.length} sources from ${links.source || 'unknown source'}`);
    
    for (const source of links.sources) {
        const url = source.url;
        console.log(`   Probing: ${source.quality || 'unknown'} - ${url.substring(0, 80)}...`);
        
        const start = Date.now();
        try {
            // If it's a proxied URL, it might be pointing to localhost:3001
            // We should probe the original URL if possible, or just the proxied one if the server is running
            const targetUrl = source.originalUrl || url;
            
            const response = await axios.get(targetUrl, { 
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': links.headers?.Referer || 'https://gogoanime.run/'
                },
                timeout: 10000,
                validateStatus: () => true // Check status manually
            });
            
            const duration = Date.now() - start;
            if (response.status >= 200 && response.status < 400) {
                console.log(`      ✅ [${response.status}] ${duration}ms - Working`);
            } else {
                console.log(`      ❌ [${response.status}] ${duration}ms - Broken`);
            }
        } catch (err) {
            const duration = Date.now() - start;
            console.log(`      ❌ ERROR ${duration}ms - ${err instanceof Error ? err.message : err}`);
        }
    }
}

testStreaming().catch(console.error);
