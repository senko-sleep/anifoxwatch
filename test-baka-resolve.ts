import { SourceManager } from './server/src/services/source-manager.js';
import { anilistService } from './server/src/services/anilist-service.js';

async function main() {
    console.log('Testing AniList resolution for 6347 (Baka and Test)');
    const manager = new SourceManager();
    const result = await manager.resolveAniListToStreamingId(6347);
    console.log('Resolved streaming ID:', result);
}

main().catch(console.error);
