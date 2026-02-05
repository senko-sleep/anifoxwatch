/**
 * Run all Cloudflare Workers tests sequentially
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const tests = [
  'test-cloudflare-servers.js',
  'test-cloudflare-watch.js',
  'test-cloudflare-proxy-get.js',
  'test-cloudflare-proxy-post.js',
  'test-cloudflare-full-flow.js'
];

async function runTest(testFile) {
  return new Promise((resolve, reject) => {
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`🧪 Running: ${testFile}`);
    console.log('═'.repeat(70));

    const child = spawn('node', [join(__dirname, testFile)], {
      stdio: 'inherit',
      shell: true
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Test ${testFile} failed with code ${code}`));
      }
    });

    child.on('error', reject);
  });
}

async function runAllTests() {
  console.log('\n🚀 Starting Cloudflare Workers API Tests\n');
  console.log('Testing: https://anifoxwatch-api.anifoxwatch.workers.dev');
  console.log('═'.repeat(70));

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      await runTest(test);
      passed++;
    } catch (error) {
      console.error(`\n❌ ${test} failed:`, error.message);
      failed++;
    }
  }

  console.log('\n\n' + '═'.repeat(70));
  console.log('📊 TEST SUMMARY');
  console.log('═'.repeat(70));
  console.log(`✅ Passed: ${passed}/${tests.length}`);
  console.log(`❌ Failed: ${failed}/${tests.length}`);
  console.log('═'.repeat(70));

  if (failed === 0) {
    console.log('\n🎉 All tests passed! Cloudflare Workers is working perfectly!');
  } else {
    console.log('\n⚠️  Some tests failed. Check the output above for details.');
  }
}

runAllTests().catch(console.error);
