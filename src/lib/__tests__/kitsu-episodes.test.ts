import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchKitsuEpisodeDetails } from '../kitsu-episodes';

describe('fetchKitsuEpisodeDetails', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('looks up source-based anime by its title and returns episode names and thumbnails', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/anime?filter[text]=Naruto')) {
        return new Response(JSON.stringify({
          data: [{ id: '1234', attributes: { canonicalTitle: 'Naruto' } }],
        }), { status: 200 });
      }
      if (url.includes('/anime/1234/episodes')) {
        return new Response(JSON.stringify({
          data: [{ attributes: {
            number: 1,
            canonicalTitle: 'Enter: The Land of Waves!',
            synopsis: 'A real episode synopsis.',
            airdate: '2002-10-03',
            thumbnail: { large: 'https://media.example/episode-1.jpg' },
          } }],
          meta: { count: 1 },
        }), { status: 200 });
      }
      throw new Error(`Unexpected Kitsu request: ${url}`);
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
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
