import { GogoanimeSource } from '../server/src/sources/gogoanime-source.js';

async function run() {
    console.log("Testing GogoanimeSource...");
    const src = new GogoanimeSource();
    
    console.log("Checking health...");
    const health = await src.healthCheck();
    console.log("Health result:", health);
    
    console.log("Searching for 'Re:Zero'...");
    try {
        const searchRes = await src.search("Re:Zero", 1);
        console.log(`Found ${searchRes.results.length} results:`);
        for (const r of searchRes.results) {
            console.log(` - ID: ${r.id}, Title: ${r.title}`);
        }
    } catch (e: any) {
        console.error("Search failed:", e.message);
    }
}

run().catch(console.error);
