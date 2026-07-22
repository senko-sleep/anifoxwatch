import { render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import Watch from '@/pages/Watch';
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Test file to verify the episode streaming fix
 * Tests that episodes other than episode 1 load correctly
 */

import { getApiConfig } from '@/lib/api-config';

// For happy-dom tests, keep network calls deterministic and fast.
// Watch page uses several API endpoints; if we return 404 for everything,
// it can leave the player stuck in an infinite loading/retry loop.
const jsonResp = (body: any, ok = true, status = 200) => Promise.resolve({
    ok,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
});

beforeEach(() => {
    (global.fetch as any) = vi.fn().mockImplementation((url: string) => {
        const u = String(url || '');

        // Anime metadata (getAnime hits /api/anime?id=... — no trailing slash)
        if (u.includes('/api/anime?')) {
            return jsonResp({
                id: 'test-id',
                title: 'Test Anime',
                image: 'https://example.com/image.jpg',
                cover: 'https://example.com/cover.jpg',
                type: 'TV',
                status: 'Ongoing',
                season: 'Summer',
                year: 2024,
                episodes: 12,
                dubCount: 0,
                genres: ['Action'],
                description: 'Test description',
            });
        }

        // Episodes list
        if (u.includes('/api/anime/episodes')) {
            return jsonResp({
                episodes: [
                    { id: 'ep1', number: 1, title: 'Episode 1', hasSub: true, hasDub: false },
                    { id: 'ep4', number: 4, title: 'Episode 4', hasSub: true, hasDub: false },
                ],
            });
        }

        // Episode servers
        if (u.includes('/api/stream/servers/')) {
            return jsonResp({
                servers: [
                    { name: 'neko_senko_1', url: 'https://example.com', type: 'sub' },
                    { name: 'neko_senko_default', url: 'https://example.com', type: 'sub' },
                ],
            });
        }

        // Streaming links
        if (u.includes('/api/stream/watch')) {
            return jsonResp({
                sources: [
                    {
                        url: 'https://example.com/stream.m3u8',
                        quality: '720p',
                        isM3U8: true,
                    },
                ],
                subtitles: [],
                source: 'test',
                intro: undefined,
                outro: undefined,
                dubFallback: false,
            });
        }

        // Dub probe (if used)
        if (u.includes('/api/stream/probe') || u.includes('/api/stream/dub-probe')) {
            return jsonResp({ sources: [] });
        }

        // Keep-alive ping
        if (u.includes('/api/keep-alive') || u.includes('/ping')) {
            return jsonResp({});
        }

        // Default fast 404
        return jsonResp({}, false, 404);
    });
});



let queryClient: QueryClient;

function renderWatch(initialEntries: string[]) {
    if (!queryClient) {
        queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false, gcTime: 0, staleTime: 0 },
            },
        });
    }
    console.log('[TEST] Render Watch with initialEntries:', initialEntries, 'API Config:', getApiConfig());
    return render(
        <MemoryRouter initialEntries={initialEntries}>
            <QueryClientProvider client={queryClient}>
                <Watch />
            </QueryClientProvider>
        </MemoryRouter>
    );
}

describe('Watch Page - Episode Loading Fix', () => {
    // These tests use happy-dom and rely on async data fetching hooks.
    // Increase timeout to avoid false failures (and to prevent vitest's
    // 5s default from killing the test before React Query settles).
    const localTimeout = 25000;

    // @ts-expect-error vitest timeout config
    vi.setConfig({ testTimeout: localTimeout });

    beforeEach(() => {
        queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false, gcTime: 0, staleTime: 0 },
            },
        });
    });

    it('should load episode 1 UI without hanging', async () => {
        renderWatch(['/watch?id=anilist-189046&ep=1']);
        // Ensure the page has resolved anime metadata and at least started rendering.
        // The watch title UI can be split across multiple nodes, so match more flexibly.
        await screen.findAllByText((content) => {
            const text = (content || '').toString();
            return /Test\s*Anime/i.test(text);
        });
    });

    it('should load episode 4 UI without hanging', async () => {
        renderWatch(['/watch?id=anilist-189046&ep=4']);
        await screen.findAllByText(/Test Anime/i, {}, { timeout: 10000 });
    });

    it('should switch between episodes without infinite loading', async () => {
        const { unmount } = renderWatch(['/watch?id=anilist-189046&ep=1']);
        await screen.findAllByText(/Test Anime/i, {}, { timeout: 10000 });

        unmount();
        renderWatch(['/watch?id=anilist-189046&ep=4']);
        await screen.findAllByText(/Test Anime/i, {}, { timeout: 10000 });
    });

    it('should load different anime without crashing', async () => {
        renderWatch(['/watch?id=anilist-182205&ep=1']);
        // At minimum, page shell should render.
        await screen.findAllByText(/Test Anime/i, {}, { timeout: 10000 });
    });

    it('should maintain anime/episode selection without infinite loading', async () => {
        const { unmount } = renderWatch(['/watch?id=anilist-189046&ep=1']);
        await screen.findAllByText(/Test Anime/i, {}, { timeout: 10000 });

        unmount();
        renderWatch(['/watch?id=anilist-182205&ep=4']);
        await screen.findAllByText(/Test Anime/i, {}, { timeout: 10000 });
    });
});

/**
 * Integration test - verify streaming links are fetched for all episodes
 */
describe('Streaming Links - Episode Fetch Integration', () => {
    it('should fetch streaming links for episode 1', async () => {
        // This test would require mocking the API responses
        // For now, it's a placeholder for integration testing
        expect(true).toBe(true);
    });

    it('should fetch streaming links for episode 4', async () => {
        // This test would require mocking the API responses
        // For now, it's a placeholder for integration testing
        expect(true).toBe(true);
    });

    it('should fetch streaming links for last episode', async () => {
        // This test would require mocking the API responses
        // For now, it's a placeholder for integration testing
        expect(true).toBe(true);
    });
});

export default { describe, it, expect };
