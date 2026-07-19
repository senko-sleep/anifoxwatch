/**
 * Comprehensive API endpoint tests
 * Tests search, streaming, and all critical endpoints
 */

import { describe, it, expect, beforeAll } from 'vitest';

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

describe('API Endpoint Tests', () => {
  beforeAll(async () => {
    console.log(`Testing API at: ${API_BASE}`);
  });

  it('Health check', async () => {
    const result = await testEndpoint('Health Check', '/health', (data) => {
      return data.status === 'healthy' && typeof data.uptime === 'number';
    });
    results.push(result);
    expect(result.passed).toBe(true);
  });

  it('Anime search - Demon Slayer', async () => {
    const result = await testEndpoint(
      'Search - Demon Slayer',
      '/api/anime/search?q=demon%20slayer',
      (data) => {
        return Array.isArray(data.results) && data.results.length > 0;
      }
    );
    results.push(result);
    expect(result.passed).toBe(true);
  });

  it('Anime search - Re:Zero', async () => {
    const result = await testEndpoint(
      'Search - Re:Zero',
      '/api/anime/search?q=re%20zero',
      (data) => {
        return Array.isArray(data.results) && data.results.length > 0;
      }
    );
    results.push(result);
    expect(result.passed).toBe(true);
  });

  it('AniList ID resolution - 189046', async () => {
    const result = await testEndpoint(
      'Resolve AniList 189046',
      '/api/anime/resolve?id=anilist-189046',
      (data) => {
        return data.streamingId && typeof data.streamingId === 'string';
      }
    );
    results.push(result);
    expect(result.passed).toBe(true);
  });

  it('Get anime details', async () => {
    const result = await testEndpoint(
      'Get Anime Details',
      '/api/anime?id=aniwaves-re-zero-kara-hajimeru-isekai-seikatsu-4th-season-82570',
      (data) => {
        return data.id && data.title && typeof data.title === 'string';
      }
    );
    results.push(result);
    expect(result.passed).toBe(true);
  });

  it('Get episodes', async () => {
    const result = await testEndpoint(
      'Get Episodes',
      '/api/anime/episodes?id=aniwaves-re-zero-kara-hajimeru-isekai-seikatsu-4th-season-82570',
      (data) => {
        return Array.isArray(data.episodes) && data.episodes.length > 0;
      }
    );
    results.push(result);
    expect(result.passed).toBe(true);
  });

  it('Get streaming servers', async () => {
    const result = await testEndpoint(
      'Get Streaming Servers',
      '/api/stream/servers/aniwaves-82570&eps=11',
      (data) => {
        return Array.isArray(data.servers) && data.servers.length > 0;
      }
    );
    results.push(result);
    expect(result.passed).toBe(true);
  });

  it('Get streaming links', async () => {
    const result = await testEndpoint(
      'Get Streaming Links',
      '/api/stream/watch/aniwaves-82570&eps=11',
      (data) => {
        return Array.isArray(data.sources) && data.sources.length > 0 && data.sources[0].url;
      }
    );
    results.push(result);
    expect(result.passed).toBe(true);
  });

  it('Hentai search - test mode', async () => {
    const result = await testEndpoint(
      'Search - Hentai (safe mode)',
      '/api/anime/search?q=hentai&mode=safe',
      (data) => {
        return Array.isArray(data.results);
      }
    );
    results.push(result);
    // In safe mode, should return empty or filtered results
    expect(result.passed).toBe(true);
  });

  it('Source health check', async () => {
    const result = await testEndpoint(
      'Source Health',
      '/api/sources/health',
      (data) => {
        return Array.isArray(data) && data.length > 0;
      }
    );
    results.push(result);
    expect(result.passed).toBe(true);
  });
});

// Print summary after all tests
afterAll(() => {
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
});
