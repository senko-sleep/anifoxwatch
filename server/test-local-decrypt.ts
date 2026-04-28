import { createHash, createDecipheriv } from 'crypto';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { ANIME } from '@consumet/extensions';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

async function getEncryptedSample() {
  const p = new ANIME.AnimeKai();
  const s = await p.search('Death Note');
  const info = await p.fetchAnimeInfo(s.results[0].id);
  const servers = await p.fetchEpisodeServers(info.episodes![0].id);
  const sv = servers[0];
  const iframeHtml = await axios.get(sv.url!, { headers: { 'User-Agent': UA } });
  const $ = cheerio.load(iframeHtml.data as string);
  const megaupUrl = $('iframe').attr('src') || '';
  const r = await axios.get(megaupUrl.replace('/e/', '/media/'), {
    headers: { 'User-Agent': UA, 'Referer': megaupUrl, 'X-Requested-With': 'XMLHttpRequest' }
  });
  return r.data?.result as string;
}

function tryDecrypt(enc: string, keyMaterial: string, layout: string): string | null {
  try {
    const raw = Buffer.from(enc.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    const key = createHash('sha256').update(keyMaterial).digest();
    
    let nonce: Buffer, cipher: Buffer, tag: Buffer;
    if (layout === 'standard') { // [12 nonce][cipher][16 tag]
      nonce = raw.subarray(0, 12);
      cipher = raw.subarray(12, raw.length - 16);
      tag = raw.subarray(raw.length - 16);
    } else if (layout === 'offset1') { // [1][12 nonce][cipher][16 tag] like AllAnime
      nonce = raw.subarray(1, 13);
      cipher = raw.subarray(13, raw.length - 16);
      tag = raw.subarray(raw.length - 16);
    } else { // [16 iv][cipher]
      nonce = raw.subarray(0, 16);
      cipher = raw.subarray(16);
      tag = Buffer.alloc(0);
    }
    
    const dec = createDecipheriv('aes-256-gcm', key, nonce);
    dec.setAuthTag(tag);
    const result = Buffer.concat([dec.update(cipher), dec.final()]).toString('utf-8');
    return result;
  } catch { return null; }
}

async function run() {
  const enc = await getEncryptedSample();
  console.log('enc length:', enc.length, 'decoded bytes:', Buffer.from(enc.replace(/-/g, '+').replace(/_/g, '/'), 'base64').length);
  
  const candidates = [
    UA,
    'animekai',
    'megaup',
    'enc-dec.app',
    '1234567890abcdef',
  ];
  
  for (const key of candidates) {
    for (const layout of ['standard', 'offset1']) {
      const result = tryDecrypt(enc, key, layout);
      if (result && result.startsWith('{') && result.includes('sources')) {
        console.log(`✅ DECRYPTED with key="${key.substring(0, 30)}", layout=${layout}`);
        console.log(result.substring(0, 200));
        return;
      }
    }
  }
  console.log('❌ None of the simple keys worked');
  
  // Try the enc-kai endpoint to understand the key encoding
  const enc2 = await axios.get(`https://enc-dec.app/api/enc-kai?text=${encodeURIComponent(UA)}`);
  console.log('enc-kai of UA:', enc2.data?.result?.substring(0, 60));
}
run().catch((e: any) => console.error(e.message));
