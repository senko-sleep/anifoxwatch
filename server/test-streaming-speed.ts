import { performance } from 'perf_hooks';

const API_BASE = 'http://localhost:3001';

// Test episodes (common anime - using AniList IDs for Yomi)
const TEST_EPISODES = [
  'anilist-21', // One Piece
  'anilist-20', // Naruto Shippuden
  'anilist-101922', // Demon Slayer
  'anilist-16498' // Attack on Titan
];

async function testStreamingSpeed(episodeId: string): Promise<{ success: boolean; time: number; error?: string }> {
  const start = performance.now();
  try {
    const response = await fetch(`${API_BASE}/api/stream/watch/${encodeURIComponent(episodeId)}?category=sub`);
    const end = performance.now();
    
    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, time: end - start, error: `HTTP ${response.status}: ${errorText}` };
    }
    
    const data = await response.json();
    return { success: true, time: end - start };
  } catch (error: any) {
    const end = performance.now();
    return { success: false, time: end - start, error: error.message };
  }
}

async function runSpeedTests() {
  console.log('🚀 Starting streaming speed tests...\n');
  
  for (const episodeId of TEST_EPISODES) {
    console.log(`Testing: ${episodeId}`);
    const result = await testStreamingSpeed(episodeId);
    
    if (result.success) {
      const status = result.time < 12000 ? '✅' : '❌';
      console.log(`${status} Time: ${result.time.toFixed(0)}ms (${(result.time / 1000).toFixed(2)}s)`);
    } else {
      console.log(`❌ Failed: ${result.error}`);
    }
    console.log('');
  }
  
  console.log('\n📊 Test complete. Target: < 12s (12000ms)');
}

runSpeedTests().catch(console.error);
