import { SourceManager } from './server/src/services/source-manager.js';

async function main() {
    console.log('Testing getEpisodes for anilist-6347');
    const manager = new SourceManager();
    const episodes = await manager.getEpisodes('anilist-6347');
    console.log(`Found ${episodes.length} episodes`);
    if (episodes.length > 0) {
        console.log('First ep:', episodes[0]);
    }
}

main().catch(console.error);
