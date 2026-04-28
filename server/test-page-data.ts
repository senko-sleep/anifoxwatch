import axios from 'axios';
import * as cheerio from 'cheerio';
import { ANIME } from '@consumet/extensions';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

async function run() {
  const p = new ANIME.AnimeKai();
  const s = await p.search('Death Note');
  const info = await p.fetchAnimeInfo(s.results[0].id);
  const servers = await p.fetchEpisodeServers(info.episodes![0].id);
  const iframeHtml = await axios.get(servers[0].url!, { headers: { 'User-Agent': UA } });
  const $ = cheerio.load(iframeHtml.data as string);
  const megaupUrl = $('iframe').attr('src') || '';
  
  const embedHtml = await axios.get(megaupUrl, { headers: { 'User-Agent': UA, 'Referer': 'https://anikai.to/' } });
  const $2 = cheerio.load(embedHtml.data as string);
  const pageDataScript = $2('script:not([src])').map((_, el) => $2(el).html()).get()
    .find(s => s?.includes('__PAGE_DATA'));
  
  const pageDataMatch = pageDataScript?.match(/__PAGE_DATA="([^"]+)"/);
  const pageData = pageDataMatch?.[1];
  console.log('__PAGE_DATA:', pageData?.substring(0, 80));
  console.log('PAGE_DATA length:', pageData?.length);
  
  // Now get the /media/ result
  const mediaUrl = megaupUrl.replace('/e/', '/media/');
  const r = await axios.get(mediaUrl, {
    headers: { 'User-Agent': UA, 'Referer': megaupUrl, 'X-Requested-With': 'XMLHttpRequest' }
  });
  const mediaResult = r.data?.result as string;
  console.log('\n/media/ result:', mediaResult?.substring(0, 80));
  console.log('/media/ result length:', mediaResult?.length);
  
  console.log('\nSame?', pageData === mediaResult);
  
  // Also check if __PAGE_DATA can be decoded by enc-dec.app with enc-kai endpoint
  if (pageData) {
    const enc = await axios.get(`https://enc-dec.app/api/enc-kai?text=${encodeURIComponent(megaupUrl)}`);
    console.log('\nenc-kai of megaupUrl:', enc.data?.result?.substring(0, 60));
    
    // Try dec-kai on __PAGE_DATA
    try {
      const dec = await axios.post('https://enc-dec.app/api/dec-kai', { text: pageData },
        { headers: { 'Content-Type': 'application/json' } });
      console.log('dec-kai of PAGE_DATA:', JSON.stringify(dec.data).substring(0, 100));
    } catch(e: any) { console.log('dec-kai error:', e.response?.status, e.response?.data); }
  }
}
run().catch((e: any) => console.error(e.message));
