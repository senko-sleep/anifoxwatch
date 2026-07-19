import { SourceManager } from './src/services/source-manager.js';

(async () => {
  const sm = new SourceManager();
  
  const source = sm.getStreamingSource('anilist-207141');
  console.log('Primary source for anilist-207141:', source?.name || 'null');
  
  const sources = sm.getAvailableSources();
  console.log('Available sources:', sources.map(s => s.name));
  
  const result = await sm.getStreamingLinks('anilist-207141', undefined, 'sub', {
    episodeNum: 1,
    anilistId: 207141,
    timeout: 30000,
  });
  
  console.log('Stream result source:', result.source);
  console.log('Stream result servers:', result.sources?.map(s => s.server));
  console.log('Stream result URLs:', result.sources?.map(s => s.url?.slice(0, 100)));
})();
