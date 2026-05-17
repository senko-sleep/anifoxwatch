/**
 * Fast Naruto search and stream test with hasDub/hasSub tracking
 * Outputs JSON with scraped/unscraped status
 */

import fs from 'fs';
import { GogoanimeSource } from './src/sources/gogoanime-source.js';
import { AnimeKaiSource } from './src/sources/animekai-source.js';
import { AniwavesSource } from './src/sources/aniwaves-source.js';
import { AllAnimeSource } from './src/sources/allanime-source.js';

interface NarutoResult {
    id: string;
    title: string;
    hasSub: boolean;
    hasDub: boolean;
    source: string;
    episodes?: number;
    extractedStreams?: {
        sub?: number;
        dub?: number;
    };
    extractedServers?: string[];
    scraped: boolean;
    scrapeError?: string;
}

interface ScrapeStatus {
    sources: Record<string, {
        searched: boolean;
        results: number;
        scraped: number;
        errors: string[];
    }>;
    totalTime: number;
    output: NarutoResult[];
}

const sources = [
    { name: 'AnimeKai', src: new AnimeKaiSource() },
    { name: 'Gogoanime', src: new GogoanimeSource() },
    { name: 'Aniwaves', src: new AniwavesSource() },
    { name: 'AllAnime', src: new AllAnimeSource() },
];

const scrapeStatus: ScrapeStatus = {
    sources: {},
    totalTime: 0,
    output: []
};

async function testSource(source: { name: string; src: any }, signal: AbortSignal): Promise<NarutoResult[]> {
    const results: NarutoResult[] = [];
    const status = { searched: false, results: 0, scraped: 0, errors: [] as string[] };
    
    try {
        const searchPromise = source.src.search('Naruto', 1);
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Search timeout')), 15000)
        );
        
        const searchResult = await Promise.race([searchPromise, timeoutPromise]);
        status.searched = true;
        status.results = searchResult.results?.length || 0;
        
console.log(`[${source.name}] Found ${status.results} results for "Naruto"`);
         
         // Find main Naruto series (prefer non-movie entries)
         const mainSeries = searchResult.results.filter((a: any) => {
            const t = a.title.toLowerCase();
            const id = (a.id || '').toLowerCase();
            // Match main Naruto series - id must start with naruto- and not contain movie/ova
            if (id === 'naruto' || id === 'naruto-shippuden') return true;
            if (id.startsWith('naruto-') && !t.includes('movie') && !id.includes('ova')) return true;
            return false;
        });
        
        // Sort to prefer "naruto" or "naruto-shippuden" over other specials
        mainSeries.sort((a: any, b: any) => {
            const aId = a.id.toLowerCase();
            const bId = b.id.toLowerCase();
            if (aId === 'naruto') return -1;
            if (bId === 'naruto') return 1;
            if (aId === 'naruto-shippuden') return -1;
            if (bId === 'naruto-shippuden') return 1;
            return 0;
        });
        const targetList = mainSeries.length > 0 ? mainSeries : searchResult.results.slice(0, 1);
        
        for (const anime of targetList.slice(0, 3)) {
            
            const result: NarutoResult = {
                id: anime.id,
                title: anime.title,
                hasSub: false,
                hasDub: false,
                source: source.name,
                scraped: false
            };
            
            try {
                const fullInfo = await Promise.race([
                    source.src.getAnime(anime.id),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Info timeout')), 10000))
                ]);
                
                if (fullInfo) {
                    result.hasSub = true;
                    result.hasDub = fullInfo.dubCount > 0 || fullInfo.subCount > 0;
                    result.episodes = fullInfo.episodes;
                    status.scraped++;
                }
            } catch (e: any) {
                result.scrapeError = `info: ${e.message}`;
                status.errors.push(`${anime.id}: ${e.message}`);
            }
            
            // Test stream extraction
            if (result.hasSub) {
                try {
                    const eps = await Promise.race([
                        source.src.getEpisodes(anime.id),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Ep timeout')), 10000))
                    ]) as any[];
                    
                    if (eps?.length > 0) {
                        const epId = eps[0].id;
                        console.log(`[${source.name}] Testing stream for ${anime.title} ep 1`);
                        
                        // Test SUB stream
                        try {
                            const subLinks = await Promise.race([
                                source.src.getStreamingLinks(epId, undefined, 'sub'),
                                new Promise((_, reject) => setTimeout(() => reject(new Error('Stream timeout')), 20000))
                            ]);
                            
                            const subSources = (subLinks as any).sources?.length || 0;
                            result.hasSub = subSources > 0;
                            result.extractedStreams = { sub: subSources };
                            result.extractedServers = (subLinks as any).sources?.map((s: any) => s.server).filter(Boolean) || [];
                        } catch (e: any) {
                            result.extractedStreams = { sub: 0 };
                        }
                        
                        // Test DUB stream
                        if (result.hasDub) {
                            try {
                                const dubLinks = await Promise.race([
                                    source.src.getStreamingLinks(epId, undefined, 'dub'),
                                    new Promise((_, reject) => setTimeout(() => reject(new Error('Dub timeout')), 20000))
                                ]);
                                
                                const dubSources = (dubLinks as any).sources?.length || 0;
                                result.hasDub = dubSources > 0;
                                result.extractedStreams = { ...result.extractedStreams, dub: dubSources };
                            } catch {
                                result.extractedStreams = { ...result.extractedStreams, dub: 0 };
                            }
                        }
                        
                        result.scraped = true;
                    }
                } catch (e: any) {
                    result.scrapeError = `stream: ${e.message}`;
                    status.errors.push(`stream: ${e.message}`);
                }
            }
            
            results.push(result);
            if (results.length >= 1) break; // Only test first result per source
        }
    } catch (e: any) {
        status.errors.push(`search: ${e.message}`);
    }
    
    scrapeStatus.sources[source.name] = status;
    return results;
}

async function main() {
    const startTime = Date.now();
    const controller = new AbortController();
    
    console.log('=== Naruto Search Test ===\n');
    
    for (const { name, src } of sources) {
        console.log(`\n--- Testing ${name} ---`);
        try {
            const results = await testSource({ name, src }, controller.signal);
            scrapeStatus.output.push(...results);
        } catch (e: any) {
            console.log(`${name} failed: ${e.message}`);
        }
        if (controller.signal.aborted) break;
    }
    
    scrapeStatus.totalTime = Date.now() - startTime;
    
    // Output results
    console.log('\n=== RESULTS ===');
    console.log(JSON.stringify({
        scraped: scrapeStatus.output.filter(r => r.scraped),
        unscraped: scrapeStatus.output.filter(r => !r.scraped),
        status: scrapeStatus.sources
    }, null, 2));
    
    // Write to file
    fs.writeFileSync('naruto-scrape-results.json', JSON.stringify({
        scraped: scrapeStatus.output.filter(r => r.scraped),
        unscraped: scrapeStatus.output.filter(r => !r.scraped),
        status: scrapeStatus.sources,
        totalTime: scrapeStatus.totalTime
    }, null, 2));
    console.log('\nResults written to naruto-scrape-results.json');
}

main().catch(console.error);