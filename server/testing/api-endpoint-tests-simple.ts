/**
 * Standalone API endpoint tests (no vitest dependency)
 * Tests search, streaming, and all critical endpoints
 */

const API_BASE = process.env.API_BASE || 'http://localhost:3001';

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  data?: any;
}

const results: TestResult[] = [];

async function testEndpoint(name: string, url: string, validator?: (data: any) => boolean): Promise<TestResult> {
  const start = Date.now();
  try {
    const response = await fetch(`${API_BASE}${url}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(30000)
    });
    
    const duration = Date.now() - start;
    
    if (!response.ok) {
      return {
        name,
        passed: false,
        duration,
        error: `HTTP ${response.status}: ${response.statusText}`
      };
    }
    
    const data = await response.json();
    
    if (validator && !validator(data)) {
      return {
        name,
        passed: false,
        duration,
        error: 'Validation failed'
      };
    }
    
    return {
      name,
      passed: true,
      duration,
      data
    };
  } catch (error) {
    const duration = Date.now() - start;
    return {
      name,
      passed: false,
      duration,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function runTests() {
  console.log(`=== API Endpoint Tests ===`);
  console.log(`Testing API at: ${API_BASE}\n`);
  
  const tests = [
    {
      name: 'Health Check',
      url: '/health',
      validator: (data: any) => data.status === 'healthy' && typeof data.uptime === 'number'
    },
    {
      name: 'Search - Demon Slayer',
      url: '/api/anime/search?q=demon%20slayer',
      validator: (data: any) => Array.isArray(data.results) && data.results.length > 0
    },
    {
      name: 'Search - Re:Zero',
      url: '/api/anime/search?q=re%20zero',
      validator: (data: any) => Array.isArray(data.results) && data.results.length > 0
    },
    {
      name: 'Resolve AniList 189046',
      url: '/api/anime/resolve?id=anilist-189046',
      validator: (data: any) => data.streamingId && typeof data.streamingId === 'string'
    },
    {
      name: 'Get Anime Details',
      url: '/api/anime?id=aniwaves-re-zero-kara-hajimeru-isekai-seikatsu-4th-season-82570',
      validator: (data: any) => data.id && data.title && typeof data.title === 'string'
    },
    {
      name: 'Get Episodes',
      url: '/api/anime/episodes?id=aniwaves-re-zero-kara-hajimeru-isekai-seikatsu-4th-season-82570',
      validator: (data: any) => Array.isArray(data.episodes) && data.episodes.length > 0
    },
    {
      name: 'Get Streaming Servers',
      url: '/api/stream/servers/aniwaves-82570&eps=11',
      validator: (data: any) => Array.isArray(data.servers) && data.servers.length > 0
    },
    {
      name: 'Get Streaming Links',
      url: '/api/stream/watch/aniwaves-82570&eps=11',
      validator: (data: any) => Array.isArray(data.sources) && data.sources.length > 0 && data.sources[0].url
    },
    {
      name: 'Search - Hentai (safe mode)',
      url: '/api/anime/search?q=hentai&mode=safe',
      validator: (data: any) => Array.isArray(data.results)
    },
    {
      name: 'Source Health',
      url: '/api/sources/health',
      validator: (data: any) => Array.isArray(data.sources) && data.sources.length > 0
    }
  ];
  
  for (const test of tests) {
    console.log(`Testing: ${test.name}`);
    const result = await testEndpoint(test.name, test.url, test.validator);
    results.push(result);
    
    if (result.passed) {
      console.log(`✅ ${test.name}: ${result.duration}ms`);
    } else {
      console.log(`❌ ${test.name}: ${result.error}`);
    }
  }
  
  // Summary
  console.log('\n=== Test Summary ===');
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;
  
  console.log(`Total: ${total}, Passed: ${passed}, Failed: ${failed}`);
  
  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.name}: ${r.error}`);
    });
  }
  
  console.log('\nPerformance:');
  results.forEach(r => {
    console.log(`  - ${r.name}: ${r.duration}ms`);
  });
  
  // Check for slow endpoints (>5s)
  const slowEndpoints = results.filter(r => r.duration > 5000);
  if (slowEndpoints.length > 0) {
    console.log('\n⚠️  Slow endpoints (>5s):');
    slowEndpoints.forEach(r => {
      console.log(`  - ${r.name}: ${r.duration}ms`);
    });
  }
}

runTests().catch(console.error);
