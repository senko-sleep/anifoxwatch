import { anilistService } from '../src/services/anilist-service.js';

(async () => {
  // Use advancedSearch with very specific queries
  const checks = [
    { q: 'Naruto', label: 'Naruto' },
    { q: 'Naruto Shippuden', label: 'NarutoShippuden' },
    { q: 'Jujutsu Kaisen', label: 'JJK' },
    { q: 'One Piece', label: 'OnePiece' },
  ];

  for (const c of checks) {
    try {
      const r = await anilistService.advancedSearch({
        search: c.q, sort: ['SEARCH_MATCH'], perPage: 5, page: 1,
      });
      const titles = (r.results || []).map(x => {
        const t = (x as any).title || {};
        const id = (x as any).id;
        return `${id}: ${t.english || t.romaji || '?'}`;
      });
      console.log(`${c.label}: ${titles.join(' | ')}`);
    } catch (e: any) {
      console.log(`${c.label}: ERR ${e.message}`);
    }
  }
})();
