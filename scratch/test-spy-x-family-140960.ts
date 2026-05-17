import { sourceManager } from '../server/src/services/source-manager.js';
async function run() {
  console.log('Testing anilist-140960');
  try {
    const eps = await sourceManager.getEpisodes('anilist-140960');
    console.log('Episodes found:', eps.length);
    if (eps.length > 0) { console.log('First ep:', eps[0]); }
  } catch (e) {
    console.error('Error:', e);
  }
}
run();
