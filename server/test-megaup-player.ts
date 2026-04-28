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
  
  // Fetch the embed page HTML to find scripts
  const embedHtml = await axios.get(megaupUrl, { headers: { 'User-Agent': UA, 'Referer': 'https://anikai.to/' } });
  const $2 = cheerio.load(embedHtml.data as string);
  
  // Find script tags
  const scripts: string[] = [];
  $2('script[src]').each((_, el) => scripts.push($2(el).attr('src') || ''));
  $2('script:not([src])').each((_, el) => {
    const txt = $2(el).html() || '';
    if (txt.length > 50) scripts.push('[INLINE:' + txt.length + '] ' + txt.substring(0, 200));
  });
  
  console.log('embed page scripts:');
  scripts.forEach(s => console.log(' ', s.substring(0, 120)));
  
  // Find the player JS file
  const playerScript = scripts.find(s => s.includes('/assets/') && s.includes('.js'));
  if (playerScript) {
    console.log('\nFetching player script:', playerScript);
    const base = new URL(megaupUrl);
    const scriptUrl = playerScript.startsWith('http') ? playerScript : `${base.origin}${playerScript}`;
    const jsResp = await axios.get(scriptUrl, { headers: { 'User-Agent': UA } });
    const js = jsResp.data as string;
    
    // Search for crypto/decrypt patterns
    const patterns = ['decrypt', 'AES', 'createDecipher', 'CryptoJS', 'atob', 'fromBase64', 'sha256', 'pbkdf2', 'derive'];
    for (const pat of patterns) {
      const idx = js.indexOf(pat);
      if (idx >= 0) {
        console.log(`\nFound "${pat}" at ${idx}:`);
        console.log(js.substring(Math.max(0, idx - 100), idx + 300));
        console.log('---');
      }
    }
  }
}
run().catch((e: any) => console.error(e.message));
