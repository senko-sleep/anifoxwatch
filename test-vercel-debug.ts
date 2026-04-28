import { AnimeKaiSource } from './src/sources/animekai-source.js';

async function run() {
  const kai = new AnimeKaiSource();
  const epId = 'one-punch-man-wq18$ep=1$token=Jcu49qfjtwjmkWhex5uB';
  
  console.log('Testing:', epId);
  console.log('isAnimeKai pattern:', /\$ep=\d+/.test(epId) && !epId.includes('?ep='));
  
  const data = await kai.getStreamingLinks(epId, undefined, 'sub');
  console.log('Sources:', data.sources.length);
  if (data.sources.length > 0) {
    console.log('URL:', data.sources[0].url.substring(0, 80));
    console.log('WORKS!');
  } else {
    console.log('FAILED - no sources');
  }
}
run().catch(e => console.error('FATAL:', e.message));
