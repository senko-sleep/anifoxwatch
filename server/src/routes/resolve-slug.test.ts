import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';

// The resolver's two outside dependencies: AniList (to verify an id) and the streaming
// sources (to search by name). Both are faked so each case controls exactly what they say.
const anilist = { getAnimeById: vi.fn(), searchByTitle: vi.fn(), searchAnime: vi.fn() };
const sources = { search: vi.fn(), getEpisodes: vi.fn(), searchAll: vi.fn() };
vi.mock('../services/anilist-service.js', () => ({ anilistService: anilist }));
vi.mock('../services/source-manager.js', () => ({ sourceManager: sources }));
vi.mock('../services/hero-spotlight-service.js', () => ({ getHeroSpotlightCached: vi.fn(), invalidateHeroSpotlightCache: vi.fn() }));

const { default: router } = await import('./anime.js');
const { searchCache } = await import('../lib/memory-cache.js');

let base = '';
let server: ReturnType<ReturnType<typeof express>['listen']>;
beforeAll(async () => {
    const app = express().use('/api/anime', router);
    server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
    server?.close();
});

const media = (id: number, title: string) => ({ id: `anilist-${id}`, title, titleEnglish: title, titleRomaji: title });
const hit = (id: string, title: string) => ({ id, title, image: '', source: 'Aniwaves' });
const resolve = async (slug: string) =>
    (await fetch(`${base}/api/anime/resolve-slug?slug=${slug}&mode=safe`)).json() as Promise<{ id: string; title: string }>;

// What Aniwaves' fuzzy search returns for these franchises: specials and sequels that share words.
const onePieceSearch = { results: [hit('aniwaves-one-piece-episode-of-merry-76087', 'One Piece: Episode of Merry'), hit('aniwaves-one-piece-100', 'One Piece')] };
const kaguyaSearch = { results: [hit('aniwaves-kaguya-sama-wa-kokurasetai-otona-e-no-kaidan-82436', 'Kaguya-sama: Love Is War -Stairway to Adulthood-')] };

beforeEach(() => {
    vi.resetAllMocks();
    searchCache.clear?.();
    sources.getEpisodes.mockResolvedValue([]);
    sources.searchAll?.mockResolvedValue({ results: [] });
    anilist.searchAnime.mockResolvedValue({ results: [] });
});

describe('resolve-slug', () => {
    it('reads a short AniList id (One Piece is 21) instead of fuzzy-matching a special', async () => {
        anilist.getAnimeById.mockResolvedValue(media(21, 'ONE PIECE'));
        sources.search.mockResolvedValue(onePieceSearch);
        expect((await resolve('one-piece-21')).id).toBe('anilist-21');
    });

    it('reads a long AniList id for one season of a franchise', async () => {
        anilist.getAnimeById.mockResolvedValue(media(140960, 'SPY x FAMILY'));
        sources.search.mockResolvedValue({ results: [hit('aniwaves-spy-x-family-season-3-82391', 'Spy x Family Season 3')] });
        expect((await resolve('spy-x-family-140960')).id).toBe('anilist-140960');
    });

    it('treats a number that is part of the title as the title, not an id', async () => {
        anilist.getAnimeById.mockResolvedValue(media(100, 'Prétear'));
        sources.search.mockResolvedValue({ results: [hit('aniwaves-mob-psycho-100-76660', 'Mob Psycho 100')] });
        sources.getEpisodes.mockResolvedValue([{ id: 'x' }]); // Aniwaves show #100 exists — must not win
        expect((await resolve('mob-psycho-100')).id).toBe('aniwaves-mob-psycho-100-76660');
    });

    it('trusts an AniList-shaped id when AniList is rate-limiting, instead of guessing by name', async () => {
        anilist.getAnimeById.mockRejectedValue(new Error('AniList rate limit exceeded after retries'));
        sources.search.mockResolvedValue(kaguyaSearch);
        expect((await resolve('kaguya-sama-love-is-war-112641')).id).toBe('anilist-112641');
    });

    it('caches a rate-limited guess for a minute, not an hour', async () => {
        const set = vi.spyOn(searchCache, 'set');
        anilist.getAnimeById.mockRejectedValue(new Error('AniList rate limit exceeded after retries'));
        sources.search.mockResolvedValue(onePieceSearch);
        await resolve('one-piece-21'); // short id + AniList down: whatever it finds is a guess
        expect(set).toHaveBeenCalled();
        for (const [, , ttl] of set.mock.calls) expect(ttl).toBeLessThanOrEqual(60_000);
    });
});
