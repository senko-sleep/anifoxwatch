/**
 * Targeted test: Search & Stream "Spy x Family Season 3"
 * Tests every non-adult source for search + episode + stream
 */

import axios from 'axios';
import { HiAnimeDirectSource } from '../src/sources/hianime-direct-source.js';
import { HiAnimeSource } from '../src/sources/hianime-source.js';
import { KaidoSource } from '../src/sources/kaido-source.js';
import { NineAnimeSource } from '../src/sources/nineanime-source.js';
import { AnimeFLVSource } from '../src/sources/animeflv-source.js';
import { AnimeKaiSource } from '../src/sources/animekai-source.js';
import { AnimePaheDirectSource } from '../src/sources/animepahe-direct-source.js';
import { ConsumetSource } from '../src/sources/consumet-source.js';
import { GogoanimeSource } from '../src/sources/gogoanime-source.js';
import { ZoroSource } from '../src/sources/zoro-source.js';
import { AnixSource } from '../src/sources/anix-source.js';
import { MarinSource } from '../src/sources/marin-source.js';
import { MiruroSource } from '../src/sources/miruro-source.js';
import { AniwatchSource } from '../src/sources/aniwatch-source.js';

const QUERY = 'Spy x Family Season 3';
const TIMEOUT = 15000;

interface Source {
    name: string;
    search(q: string, page?: number): Promise<{ results: Array<{ id: string; title: string }> }>;
    getEpisodes?(id: string): Promise<Array<{ id: string; number: number }>>;
    getStreamingLinks?(epId: string, server?: string, cat?: string): Promise<{ sources: Array<{ url: string; quality?: string }> }>;
    getEpisodeServers?(epId: string): Promise<Array<{ name: string }>>;
}

const sources: Source[] = [
    new HiAnimeDirectSource() as unknown as Source,
    new KaidoSource() as unknown as Source,
    new HiAnimeSource() as unknown as Source,
    new NineAnimeSource() as unknown as Source,
    new AnimeKaiSource() as unknown as Source,
    new AnimePaheDirectSource() as unknown as Source,
    new ConsumetSource() as unknown as Source,
    new GogoanimeSource() as unknown as Source,
    new ZoroSource() as unknown as Source,
    new AnixSource() as unknown as Source,
    new MarinSource() as unknown as Source,
    new MiruroSource() as unknown as Source,
    new AniwatchSource() as unknown as Source,
    new AnimeFLVSource() as unknown as Source,
];

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return Promise.race([
        p,
        new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`Timeout after ${ms}ms`)), ms))
    ]);
}

async function testSource(source: Source) {
    const tag = `[${source.name}]`;
    let searchResult: { id: string; title: string } | null = null;
    let streamUrl: string | null = null;
    let status = '❌';
    const notes: string[] = [];

    try {
        // 1. Search
        const sr = await withTimeout(source.search(QUERY), TIMEOUT, `${tag} search`);
        const results = sr?.results || [];
        if (results.length === 0) {
            notes.push('no search results');
            return { source: source.name, status: '❌', notes };
        }

        // Pick best match
        const best = results.find(r => r.title.toLowerCase().includes('spy') && r.title.toLowerCase().includes('family'))
            || results[0];
        searchResult = best;
        notes.push(`found: "${best.title}" (${results.length} results)`);

        // 2. Episodes
        if (!source.getEpisodes) {
            notes.push('no getEpisodes method');
            return { source: source.name, status: '🟡 SEARCH_ONLY', notes };
        }

        const eps = await withTimeout(source.getEpisodes(best.id), TIMEOUT, `${tag} episodes`);
        if (!eps || eps.length === 0) {
            notes.push('no episodes found');
            return { source: source.name, status: '🟡 SEARCH_ONLY', notes };
        }
        notes.push(`${eps.length} episodes`);

        if (!source.getStreamingLinks) {
            return { source: source.name, status: '🟡 SEARCH+EPISODES', notes };
        }

        // 3. Try streaming (first episode, a few servers)
        const ep = eps[0];
        const servers = source.getEpisodeServers
            ? await withTimeout(source.getEpisodeServers(ep.id), TIMEOUT, `${tag} servers`).catch(() => [{ name: 'hd-1' }, { name: 'hd-2' }])
            : [{ name: 'hd-1' }, { name: 'hd-2' }];

        for (const cat of ['sub', 'dub']) {
            for (const srv of (servers as Array<{ name: string }>).slice(0, 3)) {
                try {
                    const links = await withTimeout(
                        source.getStreamingLinks!(ep.id, srv.name, cat),
                        TIMEOUT,
                        `${tag} stream`
                    );
                    if (links?.sources?.length > 0) {
                        streamUrl = links.sources[0].url;
                        notes.push(`stream OK (${srv.name}/${cat}): ${streamUrl.substring(0, 60)}...`);
                        status = '✅ FULL';
                        break;
                    }
                } catch (e: any) {
                    // try next
                }
                if (streamUrl) break;
            }
            if (streamUrl) break;
        }

        if (!streamUrl) {
            notes.push('stream failed on all servers/cats');
            status = '🟡 NO_STREAM';
        }

    } catch (e: any) {
        notes.push(`ERROR: ${e.message}`);
        status = '❌';
    }

    return { source: source.name, status, notes };
}

async function main() {
    console.log(`\n${BOLD}🔍 Spy x Family Season 3 — Search + Stream Test${RESET}`);
    console.log(`${'═'.repeat(65)}`);
    console.log(`Query: "${QUERY}"\n`);

    const results = await Promise.all(sources.map(testSource));

    const working: typeof results = [];
    const partial: typeof results = [];
    const broken: typeof results = [];

    for (const r of results) {
        if (r.status.startsWith('✅')) working.push(r);
        else if (r.status.startsWith('🟡')) partial.push(r);
        else broken.push(r);
    }

    console.log(`\n${GREEN}${BOLD}✅ FULLY WORKING (${working.length})${RESET}`);
    for (const r of working) {
        console.log(`  ${GREEN}${r.source}${RESET}`);
        for (const n of r.notes) console.log(`    → ${n}`);
    }

    console.log(`\n${YELLOW}${BOLD}🟡 PARTIAL (${partial.length})${RESET}`);
    for (const r of partial) {
        console.log(`  ${YELLOW}${r.source}${RESET} — ${r.status}`);
        for (const n of r.notes) console.log(`    → ${n}`);
    }

    console.log(`\n${RED}${BOLD}❌ BROKEN (${broken.length})${RESET}`);
    for (const r of broken) {
        console.log(`  ${RED}${r.source}${RESET}`);
        for (const n of r.notes) console.log(`    → ${n}`);
    }

    console.log(`\n${'═'.repeat(65)}`);
    console.log(`Summary: ${working.length} working / ${partial.length} partial / ${broken.length} broken\n`);
}

main().catch(console.error);
