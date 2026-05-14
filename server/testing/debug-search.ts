import { sourceManager } from '../src/services/source-manager.js';

async function debugSearch() {
    console.log('--- Debugging Search for "Bleach" ---');
    try {
        const results = await sourceManager.search("Bleach", 1);
        console.log(`Found ${results.results?.length || 0} results from ${results.source}`);
        results.results?.slice(0, 5).forEach((r: any) => {
            console.log(`- ${r.title} (${r.id}) type: ${r.type}`);
        });
    } catch (err: any) {
        console.error(`Search error: ${err.message}`);
    }
}

debugSearch();
