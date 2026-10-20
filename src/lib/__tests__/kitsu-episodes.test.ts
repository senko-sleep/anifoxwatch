import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchKitsuEpisodeDetails } from '../kitsu-episodes';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('fetchKitsuEpisodeDetails', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('looks up source-based anime by its title and returns episode names and thumbnails', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/anime?filter[text]=Naruto')) {
        return json({ data: [{ id: '1234', attributes: { canonicalTitle: 'Naruto' } }] });
      }
      if (url.includes('/anime/1234/episodes')) {
        return json({
          data: [{ attributes: {
            number: 1,
            canonicalTitle: 'Enter: The Land of Waves!',
            synopsis: 'A real episode synopsis.',
            airdate: '2002-10-03',
            thumbnail: { large: 'https://media.example/episode-1.jpg' },
          } }],
          meta: { count: 1 },
        });
      }
      if (url.includes('api.ani.zip/mappings?kitsu_id=1234')) return json('Not Found', 404);
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const details = await fetchKitsuEpisodeDetails('aniwaves-naruto-76396', 'Naruto');

    expect(details).toEqual([{
      number: 1,
      title: 'Enter: The Land of Waves!',
      synopsis: 'A real episode synopsis.',
      thumbnail: 'https://media.example/episode-1.jpg',
      airdate: '2002-10-03',
    }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('fills episodes Kitsu lists without stills from ani.zip (Buddy Daddies)', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/mappings?filter[externalSite]=anilist/anime&filter[externalId]=155907')) {
        return json({ data: [{ relationships: { item: { data: { id: '46650', type: 'anime' } } } }] });
      }
      if (url.includes('/anime/46650/episodes')) {
        return json({
          data: [1, 2].map((number) => ({ attributes: {
            number, canonicalTitle: null, synopsis: null, airdate: null, thumbnail: null,
          } })),
          meta: { count: 2 },
        });
      }
      if (url.includes('api.ani.zip/mappings?anilist_id=155907')) {
        return json({ episodes: {
          1: { title: { en: 'Piece of Cake' }, overview: 'Kazuki and Rei take a job.', image: 'https://artworks.thetvdb.com/e1.jpg', airDate: '2023-01-06' },
          2: { title: { en: 'The Kiss of Death' }, summary: 'A new job.\nSource: crunchyroll', image: 'https://artworks.thetvdb.com/e2.jpg' },
          S1: { title: { en: 'Special' }, image: 'https://artworks.thetvdb.com/s1.jpg' },
        } });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    const details = await fetchKitsuEpisodeDetails('anilist-155907');

    expect(details).toEqual([
      { number: 1, title: 'Piece of Cake', synopsis: 'Kazuki and Rei take a job.', thumbnail: 'https://artworks.thetvdb.com/e1.jpg', airdate: '2023-01-06' },
      { number: 2, title: 'The Kiss of Death', synopsis: 'A new job.', thumbnail: 'https://artworks.thetvdb.com/e2.jpg' },
    ]);
  });

  it('still returns stills when Kitsu is down', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('kitsu.io')) return json({ errors: [] }, 503);
      if (url.includes('api.ani.zip/mappings?anilist_id=21')) {
        return json({ episodes: { 1: { image: 'https://artworks.thetvdb.com/op1.jpg' } } });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    expect(await fetchKitsuEpisodeDetails('anilist-21')).toEqual([
      { number: 1, thumbnail: 'https://artworks.thetvdb.com/op1.jpg' },
    ]);
  });
});
