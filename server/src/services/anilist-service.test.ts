import { describe, expect, it, vi } from 'vitest';
import { AniListService } from './anilist-service.js';

type Media = { id: number; format: string; popularity: number; title: { english?: string; romaji?: string; native?: string }; synonyms?: string[] };

/** Run searchByTitle against a canned AniList page, in AniList's own (relevance) order. */
async function pick(title: string, media: Media[]) {
    const svc = new AniListService();
    const full = media.map((m) => ({ genres: [], tags: [], studios: { nodes: [] }, coverImage: { large: 'x', medium: 'x' }, startDate: {}, endDate: {}, ...m }));
    vi.spyOn(svc as any, 'query').mockResolvedValue({ data: { Page: { media: full } } });
    return svc.searchByTitle(title);
}

// What AniList actually returns for "Your Name." — the commercial ranks first.
const yourNameResults: Media[] = [
    { id: 97962, format: 'CM', popularity: 900, title: { english: 'Your Name.', romaji: 'Kimi no Na wa. x Suntory' } },
    { id: 21519, format: 'MOVIE', popularity: 800000, title: { english: 'Your Name.', romaji: 'Kimi no Na wa.' } },
];

describe('AniListService.searchByTitle', () => {
    it('skips a commercial tie-in for the real movie', async () => {
        expect((await pick('Your Name.', yourNameResults))?.id).toBe('anilist-21519');
    });

    it('ignores punctuation when matching titles', async () => {
        expect((await pick('your name', yourNameResults))?.id).toBe('anilist-21519');
    });

    it('prefers an exact title over a more popular near-match', async () => {
        const media: Media[] = [
            { id: 1, format: 'TV', popularity: 500000, title: { english: 'Frieren: Beyond Journey\'s End Season 2' } },
            { id: 2, format: 'TV', popularity: 300000, title: { english: 'Frieren: Beyond Journey\'s End' } },
        ];
        expect((await pick('Frieren: Beyond Journey\'s End', media))?.id).toBe('anilist-2');
    });

    it('matches on synonyms', async () => {
        const media: Media[] = [
            { id: 1, format: 'TV', popularity: 1000, title: { english: 'Something Else' } },
            { id: 2, format: 'TV', popularity: 10, title: { romaji: 'Yani Neko' }, synonyms: ['Chainsmoker Cat'] },
        ];
        expect((await pick('Chainsmoker Cat', media))?.id).toBe('anilist-2');
    });

    it('breaks ties on popularity', async () => {
        const media: Media[] = [
            { id: 1, format: 'TV', popularity: 50, title: { english: 'Obscure' } },
            { id: 2, format: 'TV', popularity: 90000, title: { english: 'Famous' } },
        ];
        expect((await pick('no exact match', media))?.id).toBe('anilist-2');
    });

    it('still returns a promo entry when it is the only result', async () => {
        const media: Media[] = [{ id: 5, format: 'PV', popularity: 1, title: { english: 'Trailer' } }];
        expect((await pick('Trailer', media))?.id).toBe('anilist-5');
    });

    it('returns null when AniList has nothing', async () => {
        expect(await pick('nothing', [])).toBeNull();
    });
});
