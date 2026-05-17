import { anilistService } from '../src/services/anilist-service.js';

const IDS = [20, 30, 936, 1735, 10075, 101922, 113415, 113898];

(async () => {
  for (const id of IDS) {
    try {
      const d = await anilistService.getAnimeById(id);
      console.log(`AL ${id}: ${(d as any)?.title?.english || (d as any)?.title?.romaji || '?'}`);
    } catch {
      console.log(`AL ${id}: NOT FOUND`);
    }
  }
})();
