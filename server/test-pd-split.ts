import axios from 'axios';
import * as cheerio from 'cheerio';
import { createDecipheriv } from 'crypto';
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
  const pdScript = $2('script:not([src])').map((_, el) => $2(el).html()).get().find(s => s?.includes('__PAGE_DATA'));
  const pageData = pdScript?.match(/__PAGE_DATA="([^"]+)"/)?.[1] || '';
  
  const mediaUrl = megaupUrl.replace('/e/', '/media/');
  const r = await axios.get(mediaUrl, {
    headers: { 'User-Agent': UA, 'Referer': megaupUrl, 'X-Requested-With': 'XMLHttpRequest' }
  });
  const enc = r.data?.result as string;
  const encBuf = Buffer.from(enc.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const pd = Buffer.from(pageData.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  
  console.log('pd bytes:', pd.length, '=', pd.subarray(0,32).toString('hex'), '|', pd.subarray(32).toString('hex'));
  console.log('enc bytes:', encBuf.length);
  
  // pd[0:32] = key, pd[32:44] = nonce
  const key = pd.subarray(0, 32);
  const nonce12 = pd.subarray(32, 44); // 12 bytes for GCM
  const tag = encBuf.subarray(encBuf.length - 16);
  const cipher = encBuf.subarray(0, encBuf.length - 16);
  
  try {
    const d = createDecipheriv('aes-256-gcm', key, nonce12);
    d.setAuthTag(tag);
    const result = Buffer.concat([d.update(cipher), d.final()]).toString('utf-8');
    console.log('✅ key=pd[0:32] nonce=pd[32:44]:', result.substring(0, 200));
    return;
  } catch(e) { console.log('fail key=pd[0:32] nonce=pd[32:44]'); }
  
  // pd[0:32] = key, encBuf[0:12] = nonce (enc has its own nonce prefix)
  try {
    const nonce = encBuf.subarray(0, 12);
    const c = encBuf.subarray(12, encBuf.length - 16);
    const t = encBuf.subarray(encBuf.length - 16);
    const d = createDecipheriv('aes-256-gcm', key, nonce);
    d.setAuthTag(t);
    const result = Buffer.concat([d.update(c), d.final()]).toString('utf-8');
    console.log('✅ key=pd[0:32] nonce=enc[0:12]:', result.substring(0, 200));
    return;
  } catch(e) { console.log('fail key=pd[0:32] nonce=enc[0:12]'); }

  // AES-256-CBC: key=pd[0:32] iv=pd[32:48]
  const iv16 = pd.subarray(32, 48);
  try {
    const d = createDecipheriv('aes-256-cbc', key, iv16);
    d.setAutoPadding(false);
    const result = Buffer.concat([d.update(encBuf), d.final()]).toString('utf-8');
    if (result.includes('sources') || result.startsWith('{')) {
      console.log('✅ AES-CBC key=pd[0:32] iv=pd[32:48]:', result.substring(0, 200));
      return;
    }
    console.log('cbc result start:', result.substring(0,50));
  } catch(e: any) { console.log('fail AES-CBC:', e.message); }
  
  console.log('❌ all splits failed');
}
run().catch((e: any) => console.error(e.message));
