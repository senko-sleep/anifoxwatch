/**
 * API Speed Test Suite
 * Tests various API endpoints and measures response times
 * Compares CF Worker vs Render backend performance
 */

interface TestResult {
  endpoint: string;
  url: string;
  status: number;
  time: number;
  size: number;
  success: boolean;
  error?: string;
  details?: {
    resultCount?: number;
    servers?: string[];
    sources?: string[];
    hasData?: boolean;
    duration?: string;
    quality?: string[];
  };
}

interface TestSuite {
  name: string;
  results: TestResult[];
  totalTime: number;
  avgTime: number;
  successRate: number;
}

const CF_WORKER_URL = 'https://anifoxwatch-api.anya-bot.workers.dev';
const RENDER_BACKEND_URL = 'https://anifoxwatch-ci33.onrender.com';

// Resolved at runtime from a real episode list
let resolvedEpisodeId = 'one-piece-100%3Fep%3D2142'; // Known working episode ID

const STATIC_ENDPOINTS = [
  { name: 'Browse (safe mode)', path: '/api/anime/browse?page=1&limit=25&sort=popularity&mode=safe' },
  { name: 'Browse (adult mode)', path: '/api/anime/browse?page=1&limit=25&sort=popularity&mode=adult' },
  { name: 'Search', path: '/api/anime/search?q=one%20piece&page=1' },
  { name: 'Trending', path: '/api/anime/trending?page=1' },
  { name: 'Latest', path: '/api/anime/latest?page=1' },
  { name: 'Top Rated', path: '/api/anime/top-rated?page=1&limit=25' },
  { name: 'Schedule', path: '/api/anime/schedule?page=1' },
  { name: 'Random', path: '/api/anime/random' },
];

function getEndpoints() {
  return [
    ...STATIC_ENDPOINTS,
    { name: 'Stream Servers', path: `/api/stream/servers/${resolvedEpisodeId}` },
    { name: 'Stream Watch', path: `/api/stream/watch/${resolvedEpisodeId}` },
  ];
}

/** Probe a single episode ID against the CF Worker stream endpoint; returns true if sources found. */
async function probeStream(episodeId: string): Promise<boolean> {
  try {
    const resp = await fetch(
      `${CF_WORKER_URL}/api/stream/watch/${encodeURIComponent(episodeId)}`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(25_000) },
    );
    if (!resp.ok) return false;
    const d = await resp.json() as { sources?: unknown[] };
    return Array.isArray(d.sources) && d.sources.length > 0;
  } catch {
    return false;
  }
}

/** Fetch a verified aniwatch-style episode ID from HiAnime. */
async function resolveEpisodeId(): Promise<void> {
  try {
    const homeResp = await fetch(`${CF_WORKER_URL}/api/home`, {
      headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000),
    });
    if (!homeResp.ok) return;
    const home = await homeResp.json() as { data?: { trendingAnimes?: Array<{ id?: string }> } };
    const trending = home.data?.trendingAnimes || [];

    for (const item of trending.slice(0, 5)) {
      const animeId = item.id;
      if (!animeId) continue;
      const epResp = await fetch(`${CF_WORKER_URL}/api/hianime/${encodeURIComponent(animeId)}/episodes`, {
        headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000),
      });
      if (!epResp.ok) continue;
      const epData = await epResp.json() as { data?: { episodes?: Array<{ episodeId?: string }> } };
      const eps = epData.data?.episodes || [];
      const ep = eps[0];
      if (!ep?.episodeId) continue;
      console.log(`  🔍 Probing: ${ep.episodeId} ...`);
      const works = await probeStream(ep.episodeId);
      if (works) {
        resolvedEpisodeId = encodeURIComponent(ep.episodeId);
        console.log(`\n📺 Resolved episode ID: ${ep.episodeId}`);
        return;
      }
    }
    console.log('  ⚠️ No working stream found in trending — using fallback ID');
;
  } catch {
    // Keep fallback ID
  }
}

async function testEndpoint(baseUrl: string, endpoint: { name: string; path: string }): Promise<TestResult> {
  const url = `${baseUrl}${endpoint.path}`;
  const startTime = performance.now();
  
  try {
    const isStream = url.includes('/stream/watch/');
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(isStream ? 60000 : 10000),
    });
    const endTime = performance.now();
    const text = await response.text();
    
    let details: TestResult['details'] = undefined;
    
    // Parse response to extract details
    if (response.ok && text) {
      try {
        const data = JSON.parse(text);
        
        if (data.results && Array.isArray(data.results)) {
          details = { resultCount: data.results.length, hasData: data.results.length > 0 };
          
          // Extract duration from first result if available
          if (data.results[0]?.duration) {
            details = { ...details, duration: data.results[0].duration };
          }
        }
        
        if (data.servers && Array.isArray(data.servers)) {
          details = { ...details, servers: data.servers.map((s: string | { name?: string }) => typeof s === 'string' ? s : s.name || s).slice(0, 5) };
        }
        
        if (data.sources && Array.isArray(data.sources)) {
          details = { ...details, sources: data.sources.slice(0, 5) };
          
          // Extract quality from sources if available
          const qualities = data.sources
            .map((s: { quality?: string }) => s.quality)
            .filter((q: string | undefined): q is string => Boolean(q))
            .slice(0, 5);
          if (qualities.length > 0) {
            details = { ...details, quality: qualities };
          }
        }
        
        if (data.episodes && Array.isArray(data.episodes)) {
          details = { ...details, resultCount: data.episodes.length, hasData: true };
          
          // Extract duration from first episode if available
          if (data.episodes[0]?.duration) {
            details = { ...details, duration: data.episodes[0].duration };
          }
        }
        
        // Extract duration directly if present
        if (data.duration) {
          details = { ...details, duration: data.duration };
        }
      } catch {
        // Response is not valid JSON, skip parsing
      }
    }
    
    return {
      endpoint: endpoint.name,
      url,
      status: response.status,
      time: endTime - startTime,
      size: text.length,
      success: response.ok,
      details,
    };
  } catch (error) {
    const endTime = performance.now();
    return {
      endpoint: endpoint.name,
      url,
      status: 0,
      time: endTime - startTime,
      size: 0,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runTestSuite(baseUrl: string, suiteName: string): Promise<TestSuite> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Running: ${suiteName}`);
  console.log(`Base URL: ${baseUrl}`);
  console.log(`${'='.repeat(60)}\n`);
  
  const results: TestResult[] = [];

  for (const endpoint of getEndpoints()) {
    const result = await testEndpoint(baseUrl, endpoint);
    results.push(result);
    
    const statusIcon = result.success ? '✓' : '✗';
    const timeStr = `${result.time.toFixed(2)}ms`;
    const sizeStr = `${(result.size / 1024).toFixed(2)}KB`;
    
    console.log(`${statusIcon} ${result.endpoint.padEnd(30)} ${timeStr.padEnd(10)} ${sizeStr.padEnd(10)} Status: ${result.status}`);
    
    // Show details if available
    if (result.details) {
      const detailParts: string[] = [];
      if (result.details.resultCount !== undefined) {
        detailParts.push(`${result.details.resultCount} items`);
      }
      if (result.details.duration) {
        detailParts.push(`duration: ${result.details.duration}`);
      }
      if (result.details.quality && result.details.quality.length > 0) {
        detailParts.push(`quality: [${result.details.quality.join(', ')}]`);
      }
      if (result.details.servers && result.details.servers.length > 0) {
        detailParts.push(`servers: [${result.details.servers.join(', ')}]`);
      }
      if (result.details.sources && result.details.sources.length > 0) {
        detailParts.push(`sources: [${result.details.sources.join(', ')}]`);
      }
      if (detailParts.length > 0) {
        console.log(`  └─ ${detailParts.join(' | ')}`);
      }
    }
    
    if (result.error) {
      console.log(`  └─ Error: ${result.error}`);
    }
  }
  
  const totalTime = results.reduce((sum, r) => sum + r.time, 0);
  const avgTime = totalTime / results.length;
  const successRate = (results.filter(r => r.success).length / results.length) * 100;
  
  return {
    name: suiteName,
    results,
    totalTime,
    avgTime,
    successRate,
  };
}

function compareSuites(cfSuite: TestSuite, renderSuite: TestSuite): void {
  console.log(`\n${'='.repeat(60)}`);
  console.log('COMPARISON: CF Worker vs Render Backend');
  console.log(`${'='.repeat(60)}\n`);
  
  console.log(`CF Worker Average: ${cfSuite.avgTime.toFixed(2)}ms (Success: ${cfSuite.successRate.toFixed(1)}%)`);
  console.log(`Render Average: ${renderSuite.avgTime.toFixed(2)}ms (Success: ${renderSuite.successRate.toFixed(1)}%)`);
  
  const diff = cfSuite.avgTime - renderSuite.avgTime;
  const diffPercent = (diff / renderSuite.avgTime) * 100;
  
  console.log(`\nDifference: ${diff.toFixed(2)}ms (${diffPercent > 0 ? '+' : ''}${diffPercent.toFixed(1)}%)`);
  console.log(diff < 0 ? 'CF Worker is faster!' : 'Render is faster!');
  
  console.log('\nEndpoint-by-endpoint comparison:');
  console.log('Endpoint'.padEnd(30) + 'CF Worker'.padEnd(15) + 'Render'.padEnd(15) + 'Diff');
  console.log('-'.repeat(75));
  
  for (let i = 0; i < cfSuite.results.length; i++) {
    const cfResult = cfSuite.results[i];
    const renderResult = renderSuite.results[i];
    const diff = cfResult.time - renderResult.time;
    const diffStr = diff > 0 ? `+${diff.toFixed(0)}ms` : `${diff.toFixed(0)}ms`;
    
    console.log(
      cfResult.endpoint.padEnd(30) +
      `${cfResult.time.toFixed(0)}ms`.padEnd(15) +
      `${renderResult.time.toFixed(0)}ms`.padEnd(15) +
      diffStr
    );
  }
}

async function main(): Promise<void> {
  console.log('🚀 API Speed Test Suite');
  console.log('Testing CF Worker vs Render Backend performance\n');

  // Resolve a real episode ID before running the suites
  console.log('🔍 Resolving real episode ID for streaming tests...');
  await resolveEpisodeId();

  // Test CF Worker
  const cfSuite = await runTestSuite(CF_WORKER_URL, 'Cloudflare Worker');
  
  await new Promise(resolve => setTimeout(resolve, 1000));

  await new Promise(resolve => setTimeout(resolve, 500));

  // Pre-check Render before testing it (free tier may be sleeping/crashed)
  let renderOnline = false;
  try {
    const hc = await fetch(`${RENDER_BACKEND_URL}/health`, { signal: AbortSignal.timeout(8000) });
    renderOnline = hc.ok;
  } catch { /* offline */ }

  let renderSuite: TestSuite;
  if (!renderOnline) {
    console.log('\n⚠️  Render backend unreachable — skipping Render test suite (cold start or crash).');
    renderSuite = {
      name: 'Render Backend (OFFLINE)',
      results: getEndpoints().map(e => ({ endpoint: e.name, url: `${RENDER_BACKEND_URL}${e.path}`, status: 0, time: 0, size: 0, success: false, error: 'offline' })),
      totalTime: 0, avgTime: 0, successRate: 0,
    };
  } else {
    renderSuite = await runTestSuite(RENDER_BACKEND_URL, 'Render Backend');
  }
  
  // Compare results
  compareSuites(cfSuite, renderSuite);
  
  console.log(`\n${'='.repeat(60)}`);
  console.log('Test Complete!');
  console.log(`${'='.repeat(60)}\n`);
}

main().catch(console.error);
