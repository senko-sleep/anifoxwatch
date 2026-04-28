import axios from 'axios';
import * as cheerio from 'cheerio';
import { ANIME } from '@consumet/extensions';

async function run() {
  const p = new ANIME.AnimeKai();
  const s = await p.search('One Punch Man');
  const info = await p.fetchAnimeInfo(s.results[0].id);
  const ep = info.episodes![0];
  const servers = await p.fetchEpisodeServers(ep.id);
  const sv = servers[0];
  
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
  
  const iframeHtml = await axios.get(sv.url!, { headers: { 'User-Agent': UA } });
  const $ = cheerio.load(iframeHtml.data as string);
  const megaupUrl = $('iframe').attr('src') || '';
  const mediaUrl = megaupUrl.replace('/e/', '/media/');
  
  const r = await axios.get(mediaUrl, {
    headers: { 'User-Agent': UA, 'Referer': megaupUrl, 'X-Requested-With': 'XMLHttpRequest' }
  });
  
  const enc = r.data?.result as string;
  console.log('encrypted text (first 200):', enc?.substring(0, 200));
  console.log('length:', enc?.length);
  
  // Decode base64url to see raw bytes
  const buf = Buffer.from(enc.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  console.log('decoded bytes (hex, first 64):', buf.subarray(0, 64).toString('hex'));
  console.log('first byte:', buf[0]);
  console.log('total bytes:', buf.length);
  
  // Now decrypt via enc-dec.app with correct UA
  try {
    const dec = await axios.post('https://enc-dec.app/api/dec-mega', { text: enc, agent: UA },
      { headers: { 'Content-Type': 'application/json', 'User-Agent': UA } });
    console.log('\ndecrypt result type:', typeof dec.data?.result);
    console.log('decrypt result (first 200):', JSON.stringify(dec.data?.result).substring(0, 200));
  } catch(e: any) { console.log('decrypt error:', e.response?.status, e.response?.data); }
}
run().catch((e: any) => console.error(e.message));
