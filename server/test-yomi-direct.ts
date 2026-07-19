import { YomiSource } from './src/sources/yomi-source.js';

(async () => {
  const yomi = new YomiSource();
  yomi.isAvailable = true;
  
  console.log('Testing YomiSource.getStreamingLinks...');
  const start = Date.now();
  const result = await yomi.getStreamingLinks('anilist-207141', undefined, 'sub', {
    episodeNum: 1,
    anilistId: 207141,
    timeout: 30000,
  });
  console.log('Time:', Date.now() - start, 'ms');
  console.log('Result:', JSON.stringify(result, null, 2));
})();
