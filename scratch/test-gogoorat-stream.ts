import { sourceManager } from '../server/src/services/source-manager.js';
async function run() {
  console.log('Fetching stream for gogoorat-spy-x-family-dub-episode-1');
  try {
    const source = sourceManager.sources.get('GogoOrAt');
    if (!source) throw new Error('Source not found');
    const data = await source.getStreamingLinks('gogoorat-spy-x-family-dub-episode-1', undefined, 'dub');
    console.log('Stream data:', JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Error:', e);
  }
}
run();
