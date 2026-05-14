/**
 * Test dub streaming for all registered sources.
 * Uses the running local server at http://127.0.0.1:3001
 * 
 * Tests Re:Zero S4 Episode 1 (anilist-189046) for dub availability.
 */

const BASE = 'http://127.0.0.1:3001';

// Test anime: Re:Zero S4 — known to have dub
const EPISODE_ID = 'rezero-kara-hajimeru-isekai-seikatsu-4th-season-8lj0$ep=1$token=Ltfh8KXzuwau03VfhY-G';
const ANILIST_ID = 189046;

interface TestResult {
    source: string;
    category: 'sub' | 'dub';
    success: boolean;
    sourceCount: number;
    streamUrl?: string;
    error?: string;
    responseCategory?: string;
    time: number;
}

async function testStream(category: 'sub' | 'dub'): Promise<TestResult> {
    const params = new URLSearchParams({
        category,
        ep_num: '1',
        anilist_id: String(ANILIST_ID),
    });
    const url = `${BASE}/api/stream/watch/${encodeURIComponent(EPISODE_ID)}?${params}`;
    console.log(`\n🎯 Testing ${category.toUpperCase()} stream...`);
    console.log(`   URL: ${url.substring(0, 120)}...`);
    
    const start = Date.now();
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000);
        
        const resp = await fetch(url, { 
            signal: controller.signal,
            headers: { 'Accept': 'application/json' }
        });
        clearTimeout(timeout);
        
        if (!resp.ok) {
            const text = await resp.text();
            return {
                source: 'unknown',
                category,
                success: false,
                sourceCount: 0,
                error: `HTTP ${resp.status}: ${text.substring(0, 200)}`,
                time: Date.now() - start,
            };
        }
        
        const data = await resp.json();
        const elapsed = Date.now() - start;
        
        return {
            source: data.source || 'unknown',
            category,
            success: (data.sources?.length || 0) > 0,
            sourceCount: data.sources?.length || 0,
            streamUrl: data.sources?.[0]?.url?.substring(0, 120),
            responseCategory: data.category,
            time: elapsed,
        };
    } catch (err: any) {
        return {
            source: 'unknown',
            category,
            success: false,
            sourceCount: 0,
            error: err.message,
            time: Date.now() - start,
        };
    }
}

async function testServers(): Promise<void> {
    const url = `${BASE}/api/stream/servers/${encodeURIComponent(EPISODE_ID)}?ep_num=1&anilist_id=${ANILIST_ID}`;
    console.log('\n📡 Testing server list...');
    
    try {
        const resp = await fetch(url);
        const data = await resp.json();
        console.log(`   Servers found: ${data.servers?.length || 0}`);
        for (const s of data.servers || []) {
            console.log(`   - ${s.name} (${s.type})`);
        }
        
        const hasDubServer = data.servers?.some((s: any) => s.type === 'dub');
        console.log(`   Has dub server: ${hasDubServer}`);
    } catch (err: any) {
        console.error(`   Failed: ${err.message}`);
    }
}

async function testGogoDubUrl(): Promise<void> {
    console.log('\n🔍 Testing Gogoanime dub URL pattern...');
    // The standard Gogoanime dub URL pattern for Re:Zero S4 EP1
    const dubSlugs = [
        'rezero-kara-hajimeru-isekai-seikatsu-4th-season-dub-episode-1',
        'rezero-kara-hajimeru-isekai-seikatsu-4th-season-episode-1',
        're-zero-kara-hajimeru-isekai-seikatsu-4th-season-dub-episode-1',
        're-zero-starting-life-in-another-world-season-4-dub-episode-1',
    ];
    
    for (const slug of dubSlugs) {
        try {
            const resp = await fetch(`https://anitaku.to/${slug}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                },
                redirect: 'follow',
            });
            console.log(`   ${slug}: HTTP ${resp.status} (${resp.ok ? '✅' : '❌'})`);
        } catch (err: any) {
            console.log(`   ${slug}: ERROR ${err.message}`);
        }
    }
}

async function testGogoSearch(): Promise<void> {
    console.log('\n🔍 Testing Gogoanime dub search...');
    const queries = ['Re Zero dub', 'Re:Zero dub', 'Rezero kara dub'];
    
    for (const q of queries) {
        try {
            const resp = await fetch(`https://anitaku.to/search.html?keyword=${encodeURIComponent(q)}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                },
            });
            const html = await resp.text();
            const dubResults = html.match(/<a[^>]*href="\/category\/[^"]*dub[^"]*"/gi) || [];
            const dubTitles = html.match(/class="name"[^>]*>.*?<a[^>]*>.*?<\/a>/gis) || [];
            console.log(`   "${q}": ${dubResults.length} dub category links found`);
            for (const link of dubResults.slice(0, 3)) {
                const href = link.match(/href="([^"]+)"/)?.[1] || '';
                console.log(`     - ${href}`);
            }
        } catch (err: any) {
            console.log(`   "${q}": ERROR ${err.message}`);
        }
    }
}

async function main() {
    console.log('=' .repeat(60));
    console.log('🧪 DUB STREAM TEST FOR ALL SOURCES');
    console.log('=' .repeat(60));
    console.log(`Episode: ${EPISODE_ID}`);
    console.log(`AniList ID: ${ANILIST_ID}`);
    
    // Test servers first
    await testServers();
    
    // Test sub stream (baseline)
    const subResult = await testStream('sub');
    console.log(`\n📊 SUB Result:`);
    console.log(`   Source: ${subResult.source}`);
    console.log(`   Success: ${subResult.success}`);
    console.log(`   Sources: ${subResult.sourceCount}`);
    console.log(`   Response Category: ${subResult.responseCategory}`);
    console.log(`   Time: ${subResult.time}ms`);
    if (subResult.streamUrl) console.log(`   URL: ${subResult.streamUrl}...`);
    if (subResult.error) console.log(`   Error: ${subResult.error}`);
    
    // Test dub stream
    const dubResult = await testStream('dub');
    console.log(`\n📊 DUB Result:`);
    console.log(`   Source: ${dubResult.source}`);
    console.log(`   Success: ${dubResult.success}`);
    console.log(`   Sources: ${dubResult.sourceCount}`);
    console.log(`   Response Category: ${dubResult.responseCategory}`);
    console.log(`   Time: ${dubResult.time}ms`);
    if (dubResult.streamUrl) console.log(`   URL: ${dubResult.streamUrl}...`);
    if (dubResult.error) console.log(`   Error: ${dubResult.error}`);
    
    // Test Gogoanime dub URL patterns
    await testGogoDubUrl();
    
    // Test Gogoanime dub search
    await testGogoSearch();
    
    console.log('\n' + '=' .repeat(60));
    console.log('📋 SUMMARY');
    console.log('=' .repeat(60));
    console.log(`SUB: ${subResult.success ? '✅' : '❌'} (${subResult.sourceCount} sources from ${subResult.source})`);
    console.log(`DUB: ${dubResult.success ? '✅' : '❌'} (${dubResult.sourceCount} sources from ${dubResult.source})`);
    
    if (!dubResult.success) {
        console.log('\n⚠️  DUB STREAM NOT FOUND — Possible issues:');
        console.log('   1. Gogoanime slug mismatch (dub episode URL is wrong)');
        console.log('   2. AnimeKai/Consumet SubOrSub.DUB parameter ignored');
        console.log('   3. AllAnime dub translationType not finding content');
        console.log('   4. 9Anime dub search query not matching');
        console.log('   5. validateDubStream() rejecting valid dub content');
    }
}

main().catch(console.error);
