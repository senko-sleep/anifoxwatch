/**
 * Home Page API Test
 * Tests all endpoints used by the home page
 */

import axios from 'axios';

const API_BASE = process.env.API_URL || 'http://localhost:3001';
const TIMEOUT = 15000;

interface HomePageTestResult {
  section: string;
  endpoint: string;
  success: boolean;
  itemCount: number;
  sampleItems: string[];
  error?: string;
  duration: number;
}

async function testHomePageSection(
  section: string,
  endpoint: string,
  params?: Record<string, string | number>
): Promise<HomePageTestResult> {
  const startTime = Date.now();
  const result: HomePageTestResult = {
    section,
    endpoint,
    success: false,
    itemCount: 0,
    sampleItems: [],
    duration: 0
  };

  try {
    console.log(`\n📺 Testing: ${section}`);
    console.log(`   Endpoint: ${endpoint}`);

    const response = await axios.get(`${API_BASE}${endpoint}`, {
      params,
      timeout: TIMEOUT
    });

    const data = response.data;
    const items = data.results || data || [];
    
    result.itemCount = Array.isArray(items) ? items.length : 0;
    result.success = result.itemCount > 0;
    
    // Get sample titles
    if (Array.isArray(items)) {
      result.sampleItems = items
        .slice(0, 3)
        .map((item: { title?: string; anime?: { title?: string }; name?: string }) => 
          item.title || item.anime?.title || item.name || 'Unknown'
        );
    }

    console.log(`   ✅ Success: ${result.itemCount} items`);
    if (result.sampleItems.length > 0) {
      console.log(`   Samples: ${result.sampleItems.join(', ')}`);
    }

  } catch (error) {
    const err = error as { message?: string; response?: { status: number; data: unknown } };
    result.error = err.response 
      ? `HTTP ${err.response.status}: ${JSON.stringify(err.response.data).substring(0, 100)}` 
      : err.message || 'Unknown error';
    console.log(`   ❌ Failed: ${result.error}`);
  }

  result.duration = Date.now() - startTime;
  return result;
}

async function runHomePageTests(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║              HOME PAGE API TEST SUITE                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\nAPI: ${API_BASE}\n`);

  const results: HomePageTestResult[] = [];

  // Test all home page sections
  const sections = [
    { name: 'Trending Anime', endpoint: '/api/anime/trending', params: { page: 1 } },
    { name: 'Latest Episodes', endpoint: '/api/anime/latest', params: { page: 1 } },
    { name: 'Top Rated', endpoint: '/api/anime/top-rated', params: { page: 1, limit: 10 } },
    { name: 'Popular This Season', endpoint: '/api/anime/trending', params: { page: 1 } },
    { name: 'Recently Added', endpoint: '/api/anime/latest', params: { page: 1 } },
  ];

  // Test with different sources
  const testSources = ['HiAnimeDirect', 'Zoro', 'AnimePahe', 'Gogoanime'];

  console.log('Testing Core Endpoints...');
  for (const section of sections) {
    const result = await testHomePageSection(section.name, section.endpoint, section.params);
    results.push(result);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n\nTesting Multi-Source Support...');
  for (const source of testSources) {
    const result = await testHomePageSection(
      `Trending from ${source}`,
      '/api/anime/trending',
      { source, page: 1 }
    );
    results.push(result);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Test API health
  console.log('\n\nTesting System Health...');
  try {
    const healthResult = await testHomePageSection(
      'API Health Check',
      '/api/health'
    );
    results.push(healthResult);
  } catch (error) {
    console.log('   ⚠️ Health check endpoint not available');
  }

  // Test sources list
  try {
    const sourcesResult = await testHomePageSection(
      'Available Sources',
      '/api/sources'
    );
    results.push(sourcesResult);
  } catch (error) {
    console.log('   ⚠️ Sources endpoint not available');
  }

  // Generate Report
  console.log('\n' + '═'.repeat(70));
  console.log('📊 HOME PAGE TEST RESULTS');
  console.log('═'.repeat(70));

  const passed = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`\n✅ Working Sections (${passed.length}/${results.length}):`);
  passed.forEach(r => {
    console.log(`   • ${r.section.padEnd(35)} - ${r.itemCount} items (${r.duration}ms)`);
  });

  if (failed.length > 0) {
    console.log(`\n❌ Failed Sections (${failed.length}):`);
    failed.forEach(r => {
      console.log(`   • ${r.section.padEnd(35)} - ${r.error}`);
    });
  }

  console.log('\n' + '═'.repeat(70));
  console.log('📈 STATISTICS');
  console.log('═'.repeat(70));
  console.log(`Success Rate: ${Math.round(passed.length / results.length * 100)}%`);
  console.log(`Total Items Loaded: ${results.reduce((sum, r) => sum + r.itemCount, 0)}`);
  console.log(`Average Response Time: ${Math.round(results.reduce((sum, r) => sum + r.duration, 0) / results.length)}ms`);
  console.log(`Fastest Response: ${Math.min(...results.map(r => r.duration))}ms`);
  console.log(`Slowest Response: ${Math.max(...results.map(r => r.duration))}ms`);

  // Check if home page would load successfully
  const criticalSections = results.filter(r => 
    r.section.includes('Trending') || 
    r.section.includes('Latest') || 
    r.section.includes('Top Rated')
  );
  const criticalPassed = criticalSections.filter(r => r.success).length;
  const homePageWorking = criticalPassed >= 2;

  console.log('\n' + '═'.repeat(70));
  console.log('🏠 HOME PAGE STATUS');
  console.log('═'.repeat(70));
  console.log(`Critical Sections Working: ${criticalPassed}/${criticalSections.length}`);
  console.log(`Home Page Status: ${homePageWorking ? '✅ WORKING' : '❌ BROKEN'}`);

  if (homePageWorking) {
    console.log('\n✨ The home page should load successfully with content!');
  } else {
    console.log('\n⚠️ The home page may have issues loading content.');
  }

  // Save results
  const fs = await import('fs');
  fs.writeFileSync('./home-page-test-results.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    apiBase: API_BASE,
    summary: {
      total: results.length,
      passed: passed.length,
      failed: failed.length,
      successRate: Math.round(passed.length / results.length * 100),
      homePageWorking
    },
    results
  }, null, 2));

  console.log(`\n📁 Results saved to: home-page-test-results.json`);
  console.log('═'.repeat(70));
}

runHomePageTests().catch(console.error);
