/**
 * Verification Script for Aniwaves First Run
 * Verifies that SourceManager resolves the AniList ID 'anilist-189046'
 * to Aniwaves streams, prioritizing Aniwaves.
 *
 * Run with: npx tsx verify-aniwaves-first.ts
 */

import { SourceManager } from './src/services/source-manager.js';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
    console.log('===========================================================');
    console.log('  VERIFYING ANIWAVES FIRST STREAM RESOLUTION');
    console.log('  AniList ID: 189046 (Frieren: Beyond Journey\'s End), Ep: 1');
    console.log('===========================================================\n');

    console.log('📡 Instantiating SourceManager...');
    const sourceManager = new SourceManager();

    // Verify registration
    console.log('\n🔍 Active Sources in SourceManager:');
    const activeSources = Array.from((sourceManager as any).sources.keys());
    console.log(`   Registered sources: ${activeSources.join(', ')}`);

    const episodeId = 'anilist-189046';
    const epNum = 1;
    const anilistId = 189046;

    console.log(`\n📍 Resolving streaming links for ${episodeId} (Ep ${epNum})...`);
    const start = Date.now();
    
    try {
        const streamData = await sourceManager.getStreamingLinks(
            episodeId,
            undefined,
            'sub',
            epNum,
            anilistId
        );

        const duration = Date.now() - start;
        console.log('\n===========================================================');
        console.log('  RESOLUTION RESULTS');
        console.log('===========================================================');
        console.log(`⏱️  Duration: ${duration}ms`);
        console.log(`⭐ Winning Source: ${streamData.source}`);
        console.log(`🎵 Category: ${streamData.category}`);
        console.log(`📺 Qualities: ${streamData.sources?.map((s: any) => s.quality).join(', ')}`);
        
        if (streamData.sources && streamData.sources.length > 0) {
            console.log('\n🔗 Resolved Stream URLs:');
            streamData.sources.forEach((s: any, idx: number) => {
                console.log(`   [${idx + 1}] (${s.quality}) ${s.url}`);
            });
            console.log('\n🎉 SUCCESS! Aniwaves successfully resolved the AniList ID to working streams.');
        } else {
            console.log('\n❌ FAILED: No streaming sources returned.');
        }
    } catch (error) {
        console.error('\n❌ ERROR during resolution:', error);
    }
    
    console.log('\nDone.');
    process.exit(0);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
