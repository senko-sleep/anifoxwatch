
import { SourceManager } from '../src/services/source-manager.js';

async function testStreaming() {
  const sm = new SourceManager();
  const episodeId = 'classroom-of-the-elite-2nd-season-18076?ep=92595';
  
  console.log(`Testing streaming links for: ${episodeId}`);
  
  try {
    const start = Date.now();
    const data = await sm.getStreamingLinks(episodeId);
    const duration = Date.now() - start;
    
    if (data && data.sources && data.sources.length > 0) {
      console.log(`SUCCESS in ${duration}ms`);
      console.log(`Source used: ${data.source}`);
      console.log(`Primary URL: ${data.sources[0].url.substring(0, 100)}...`);
    } else {
      console.log(`FAILED: No sources found in ${duration}ms`);
    }
  } catch (err: any) {
    console.error(`ERROR: ${err.message}`);
    if (err.stack) console.error(err.stack);
  }
}

testStreaming();
