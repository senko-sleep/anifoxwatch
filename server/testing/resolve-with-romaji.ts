import { anilistService } from '../src/services/anilist-service.js';

(async () => {
  // Fetch full media for the IDs we found — including romaji
  const IDS = [
    20, 1735,     // Naruto / Naruto Shippuden from search ranking
    10075, 936,   // other Naruto hits
    113415,       // JJK first result
    101922,       // Demon Slayer
    21,           // One Piece
  ];

  // Use the internal query to also pull romaji
  const ids = IDS.join(',');
  const query = `
  query($ids: [Int]) {
    Page(perPage: 20) {
      media(id_in: $ids, type: ANIME) {
        id
        title { english romaji native }
        episodes
        format
      }
    }
  }`;
  const resp: any = await (anilistService as any).query(query, { ids: IDS });
  const media = resp?.data?.Page?.media || [];
  for (const m of media) {
    console.log(`${m.id}: "${m.title?.english || m.title?.romaji}" [romaji="${m.title?.romaji}"] eps=${m.episodes} fmt=${m.format}`);
  }
})();
