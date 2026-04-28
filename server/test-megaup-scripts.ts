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
  const base = new URL(megaupUrl);
  
  // The inline __PAGE_DATA is the encrypted result pre-loaded into the page
  const embedHtml = await axios.get(megaupUrl, { headers: { 'User-Agent': UA, 'Referer': 'https://anikai.to/' } });
  const $2 = cheerio.load(embedHtml.data as string);
  
  // Get __PAGE_DATA
  const pageData = $2('script:not([src])').map((_, el) => $2(el).html()).get()
    .find(s => s?.includes('__PAGE_DATA'));
  console.log('PAGE_DATA script:', pageData?.substring(0, 200));
  
  // Now fetch the main scripts-*.js file which likely contains the decrypt logic
  const mainScript = $2('script[src]').map((_, el) => $2(el).attr('src')).get()
    .find((s: string) => s?.includes('scripts-') || s?.includes('embed'));
  console.log('\nmain script:', mainScript);
  
  if (mainScript) {
    const scriptUrl = mainScript.startsWith('http') ? mainScript : `${base.origin}${mainScript.split('?')[0]}`;
    console.log('fetching:', scriptUrl);
    const jsResp = await axios.get(scriptUrl, { headers: { 'User-Agent': UA, 'Referer': megaupUrl } });
    const js = jsResp.data as string;
    console.log('script length:', js.length);
    
    // Search for decrypt / media / result handling
    const searches = ['/media/', 'result', 'decrypt', 'crypto', 'subtle', 'importKey', 'getKey', 'iv', 'gcm', 'cbc'];
    for (const p of searches) {
      let idx = -1;
      let count = 0;
      while ((idx = js.indexOf(p, idx + 1)) >= 0 && count < 2) {
        count++;
        const snippet = js.substring(Math.max(0, idx - 60), idx + 200);
        if (snippet.includes('encrypt') || snippet.includes('decrypt') || snippet.includes('key') || snippet.includes('cipher')) {
          console.log(`\n[${p}] @${idx}: ...${snippet}...`);
        }
      }
    }
  }
}
run().catch((e: any) => console.error(e.message));
