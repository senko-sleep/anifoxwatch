import { describe, expect, it, vi } from 'vitest';
import { AnimeKaiSource } from '../src/sources/animekai-source.js';

describe('AnimeKaiSource stream episode id handling', () => {
    it('uses native AnimeKai compound episode ids directly for dub server lookup', async () => {
        const source = new AnimeKaiSource();
        const fetchAnimeInfo = vi.fn();
        const fetchEpisodeServers = vi.fn().mockResolvedValue([
            { name: 'megaup', url: 'https://animekai.to/iframe/token' },
        ]);

        (source as any).provider = { fetchAnimeInfo, fetchEpisodeServers };
        vi.spyOn(source as any, 'extractMegaupStream').mockResolvedValue([
            { url: 'https://cdn.example/video.m3u8', quality: 'auto', isM3U8: true },
        ]);

        const episodeId = 'animekai-spy-x-family-season-3-v2q8$ep=2$token=abc123';
        const result = await source.getStreamingLinks(episodeId, undefined, 'dub', {
            timeout: 1000,
            episodeNum: 2,
        });

        expect(result.sources).toHaveLength(1);
        expect(fetchAnimeInfo).not.toHaveBeenCalled();
        expect(fetchEpisodeServers).toHaveBeenCalledTimes(1);
        expect(fetchEpisodeServers.mock.calls[0][0]).toBe('spy-x-family-season-3-v2q8$ep=2$token=abc123');
    });
});
