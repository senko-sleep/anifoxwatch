import axios from 'axios';
import * as cheerio from 'cheerio';
import { ANIME } from '@consumet/extensions';

async function run() {
  const p = new ANIME.AnimeKai();
  const s = await p.search('Death Note');
  const info = await p.fetchAnimeInfo(s.results[0].id);
  const ep = info.episodes![0];
  console.log('ep:', ep.id);
  
  const servers = await p.fetchEpisodeServers(ep.id);
  console.log('servers:', servers.length);
  
  for (const sv of servers.slice(0, 2)) {
    console.log('\nServer:', sv.name, sv.url?.substring(0, 60));
    
    // Step 1: fetch iframe wrapper
    const iframeHtml = await axios.get(sv.url!, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    const $ = cheerio.load(iframeHtml.data);
    const megaupUrl = $('iframe').attr('src') || '';
    console.log('megaup URL:', megaupUrl.substring(0, 80));
    
    if (!megaupUrl) continue;
    
    // Step 2: fetch megaup media endpoint with XHR header
    const mediaUrl = megaupUrl.replace('/e/', '/media/');
    const mediaResp = await axios.get(mediaUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': megaupUrl,
        'X-Requested-With': 'XMLHttpRequest',
      }
    }).catch((e: any) => ({ data: { error: e.message, status: e.response?.status } }));
    
    const mediaData = mediaResp.data;
    console.log('media response keys:', Object.keys(mediaData));
    console.log('result (first 100):', String(mediaData?.result || '').substring(0, 100));
    
    if (mediaData?.result) {
      // Step 3: decrypt via enc-dec.app
      const decResp = await axios.post('https://enc-dec.app/api/dec-mega', {
        text: mediaData.result,
        agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
      }, {
        headers: { 'Content-Type': 'application/json' }
      }).catch((e: any) => ({ data: { error: e.message, status: e.response?.status, raw: e.response?.data } }));
      
      console.log('decrypt status:', (decResp.data as any)?.status);
      console.log('decrypt result (first 200):', JSON.stringify((decResp.data as any)?.result || (decResp.data as any)?.error).substring(0, 200));
      
      if ((decResp.data as any)?.result) {
        const sources = (decResp.data as any).result?.sources;
        console.log('STREAM SOURCES:', sources?.length, sources?.[0]?.file?.substring(0, 80));
      }
    }
  }
}
run().catch((e: any) => console.error('FATAL:', e.message));
