/**
 * Master Test Runner
 * Runs all test suites and generates comprehensive report
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

interface TestSuite {
  name: string;
  file: string;
  description: string;
}

const TEST_SUITES: TestSuite[] = [
  {
    name: 'Home Page APIs',
    file: 'test-home-page-apis.ts',
    description: 'Tests all endpoints used by the home page'
  },
  {
    name: 'Browser/Filters',
    file: 'test-browser-filters.ts',
    description: 'Tests search filters, pagination, and sorting'
  },
  {
    name: 'All Sources Health',
    file: 'test-all-sources.ts',
    description: 'Tests health check and basic functionality of all 28 sources'
  },
  {
    name: 'Streaming Verification',
    file: 'test-streaming-all-sources.ts',
    description: 'Tests actual video stream extraction from all sources'
  },
  {
    name: 'HTML Scraping Patterns',
    file: 'test-html-scraping-patterns.ts',
    description: 'Tests HTML parsing and extraction patterns'
  }
];

async function runTestSuite(suite: TestSuite): Promise<{ success: boolean; output: string; duration: number }> {
  const startTime = Date.now();
  
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`🧪 Running: ${suite.name}`);
  console.log(`   ${suite.description}`);
  console.log('═'.repeat(70));

  try {
    const { stdout, stderr } = await execAsync(`npx ts-node ${suite.file}`, {
      cwd: __dirname,
      timeout: 300000 // 5 minutes max per test
    });

    const output = stdout + (stderr || '');
    const duration = Date.now() - startTime;

    console.log(output);
    
    return { success: true, output, duration };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    const output = (err.stdout || '') + (err.stderr || '') + (err.message || '');
    const duration = Date.now() - startTime;
    
    console.log(output);
    
    return { success: false, output, duration };
  }
}

async function runAllTests(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║          ANISTREAM HUB - MASTER TEST SUITE                   ║');
  console.log('║          Testing 28 Anime Sources + All Features            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\nStarting at: ${new Date().toISOString()}`);
  console.log(`Total Test Suites: ${TEST_SUITES.length}\n`);

  const results: Array<{
    suite: TestSuite;
    success: boolean;
    duration: number;
    output: string;
  }> = [];

  const overallStartTime = Date.now();

  for (const suite of TEST_SUITES) {
    const result = await runTestSuite(suite);
    results.push({
      suite,
      success: result.success,
      duration: result.duration,
      output: result.output
    });

    // Small delay between test suites
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  const overallDuration = Date.now() - overallStartTime;

  // Generate Master Report
  console.log('\n\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                  MASTER TEST REPORT                          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const passed = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`\n✅ Passed Test Suites (${passed.length}/${TEST_SUITES.length}):`);
  passed.forEach(r => {
    console.log(`   • ${r.suite.name.padEnd(30)} - ${(r.duration / 1000).toFixed(1)}s`);
  });

  if (failed.length > 0) {
    console.log(`\n❌ Failed Test Suites (${failed.length}):`);
    failed.forEach(r => {
      console.log(`   • ${r.suite.name.padEnd(30)} - ${(r.duration / 1000).toFixed(1)}s`);
    });
  }

  console.log('\n' + '═'.repeat(70));
  console.log('📈 OVERALL STATISTICS');
  console.log('═'.repeat(70));
  console.log(`Total Test Suites: ${TEST_SUITES.length}`);
  console.log(`Passed: ${passed.length}`);
  console.log(`Failed: ${failed.length}`);
  console.log(`Success Rate: ${Math.round(passed.length / TEST_SUITES.length * 100)}%`);
  console.log(`Total Duration: ${(overallDuration / 1000 / 60).toFixed(1)} minutes`);

  // Collect individual test results
  const testResultFiles = [
    'home-page-test-results.json',
    'filter-test-results.json',
    'test-results.json',
    'streaming-test-results.json',
    'scraping-test-results.json'
  ];

  const aggregatedStats: Record<string, unknown> = {};

  for (const file of testResultFiles) {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const fileName = file.replace('-results.json', '').replace('.json', '');
        aggregatedStats[fileName] = data.summary || data;
      } catch {
        // Ignore parse errors
      }
    }
  }

  console.log('\n' + '═'.repeat(70));
  console.log('🎯 FEATURE STATUS');
  console.log('═'.repeat(70));

  if (aggregatedStats['home-page-test']) {
    const homeData = aggregatedStats['home-page-test'] as { homePageWorking?: boolean; successRate?: number };
    console.log(`Home Page: ${homeData.homePageWorking ? '✅ Working' : '❌ Issues'} (${homeData.successRate}% success)`);
  }

  if (aggregatedStats['filter-test']) {
    const filterData = aggregatedStats['filter-test'] as { passRate?: number };
    console.log(`Browser/Filters: ${filterData.passRate && filterData.passRate > 80 ? '✅ Working' : '⚠️ Partial'} (${filterData.passRate}% pass rate)`);
  }

  if (aggregatedStats['streaming-test']) {
    const streamData = aggregatedStats['streaming-test'] as { fullyWorking?: number; total?: number; successRate?: number };
    console.log(`Streaming: ${streamData.fullyWorking}/${streamData.total} sources working (${streamData.successRate}% success)`);
  }

  if (aggregatedStats['test']) {
    const sourcesData = aggregatedStats['test'] as { workingSources?: number; sourceCount?: number };
    console.log(`Source Health: ${sourcesData.workingSources}/${sourcesData.sourceCount} sources online`);
  }

  // Save master report
  const masterReport = {
    timestamp: new Date().toISOString(),
    duration: overallDuration,
    testSuites: {
      total: TEST_SUITES.length,
      passed: passed.length,
      failed: failed.length,
      successRate: Math.round(passed.length / TEST_SUITES.length * 100)
    },
    results: results.map(r => ({
      name: r.suite.name,
      success: r.success,
      duration: r.duration
    })),
    aggregatedStats
  };

  fs.writeFileSync(
    path.join(__dirname, 'master-test-report.json'),
    JSON.stringify(masterReport, null, 2)
  );

  console.log('\n📁 Master report saved to: master-test-report.json');
  console.log('\n' + '═'.repeat(70));
  console.log(`\nCompleted at: ${new Date().toISOString()}`);
  console.log('═'.repeat(70));

  // Exit with appropriate code
  process.exit(failed.length > 0 ? 1 : 0);
}

runAllTests().catch(error => {
  console.error('Fatal error running tests:', error);
  process.exit(1);
});
