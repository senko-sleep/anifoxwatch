import axios from 'axios';
import { createHash, createDecipheriv } from 'crypto';
import * as cheerio from 'cheerio';
import { ANIME } from '@consumet/extensions';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

async function getEncryptedSample(): Promise<{ enc: string; megaupUrl: string }> {
  const p = new ANIME.AnimeKai();
  const s = await p.search('Bleach');
  const info = await p.fetchAnimeInfo(s.results[0].id);
  const servers = await p.fetchEpisodeServers(info.episodes![1].id);
  const sv = servers[0];
  const iframeHtml = await axios.get(sv.url!, { headers: { 'User-Agent': UA } });
  const $ = cheerio.load(iframeHtml.data as string);
  const megaupUrl = $('iframe').attr('src') || '';
  const r = await axios.get(megaupUrl.replace('/e/', '/media/'), {
    headers: { 'User-Agent': UA, 'Referer': megaupUrl, 'X-Requested-With': 'XMLHttpRequest' }
  });
  return { enc: r.data?.result as string, megaupUrl };
}

async function run() {
  const { enc, megaupUrl } = await getEncryptedSample();
  console.log('megaupUrl:', megaupUrl.substring(0, 60));
  console.log('enc (b64url, len):', enc.length);
  
  const raw = Buffer.from(enc.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  console.log('raw bytes:', raw.length);
  console.log('raw[0]:', raw[0], 'raw[1-12]hex:', raw.subarray(1,13).toString('hex'));
  
  // Get the enc-kai token for the UA — maybe this is the key
  const kaiToken = (await axios.get(`https://enc-dec.app/api/enc-kai?text=${encodeURIComponent(UA)}`)).data?.result as string;
  console.log('enc-kai token (b64url):', kaiToken?.substring(0, 60));
  
  // The enc-kai token decoded might be the AES key
  const keyBuf = Buffer.from(kaiToken.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  console.log('key bytes:', keyBuf.length, 'hex:', keyBuf.toString('hex').substring(0, 64));
  
  // Try: key = first 32 bytes of decoded enc-kai token
  // Layout: [1 byte prefix][12 nonce][ciphertext][16 tag] (like AllAnime)
  const key32 = keyBuf.subarray(0, 32);
  const key16 = keyBuf.subarray(0, 16);
  
  for (const [label, key] of [['key32', key32], ['key16', key16]] as [string, Buffer][]) {
    for (const offset of [0, 1]) {
      try {
        const nonce = raw.subarray(offset, offset + 12);
        const cipher = raw.subarray(offset + 12, raw.length - 16);
        const tag = raw.subarray(raw.length - 16);
        const d = createDecipheriv('aes-256-gcm', key.length === 16 ? Buffer.concat([key, key]) : key, nonce);
        d.setAuthTag(tag);
        const result = Buffer.concat([d.update(cipher), d.final()]).toString('utf-8');
        if (result.includes('sources')) {
          console.log(`✅ label=${label} offset=${offset}:`, result.substring(0, 100));
          return;
        }
      } catch {}
    }
  }
  
  // Also try: MD5(UA), SHA1(UA) as key
  for (const algo of ['md5', 'sha1', 'sha256', 'sha512']) {
    const k = createHash(algo).update(UA).digest();
    const key = algo === 'sha512' ? k.subarray(0, 32) : k.subarray(0, Math.min(k.length, 32));
    for (const offset of [0, 1]) {
      try {
        const padKey = key.length < 32 ? Buffer.concat([key, Buffer.alloc(32 - key.length)]) : key;
        const nonce = raw.subarray(offset, offset + 12);
        const cipher = raw.subarray(offset + 12, raw.length - 16);
        const tag = raw.subarray(raw.length - 16);
        const d = createDecipheriv('aes-256-gcm', padKey, nonce);
        d.setAuthTag(tag);
        const result = Buffer.concat([d.update(cipher), d.final()]).toString('utf-8');
        if (result.includes('sources')) {
          console.log(`✅ algo=${algo} offset=${offset}:`, result.substring(0, 100));
          return;
        }
      } catch {}
    }
  }
  console.log('❌ No match');
}
run().catch((e: any) => console.error(e.message));
