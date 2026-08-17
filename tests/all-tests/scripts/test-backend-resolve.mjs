import { sourceManager } from '../../server/dist/services/source-manager.js';

async function testBackend() {
  console.log('Testing anilist-1639...');
  try {
    const t0 = Date.now();
    const result1639 = await sourceManager.getAnime('anilist-1639');
    console.log(`[1639 Anime] (${Date.now() - t0}ms):`, result1639?.title);
  } catch (e) {
    console.error('[1639 Anime Error]:', e.message);
  }

  try {
    const t0 = Date.now();
    const episodes1639 = await sourceManager.getEpisodes('anilist-1639');
    console.log(`[1639 Episodes] (${Date.now() - t0}ms): count =`, episodes1639?.length);
  } catch (e) {
    console.error('[1639 Episodes Error]:', e.message);
  }

  try {
    const t0 = Date.now();
    const stream1639 = await sourceManager.getStreamingLinks('anilist-1639?ep=2');
    console.log(`[1639 Stream] (${Date.now() - t0}ms):`, stream1639);
  } catch (e) {
    console.error('[1639 Stream Error]:', e.message);
  }

  console.log('\nTesting anilist-207141...');
  try {
    const t0 = Date.now();
    const result207141 = await sourceManager.getAnime('anilist-207141');
    console.log(`[207141 Anime] (${Date.now() - t0}ms):`, result207141?.title);
  } catch (e) {
    console.error('[207141 Anime Error]:', e.message);
  }

  try {
    const t0 = Date.now();
    const episodes207141 = await sourceManager.getEpisodes('anilist-207141');
    console.log(`[207141 Episodes] (${Date.now() - t0}ms): count =`, episodes207141?.length);
  } catch (e) {
    console.error('[207141 Episodes Error]:', e.message);
  }

  try {
    const t0 = Date.now();
    const stream207141 = await sourceManager.getStreamingLinks('anilist-207141?ep=2');
    console.log(`[207141 Stream] (${Date.now() - t0}ms):`, stream207141);
  } catch (e) {
    console.error('[207141 Stream Error]:', e.message);
  }

  process.exit(0);
}

testBackend();
