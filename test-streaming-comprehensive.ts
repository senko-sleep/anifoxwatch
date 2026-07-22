/**
 * Comprehensive Streaming Test Suite
 * Tests both frontend and backend for anime and hentai streaming
 * Run with: npx tsx test-streaming-comprehensive.ts
 */

const API_BASE = 'http://localhost:8081';
const BACKEND_API = 'http://localhost:3001';

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  data?: any;
}

const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<any>): Promise<TestResult> {
  const start = Date.now();
  try {
    const data = await fn();
    const duration = Date.now() - start;
    results.push({ name, passed: true, duration, data });
    console.log(`✅ ${name} (${duration}ms)`);
    return { name, passed: true, duration, data };
  } catch (error) {
    const duration = Date.now() - start;
    const errorMsg = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, duration, error: errorMsg });
    console.log(`❌ ${name} (${duration}ms) - ${errorMsg}`);
    return { name, passed: false, duration, error: errorMsg };
  }
}

async function fetchJson(url: string, timeout = 10000): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  const response = await fetch(url, { signal: controller.signal });
  clearTimeout(timeoutId);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

// ============ BACKEND TESTS ============

async function testBackendHealth() {
  return test('Backend Health Check', async () => {
    const data = await fetchJson(`${BACKEND_API}/health`);
    if (!data.status) throw new Error('No status in response');
    return data;
  });
}

async function testBackendAnime() {
  return test('Backend: Get Anime (anilist-207141)', async () => {
    const data = await fetchJson(`${BACKEND_API}/api/anime?id=anilist-207141`);
    if (!data.id) throw new Error('No anime ID in response');
    if (!data.title) throw new Error('No title in response');
    return data;
  });
}

async function testBackendEpisodes() {
  return test('Backend: Get Episodes (anilist-207141)', async () => {
    const data = await fetchJson(`${BACKEND_API}/api/anime/episodes?id=anilist-207141`);
    if (!data.episodes || !Array.isArray(data.episodes)) throw new Error('No episodes array');
    if (data.episodes.length === 0) throw new Error('No episodes found');
    return data;
  });
}

async function testBackendResolve() {
  return test('Backend: Resolve AniList ID', async () => {
    const data = await fetchJson(`${BACKEND_API}/api/anime/resolve?id=anilist-207141`);
    if (!data.streamingId) throw new Error('No streamingId in response');
    return data;
  });
}

async function testBackendServers() {
  return test('Backend: Get Episode Servers', async () => {
    const data = await fetchJson(`${BACKEND_API}/api/stream/servers/aniwaves-82684?ep=2`);
    if (!data.servers || !Array.isArray(data.servers)) throw new Error('No servers array');
    if (data.servers.length === 0) throw new Error('No servers found');
    return data;
  });
}

async function testBackendStream() {
  return test('Backend: Get Stream (aniwaves-82684 ep 2)', async () => {
    const data = await fetchJson(`${BACKEND_API}/api/stream/watch/aniwaves-82684?ep=2`);
    if (!data.sources || !Array.isArray(data.sources)) throw new Error('No sources array');
    if (data.sources.length === 0) throw new Error('No sources found');
    return data;
  });
}

async function testBackendProxy() {
  return test('Backend: Proxy Manifest', async () => {
    const response = await fetch(`${BACKEND_API}/api/stream/proxy?url=https%3A%2F%2Fru-cdn2.echovideo.to%2Fcdn%2F092e3d2d14736a0ad5386790eba243b9d1f2d7eceda67031954e7c6a3196db9eea666a76f85bf3f7889b4a25a1fd4162d586fb8d%3Ft.m3u8&referer=https%3A%2F%2Fplay.echovideo.ru`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    if (!text.includes('#EXTM3U')) throw new Error('Not a valid m3u8 manifest');
    return { status: response.status, length: text.length, hasExtM3U: true };
  });
}

// ============ FRONTEND PROXY TESTS ============

async function testFrontendHealth() {
  return test('Frontend Proxy Health', async () => {
    const data = await fetchJson(`${API_BASE}/health`);
    return data;
  });
}

async function testFrontendAnime() {
  return test('Frontend: Get Anime (anilist-207141)', async () => {
    const data = await fetchJson(`${API_BASE}/api/anime?id=anilist-207141`);
    if (!data.id) throw new Error('No anime ID in response');
    return data;
  });
}

async function testFrontendEpisodes() {
  return test('Frontend: Get Episodes (anilist-207141)', async () => {
    const data = await fetchJson(`${API_BASE}/api/anime/episodes?id=anilist-207141`);
    if (!data.episodes || !Array.isArray(data.episodes)) throw new Error('No episodes array');
    return data;
  });
}

async function testFrontendStream() {
  return test('Frontend: Get Stream (aniwaves-82684 ep 2)', async () => {
    const data = await fetchJson(`${API_BASE}/api/stream/watch/aniwaves-82684?ep=2`);
    if (!data.sources || !Array.isArray(data.sources)) throw new Error('No sources array');
    if (data.sources.length === 0) throw new Error('No sources found');
    // Check if URL is relative (for Vite proxy)
    const firstSource = data.sources[0];
    if (!firstSource.url) throw new Error('No URL in source');
    return data;
  });
}

async function testFrontendProxy() {
  return test('Frontend: Proxy Manifest', async () => {
    const response = await fetch(`${API_BASE}/api/stream/proxy?url=https%3A%2F%2Fru-cdn2.echovideo.to%2Fcdn%2F092e3d2d14736a0ad5386790eba243b9d1f2d7eceda67031954e7c6a3196db9eea666a76f85bf3f7889b4a25a1fd4162d586fb8d%3Ft.m3u8&referer=https%3A%2F%2Fplay.echovideo.ru`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    if (!text.includes('#EXTM3U')) throw new Error('Not a valid m3u8 manifest');
    return { status: response.status, length: text.length, hasExtM3U: true };
  });
}

async function testFrontendProxyConfig() {
  return test('Frontend: Proxy Config Diagnostics', async () => {
    const data = await fetchJson(`${API_BASE}/api/stream/diag/proxy-config`);
    if (!data.proxyBase) throw new Error('No proxyBase in response');
    return data;
  });
}

// ============ HENTAI TESTS ============

async function testHentaiSearch() {
  return test('Hentai: Search', async () => {
    const data = await fetchJson(`${API_BASE}/api/anime/search?q=test&page=1&mode=adult`);
    if (!data.results) throw new Error('No results in response');
    return data;
  });
}

async function testHentaiTrending() {
  return test('Hentai: Trending', async () => {
    const data = await fetchJson(`${API_BASE}/api/anime/trending?page=1&mode=adult`);
    if (!data.results || !Array.isArray(data.results)) throw new Error('No results array');
    return data;
  });
}

// ============ RUN ALL TESTS ============

async function runAllTests() {
  console.log('\n🧪 Starting Comprehensive Streaming Tests\n');
  console.log('='.repeat(60));
  
  console.log('\n📡 BACKEND TESTS (localhost:3001)');
  console.log('-'.repeat(60));
  await testBackendHealth();
  await testBackendAnime();
  await testBackendEpisodes();
  await testBackendResolve();
  await testBackendServers();
  await testBackendStream();
  await testBackendProxy();
  
  console.log('\n🌐 FRONTEND PROXY TESTS (localhost:8081)');
  console.log('-'.repeat(60));
  await testFrontendHealth();
  await testFrontendAnime();
  await testFrontendEpisodes();
  await testFrontendStream();
  await testFrontendProxy();
  await testFrontendProxyConfig();
  
  console.log('\n🔞 HENTAI TESTS');
  console.log('-'.repeat(60));
  await testHentaiSearch();
  await testHentaiTrending();
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;
  const passRate = ((passed / total) * 100).toFixed(1);
  
  console.log(`Total: ${total} | Passed: ${passed} | Failed: ${failed} | Pass Rate: ${passRate}%`);
  
  if (failed > 0) {
    console.log('\n❌ FAILED TESTS:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.name}: ${r.error}`);
    });
  }
  
  console.log('\n⏱️  TIMING:');
  results.forEach(r => {
    const icon = r.passed ? '✅' : '❌';
    console.log(`  ${icon} ${r.name}: ${r.duration}ms`);
  });
  
  console.log('\n');
}

runAllTests().catch(console.error);
