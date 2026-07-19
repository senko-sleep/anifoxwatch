import { performance } from 'perf_hooks';

const API_BASE = 'http://localhost:3001';
const TEST_EPISODES = [
  'anilist-21', // One Piece
  'anilist-20', // Naruto Shippuden
  'anilist-101922', // Demon Slayer
  'anilist-16498', // Attack on Titan
];

async function testAPIResponse(episodeId: string): Promise<{ success: boolean; time: number; error?: string }> {
  const start = performance.now();
  try {
    const response = await fetch(`${API_BASE}/api/stream/watch/${encodeURIComponent(episodeId)}?category=sub`);
    const end = performance.now();
    
    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, time: end - start, error: `HTTP ${response.status}: ${errorText}` };
    }
    
    const data = await response.json();
    if (!data.sources || data.sources.length === 0) {
      return { success: false, time: end - start, error: 'No sources found' };
    }
    
    return { success: true, time: end - start };
  } catch (error: any) {
    const end = performance.now();
    return { success: false, time: end - start, error: error.message };
  }
}

async function runAPITests() {
  console.log('🚀 Starting API response time tests...\n');
  
  for (const episodeId of TEST_EPISODES) {
    console.log(`Testing: ${episodeId}`);
    const result = await testAPIResponse(episodeId);
    
    if (result.success) {
      const status = result.time < 5000 ? '✅' : '⚠️';
      console.log(`${status} Time: ${result.time.toFixed(0)}ms (${(result.time / 1000).toFixed(2)}s)`);
    } else {
      console.log(`❌ Failed: ${result.error}`);
    }
    console.log('');
  }
  
  console.log('📊 API test complete. Target: < 5s (5000ms)');
  console.log('\n📝 For full frontend playback test, open test-frontend-playback.html in your browser');
}

runAPITests().catch(console.error);
