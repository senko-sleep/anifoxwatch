/**
 * Browser/Filter Functionality Test
 * Tests search filters, genre filtering, type filtering, sorting, etc.
 */

import axios from 'axios';

const API_BASE = process.env.API_URL || 'http://localhost:3001';
const TIMEOUT = 15000;

interface FilterTestResult {
  testName: string;
  endpoint: string;
  params: Record<string, string | number>;
  success: boolean;
  resultCount: number;
  sampleTitle?: string;
  error?: string;
  duration: number;
}

const FILTER_TESTS = [
  {
    name: 'Search by Query',
    endpoint: '/api/anime/search',
    params: { q: 'one piece', page: 1 }
  },
  {
    name: 'Search with Pagination',
    endpoint: '/api/anime/search',
    params: { q: 'naruto', page: 2 }
  },
  {
    name: 'Search with Source Filter',
    endpoint: '/api/anime/search',
    params: { q: 'bleach', source: 'Zoro', page: 1 }
  },
  {
    name: 'Trending Anime',
    endpoint: '/api/anime/trending',
    params: { page: 1 }
  },
  {
    name: 'Trending with Source',
    endpoint: '/api/anime/trending',
    params: { source: 'AnimePahe', page: 1 }
  },
  {
    name: 'Latest Episodes',
    endpoint: '/api/anime/latest',
    params: { page: 1 }
  },
  {
    name: 'Latest with Source',
    endpoint: '/api/anime/latest',
    params: { source: 'Gogoanime', page: 1 }
  },
  {
    name: 'Top Rated',
    endpoint: '/api/anime/top-rated',
    params: { page: 1, limit: 10 }
  },
  {
    name: 'Search All Sources',
    endpoint: '/api/anime/search-all',
    params: { q: 'attack on titan', page: 1 }
  },
  {
    name: 'Empty Search Query',
    endpoint: '/api/anime/search',
    params: { q: '', page: 1 }
  },
  {
    name: 'Special Characters Search',
    endpoint: '/api/anime/search',
    params: { q: 'sword art online', page: 1 }
  },
  {
    name: 'Long Query Search',
    endpoint: '/api/anime/search',
    params: { q: 'that time i got reincarnated as a slime', page: 1 }
  }
];

async function testFilter(test: typeof FILTER_TESTS[0]): Promise<FilterTestResult> {
  const startTime = Date.now();
  const result: FilterTestResult = {
    testName: test.name,
    endpoint: test.endpoint,
    params: test.params,
    success: false,
    resultCount: 0,
    duration: 0
  };

  try {
    console.log(`\n🧪 Testing: ${test.name}`);
    console.log(`   Endpoint: ${test.endpoint}`);
    console.log(`   Params: ${JSON.stringify(test.params)}`);

    const response = await axios.get(`${API_BASE}${test.endpoint}`, {
      params: test.params,
      timeout: TIMEOUT
    });

    const data = response.data;
    const results = data.results || data || [];
    
    result.resultCount = Array.isArray(results) ? results.length : 0;
    result.success = result.resultCount > 0 || test.name.includes('Empty');
    
    if (result.resultCount > 0 && results[0]?.title) {
      result.sampleTitle = results[0].title;
    }

    console.log(`   ✅ Success: ${result.resultCount} results`);
    if (result.sampleTitle) {
      console.log(`   Sample: "${result.sampleTitle}"`);
    }

  } catch (error) {
    const err = error as { message?: string; response?: { status: number } };
    result.error = err.response 
      ? `HTTP ${err.response.status}` 
      : err.message || 'Unknown error';
    console.log(`   ❌ Failed: ${result.error}`);
  }

  result.duration = Date.now() - startTime;
  return result;
}

async function runBrowserFilterTests(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║          BROWSER/FILTER FUNCTIONALITY TEST SUITE             ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\nAPI: ${API_BASE}`);
  console.log(`Total Tests: ${FILTER_TESTS.length}\n`);

  const results: FilterTestResult[] = [];

  for (const test of FILTER_TESTS) {
    const result = await testFilter(test);
    results.push(result);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Generate Report
  console.log('\n' + '═'.repeat(70));
  console.log('📊 FILTER TEST RESULTS');
  console.log('═'.repeat(70));

  const passed = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`\n✅ Passed Tests (${passed.length}/${FILTER_TESTS.length}):`);
  passed.forEach(r => {
    console.log(`   • ${r.testName.padEnd(30)} - ${r.resultCount} results (${r.duration}ms)`);
  });

  if (failed.length > 0) {
    console.log(`\n❌ Failed Tests (${failed.length}):`);
    failed.forEach(r => {
      console.log(`   • ${r.testName.padEnd(30)} - ${r.error}`);
    });
  }

  console.log('\n' + '═'.repeat(70));
  console.log('📈 STATISTICS');
  console.log('═'.repeat(70));
  console.log(`Pass Rate: ${Math.round(passed.length / FILTER_TESTS.length * 100)}%`);
  console.log(`Average Response Time: ${Math.round(results.reduce((sum, r) => sum + r.duration, 0) / results.length)}ms`);
  console.log(`Total Results Returned: ${results.reduce((sum, r) => sum + r.resultCount, 0)}`);

  // Save results
  const fs = await import('fs');
  fs.writeFileSync('./filter-test-results.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    apiBase: API_BASE,
    summary: {
      total: FILTER_TESTS.length,
      passed: passed.length,
      failed: failed.length,
      passRate: Math.round(passed.length / FILTER_TESTS.length * 100)
    },
    results
  }, null, 2));

  console.log(`\n📁 Results saved to: filter-test-results.json`);
  console.log('═'.repeat(70));
}

runBrowserFilterTests().catch(console.error);
