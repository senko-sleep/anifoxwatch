import axios from 'axios';
import * as cheerio from 'cheerio';
import { ANIME } from '@consumet/extensions';

// Must be IDENTICAL between /media/ fetch and dec-mega call
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

async function run() {
  const p = new ANIME.AnimeKai();
  const s = await p.search('Death Note');
  const info = await p.fetchAnimeInfo(s.results[0].id);
  const ep = info.episodes![0];
  const servers = await p.fetchEpisodeServers(ep.id);
  const sv = servers[0];
  console.log('Server URL:', sv.url?.substring(0, 70));
  
  // iframe → megaup embed URL
  const iframeHtml = await axios.get(sv.url!, { headers: { 'User-Agent': UA } });
  const $ = cheerio.load(iframeHtml.data);
  const megaupUrl = $('iframe').attr('src') || '';
  console.log('MegaUp URL:', megaupUrl.substring(0, 80));
  
  const mediaUrl = megaupUrl.replace('/e/', '/media/');
  const mediaResp = await axios.get(mediaUrl, {
    headers: { 'User-Agent': UA, 'Referer': megaupUrl, 'X-Requested-With': 'XMLHttpRequest' }
  });
  
  const encText = mediaResp.data?.result;
  console.log('encrypted text length:', encText?.length, 'first 60:', encText?.substring(0, 60));
  
  if (!encText) { console.log('No encrypted result!'); return; }
  
  // Decrypt - same UA
  const decResp = await axios.post('https://enc-dec.app/api/dec-mega',
    { text: encText, agent: UA },
    { headers: { 'Content-Type': 'application/json', 'User-Agent': UA } }
  ).catch((e: any) => ({ data: { status: e.response?.status, error: e.response?.data?.error, hint: e.response?.data?.hint } }));
  
  const d = decResp.data as any;
  console.log('decrypt status:', d.status, d.error || '');
  
  if (d.result) {
    const src = d.result?.sources?.[0];
    console.log('✅ STREAM URL:', src?.file?.substring(0, 100));
    console.log('total sources:', d.result?.sources?.length);
  }
}
run().catch((e: any) => console.error('FATAL:', e.message));
