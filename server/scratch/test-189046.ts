import { SourceManager } from '../src/services/source-manager.js';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
  const sm = new SourceManager();
  console.log('Testing anilist-189046...');
  const totalStart = Date.now();
  
  try {
    const resolveStart = Date.now();
    const streamingId = await sm.resolveAniListToStreamingId(189046);
    console.log(`✅ Resolved in ${Date.now() - resolveStart}ms: ${streamingId}`);
    
    if (streamingId) {
      const epStart = Date.now();
      const episodes = await sm.getEpisodes(streamingId);
      console.log(`✅ Episodes in ${Date.now() - epStart}ms: ${episodes.length} eps`);
      
      if (episodes.length > 0) {
        const streamStart = Date.now();
        const streams = await sm.getStreamingLinks(episodes[0].id, undefined, 'sub', episodes[0].number, 189046);
        console.log(`✅ Stream in ${Date.now() - streamStart}ms: ${streams.sources?.length || 0} sources`);
        console.log(`🎬 Primary URL: ${streams.sources?.[0]?.url?.substring(0, 80)}...`);
      }
    }
  } catch (e) {
    console.error('❌ Error:', e);
  }
  
  console.log(`⏱️ Total: ${Date.now() - totalStart}ms`);
}

test().catch(console.error);
