import axios from 'axios';
import * as cheerio from 'cheerio';

async function debugGogoDub() {
    const baseUrl = 'https://anitaku.to';
    const slugs = [
        'rezero-kara-hajimeru-isekai-seikatsu-4th-season-dub-episode-1',
        're-zero-starting-life-in-another-world-season-4-dub-episode-1',
    ];
    
    for (const slug of slugs) {
        console.log(`\n=== Testing: ${slug} ===`);
        try {
            const resp = await axios.get(`${baseUrl}/${slug}`, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': baseUrl,
                },
                validateStatus: s => s < 500
            });
            console.log(`Status: ${resp.status}`);
            
            const $ = cheerio.load(resp.data);
            
            // Check for embed URLs
            const embeds: any[] = [];
            $('.anime_muti_link ul li, .anime_video_body_watch_items li').each((_, el) => {
                const a = $(el).find('a');
                const dataVideo = a.attr('data-video') || '';
                const name = $(el).text().replace('Choose this server', '').trim();
                if (dataVideo) {
                    embeds.push({ name: name.substring(0, 30), url: dataVideo.substring(0, 80) + '...' });
                }
            });
            console.log(`Embeds found: ${embeds.length}`);
            embeds.forEach(e => console.log(`  - ${e.name}: ${e.url}`));
            
            // Try to fetch first embed
            if (embeds.length > 0) {
                const firstEmbed = embeds[0];
                const fullUrl = firstEmbed.url.replace('...', '').startsWith('http') ? firstEmbed.url.replace('...', '') : `https:${firstEmbed.url.replace('...', '')}`;
                // Get full data-video
                const fullDataVideo = $('.anime_muti_link ul li a, .anime_video_body_watch_items li a').first().attr('data-video') || '';
                const embedUrl = fullDataVideo.startsWith('http') ? fullDataVideo : `https:${fullDataVideo}`;
                console.log(`\nFetching embed: ${embedUrl.substring(0, 80)}...`);
                
                try {
                    const embedResp = await axios.get(embedUrl, {
                        timeout: 8000,
                        headers: { 'Referer': baseUrl, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                    });
                    
                    const html = typeof embedResp.data === 'string' ? embedResp.data : JSON.stringify(embedResp.data);
                    const m3u8Matches = [...html.matchAll(/["']([^"']*\.m3u8[^"']*?)["']/g)]
                        .map(m => m[1])
                        .filter(u => u.startsWith('http') && !u.includes('thumb') && !u.includes('poster'));
                    
                    console.log(`m3u8 URLs found: ${m3u8Matches.length}`);
                    m3u8Matches.forEach(u => console.log(`  - ${u.substring(0, 100)}...`));
                    
                    if (m3u8Matches.length > 0) {
                        // Check if ad-poisoned
                        const m3u8Resp = await axios.get(m3u8Matches[0], { timeout: 5000 });
                        const playlist = typeof m3u8Resp.data === 'string' ? m3u8Resp.data : '';
                        const lines = playlist.split('\n').filter((l: string) => l.trim() && !l.startsWith('#'));
                        const adLines = lines.filter((l: string) => l.includes('ibyteimg') || l.includes('ad-site') || l.includes('doubleclick') || l.includes('googlesyndication'));
                        console.log(`\nPlaylist segments: ${lines.length}, ad segments: ${adLines.length}`);
                        if (lines.length > 0) {
                            console.log(`First 3 segments:`);
                            lines.slice(0, 3).forEach((l: string) => console.log(`  ${l.substring(0, 120)}`));
                        }
                    }
                } catch (e: any) {
                    console.log(`Embed fetch error: ${e.message}`);
                }
            }
        } catch (e: any) {
            console.log(`Error: ${e.message}`);
        }
    }
}

debugGogoDub();
