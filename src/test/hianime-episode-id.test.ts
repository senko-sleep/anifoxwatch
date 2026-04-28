import { describe, expect, it } from 'vitest';
import { getCatalogEpisodeFromTokenCompound, normalizeAnimeEpisodeIdForHianimeRest } from '@/lib/hianime-episode-id';

describe('normalizeAnimeEpisodeIdForHianimeRest', () => {
    it('maps Miruro token episode ids to aniwatch query form', () => {
        const raw = 'some-slug$ep=1$token=AbC-123_x';
        expect(normalizeAnimeEpisodeIdForHianimeRest(raw)).toBe('some-slug?ep=AbC-123_x');
    });

    it('maps simple $ep=N ids', () => {
        const raw = 'some-slug$ep=12';
        expect(normalizeAnimeEpisodeIdForHianimeRest(raw)).toBe('some-slug?ep=12');
    });

    it('strips kaido/miruro prefixes before mapping', () => {
        const raw = 'kaido-some-slug$ep=2$token=ZZ';
        expect(normalizeAnimeEpisodeIdForHianimeRest(raw)).toBe('some-slug?ep=ZZ');
    });

    it('extracts catalog episode from token compound form', () => {
        expect(getCatalogEpisodeFromTokenCompound('show$ep=12$token=AbC')).toBe(12);
        expect(getCatalogEpisodeFromTokenCompound('show?ep=12')).toBeUndefined();
    });
});
