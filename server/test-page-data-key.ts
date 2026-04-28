import axios from 'axios';
import * as cheerio from 'cheerio';
import { createDecipheriv, createHash, pbkdf2Sync } from 'crypto';
import { ANIME } from '@consumet/extensions';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

async function run() {
  const p = new ANIME.AnimeKai();
  const s = await p.search('Bleach');
  const info = await p.fetchAnimeInfo(s.results[0].id);
  const servers = await p.fetchEpisodeServers(info.episodes![2].id);
  const iframeHtml = await axios.get(servers[0].url!, { headers: { 'User-Agent': UA } });
  const $ = cheerio.load(iframeHtml.data as string);
  const megaupUrl = $('iframe').attr('src') || '';
  console.log('megaup url:', megaupUrl.substring(0, 70));
  
  // Get __PAGE_DATA
  const embedHtml = await axios.get(megaupUrl, { headers: { 'User-Agent': UA, 'Referer': 'https://anikai.to/' } });
  const $2 = cheerio.load(embedHtml.data as string);
  const pdScript = $2('script:not([src])').map((_, el) => $2(el).html()).get().find(s => s?.includes('__PAGE_DATA'));
  const pageData = pdScript?.match(/__PAGE_DATA="([^"]+)"/)?.[1] || '';
  console.log('__PAGE_DATA:', pageData);
  
  // Get /media/ result
  const mediaUrl = megaupUrl.replace('/e/', '/media/');
  const r = await axios.get(mediaUrl, {
    headers: { 'User-Agent': UA, 'Referer': megaupUrl, 'X-Requested-With': 'XMLHttpRequest' }
  });
  const enc = r.data?.result as string;
  console.log('enc length:', enc?.length);
  
  const encBuf = Buffer.from(enc.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  
  // Try __PAGE_DATA decoded as key material
  const pdBuf = Buffer.from(pageData.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  console.log('pd decoded bytes:', pdBuf.length, 'hex:', pdBuf.toString('hex'));
  
  const combinations = [
    // [key_source, layout, description]
    [pageData, 'raw_str', 'PAGE_DATA as string key'],
    [pdBuf.toString('hex'), 'hex_str', 'PAGE_DATA hex as string'],
  ];
  
  // Try key = SHA256(pageData)
  const key1 = createHash('sha256').update(pageData).digest();
  // Try key = SHA256(UA + pageData)
  const key2 = createHash('sha256').update(UA + pageData).digest();
  // Try key = SHA256(pageData + UA)
  const key3 = createHash('sha256').update(pageData + UA).digest();
  // Try key = SHA256(pdBuf)
  const key4 = createHash('sha256').update(pdBuf).digest();
  // Try first 32 bytes of pdBuf directly
  const key5 = pdBuf.subarray(0, 32);
  
  for (const [label, key] of [['sha256(pd)', key1], ['sha256(ua+pd)', key2], ['sha256(pd+ua)', key3], ['sha256(pdbuf)', key4], ['pdbuf32', key5]] as [string, Buffer][]) {
    for (const offset of [0, 1]) {
      try {
        const nonce = encBuf.subarray(offset, offset + 12);
        const ciphertext = encBuf.subarray(offset + 12, encBuf.length - 16);
        const tag = encBuf.subarray(encBuf.length - 16);
        const d = createDecipheriv('aes-256-gcm', key.length < 32 ? Buffer.concat([key, Buffer.alloc(32 - key.length)]) : key.subarray(0, 32), nonce);
        d.setAuthTag(tag);
        const result = Buffer.concat([d.update(ciphertext), d.final()]).toString('utf-8');
        if (result.includes('sources') || result.startsWith('{')) {
          console.log(`✅ ${label} offset=${offset}: ${result.substring(0, 150)}`);
          return;
        }
      } catch {}
    }
  }
  console.log('❌ No match with __PAGE_DATA combinations');
}
run().catch((e: any) => console.error(e.message));
