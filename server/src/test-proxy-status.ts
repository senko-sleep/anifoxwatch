import axios from 'axios';
import { AniwavesSource } from './sources/aniwaves-source.js';

async function testProxyStatus() {
    const source = new AniwavesSource();
    const proxyBase = 'http://localhost:3001/api/stream/proxy';
    
    console.log('🚀 Starting Proxy Status Test');

    // 1. Get a stream URL
    console.log('📡 Fetching stream from Aniwaves...');
    const search = await source.search('Spy x Family');
    const animeId = search.results[0].id;
    const episodes = await source.getEpisodes(animeId);
    const episodeId = episodes[0].id;
    const servers = await source.getEpisodeServers(episodeId);
    const vidplay = servers.find(s => s.name === 'Vidplay');
    
    if (!vidplay) {
        console.error('❌ Could not find Vidplay server');
        return;
    }

    const streamData = await source.getStreamingLinks(episodeId, vidplay.url);
    let currentUrl = streamData.sources.find(s => s.isM3U8)?.url;

    if (!currentUrl) {
        console.error('❌ Could not find m3u8 URL');
        return;
    }

    console.log(`🔗 Initial URL: ${currentUrl}`);

    // Follow playlists
    for (let i = 0; i < 3; i++) {
        console.log(`\n🧪 Testing Proxy (Level ${i}): ${currentUrl.substring(0, 100)}...`);
        try {
            const resp: any = await axios.get(proxyBase, {
                params: { url: currentUrl, referer: 'https://aniwaves.ru/' }
            });

            if (resp.status !== 200 && resp.status !== 206) {
                console.error(`❌ Proxy returned status ${resp.status}`);
                return;
            }

            console.log(`✅ Proxy returned ${resp.status} OK`);
            const contentType = resp.headers['content-type'] || '';
            console.log(`📄 Content-Type: ${contentType}`);

            if (contentType.includes('mpegurl') || (currentUrl && currentUrl.includes('.m3u8'))) {
                const content: any = resp.data;
                const lines: string[] = (content as string).split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
                
                // Check for duration info
                const hasDuration = lines.some((l: string) => l.startsWith('#EXTINF:'));
                if (hasDuration) {
                    console.log('✅ Found #EXTINF tags (Duration info present)');
                }

                // Check for VOD/Endlist
                const hasEndlist = lines.some((l: string) => l.includes('#EXT-X-ENDLIST'));
                if (hasEndlist) {
                    console.log('✅ Found #EXT-X-ENDLIST (Total duration should be known)');
                } else {
                    console.warn('⚠️ #EXT-X-ENDLIST NOT found (Player might treat as Live stream)');
                }

                console.log(`📄 Last 5 lines: ${lines.slice(-5).join(' | ')}`);

                // Find next URL
                const nextUrlPart: string | undefined = lines.find((line: string) => !line.startsWith('#') && line.trim().length > 0);
                if (nextUrlPart) {
                    if (nextUrlPart.startsWith('http')) {
                        currentUrl = nextUrlPart;
                    } else {
                        // Handle relative URLs if they exist (should be absolute after proxy rewrite)
                        console.log(`📄 Next line: ${nextUrlPart}`);
                        break;
                    }
                } else {
                    console.log('🏁 End of playlist chain');
                    break;
                }
            } else {
                // Not a manifest, must be a segment
                console.log('🎬 Reached a media segment');
                console.log('📄 All Headers:', JSON.stringify(resp.headers, null, 2));
                if (resp.headers['accept-ranges'] === 'bytes') {
                    console.log('✅ Accept-Ranges: bytes (Seeking/Duration jumping supported)');
                } else {
                    console.warn('⚠️ Accept-Ranges: bytes NOT found');
                }
                console.log(`✅ Content-Length: ${resp.headers['content-length']}`);
                break;
            }
        } catch (error: any) {
            console.error(`❌ Proxy request failed: ${error.message}`);
            if (error.response) {
                console.error(`   Status: ${error.response.status}`);
            }
            return;
        }
    }
}

testProxyStatus().catch(err => {
    console.error('Test script crashed:', err);
});
