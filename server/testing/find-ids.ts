import { anilistService } from '../src/services/anilist-service.js';

const QUERIES = ['Naruto', 'Naruto Shippuden', 'Jujutsu Kaisen', 'Kimetsu no Yaiba'];

(async () => {
  for (const q of QUERIES) {
    try {
      const r = await anilistService.advancedSearch({
        search: q, sort: ['SEARCH_MATCH'], perPage: 5, page: 1,
      });
      const top = (r.results || []).slice(0, 5).map(x => ({
        id: (x as any).id,
        title: (x as any).title?.english || (x as any).title?.romaji || '?',
      }));
      console.log(`${q}: ${JSON.stringify(top)}`);
    } catch (e: any) {
      console.log(`${q}: ERR ${e.message}`);
    }
  }
})();
