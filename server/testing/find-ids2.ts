import { anilistService } from '../src/services/anilist-service.js';

(async () => {
  const entries = ['Naruto Shippuden', 'Naruto', 'Jujutsu Kaisen', 'One Piece', 'Bleach'];

  for (const q of entries) {
    const r = await anilistService.advancedSearch({
      search: q, sort: ['SEARCH_MATCH'], perPage: 3, page: 1,
    });
    const titles = (r.results || []).map(x => {
      const t = (x as any);
      // anilist-service returns AnimeBase with `title` as a plain string
      return `${t.id}: "${t.title}" sub=${t.subCount ?? '?'} dub=${t.dubCount ?? '?'}`;
    });
    console.log(`${q}: ${titles.join(' \\ ')}`);
  }
})();
