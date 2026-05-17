import { anilistService } from '../src/services/anilist-service.js';

(async () => {
  // Use AniList advancedSearch to find correct IDs
  const entries = [
    { label: 'Naruto', q: 'Naruto' },
    { label: 'NarutoShippuden', q: 'Naruto Shippuden' },
    { label: 'JJK', q: 'Jujutsu Kaisen' },
    { label: 'DemonSlayer', q: 'Kimetsu no Yaiba' },
    { label: 'OnePiece', q: 'One Piece' },
  ];

  for (const e of entries) {
    try {
      const r = await anilistService.advancedSearch({ search: e.q, sort: ['SEARCH_MATCH'], perPage: 5, page: 1 });
      const top = (r.results || []).slice(0, 3).map(x => `${(x as any).id}`).join(', ');
      console.log(`${e.label}: ids=[${top}]`);
    } catch (err: any) {
      console.log(`${e.label}: ERROR ${err.message}`);
    }
  }
})();
