import axios from 'axios';
import * as cheerio from 'cheerio';

async function scrapeServersFromWebsite(
    episodeId: string,
    category: 'sub' | 'dub'
): Promise<Array<{ name: string; url: string; type?: string }>> {
    const servers: Array<{ name: string; url: string; type?: string }> = [];
    const watchUrl = `https://animekai.to/watch/${episodeId}`;
    
    console.log(`Scraping ${watchUrl}...`);
    try {
        const resp = await axios.get(watchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            },
        });
        
        const $ = cheerio.load(resp.data);
        
        $('[data-server], .server-item, .server, .item-server').each((i, el) => {
            const serverUrl = $(el).attr('data-server') || $(el).attr('data-link') || $(el).attr('data-id') || '';
            const serverName = $(el).text().trim() || $(el).attr('title') || `Server ${i + 1}`;
            
            const isDubServer = $(el).attr('data-type') === 'dub' || $(el).attr('data-dub') === 'true' || 
                               $(el).hasClass('dub') || 
                               $(el).closest('[class*="dub"]').length > 0;
            const isSubServer = $(el).attr('data-type') === 'sub' || $(el).attr('data-sub') === 'true' || 
                               $(el).hasClass('sub') || 
                               $(el).closest('[class*="sub"]').length > 0;
            
            console.log(`Found server element: name="${serverName}", url="${serverUrl}", isDub=${isDubServer}, isSub=${isSubServer}, html="${$(el).parent().html()?.substring(0, 50)}"`);
            
            if (category === 'dub' && !isDubServer) return;
            if (category === 'sub' && isDubServer) return;
            
            if (serverUrl) {
                servers.push({ name: serverName + (isDubServer ? ' (Dub)' : ''), url: serverUrl.startsWith('http') ? serverUrl : `https://animekai.to/ajax/episode/sources?id=${serverUrl}`, type: isDubServer ? 'dub' : 'sub' });
            }
        });
        
    } catch (err: any) {
        console.error(err.message);
    }
    return servers;
}

async function run() {
    const epId = 'rezero-kara-hajimeru-isekai-seikatsu-4th-season-8lj0$ep=1$token=Ltfh8KXzuwau03VfhY-G';
    // wait, we need to extract the rawEpisodeId
    let rawEpisodeId = epId.replace(/^animekai-/i, '');
    const isWatchEpisodeId = /\?ep=/i.test(rawEpisodeId);
    const isConsumetEpisodeId = /\$ep=\d+/i.test(rawEpisodeId);
    if (isWatchEpisodeId && !isConsumetEpisodeId) {
        rawEpisodeId = rawEpisodeId.split('?ep=')[0];
    }
    
    console.log(`Raw ID: ${rawEpisodeId}`);
    
    const subServers = await scrapeServersFromWebsite(rawEpisodeId, 'sub');
    console.log('\nSub servers:');
    console.log(subServers);
    
    const dubServers = await scrapeServersFromWebsite(rawEpisodeId, 'dub');
    console.log('\nDub servers:');
    console.log(dubServers);
}

run();
