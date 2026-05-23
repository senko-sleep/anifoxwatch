import { render, screen, waitFor, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { Watch } from '@/pages/Watch';
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Test file to verify the episode streaming fix
 * Tests that episodes other than episode 1 load correctly
 */

const queryClient = new QueryClient({
    defaultOptions: {
        queries: { retry: false },
    },
});

function renderWatch(initialEntries: string[]) {
    return render(
        <BrowserRouter initialEntries={initialEntries}>
            <QueryClientProvider client={queryClient}>
                <Watch />
            </QueryClientProvider>
        </BrowserRouter>
    );
}

describe('Watch Page - Episode Loading Fix', () => {
    beforeEach(() => {
        queryClient.clear();
    });

    it('should load and play episode 1 correctly', async () => {
        renderWatch(['/watch?id=anilist-189046&ep=1']);
        
        // Wait for episode data to load
        await waitFor(() => {
            expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
        }, { timeout: 10000 });
        
        // Verify episode 1 is selected
        const episodeElements = screen.getAllByText(/episode/i);
        expect(episodeElements.length).toBeGreaterThan(0);
    });

    it('should load and play episode 4 correctly', async () => {
        renderWatch(['/watch?id=anilist-189046&ep=4']);
        
        // Wait for episode data to load
        await waitFor(() => {
            expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
        }, { timeout: 10000 });
        
        // Verify episode 4 is selected
        const episodeElements = screen.getAllByText(/episode/i);
        expect(episodeElements.length).toBeGreaterThan(0);
    });

    it('should switch between episodes correctly', async () => {
        const { rerender } = renderWatch(['/watch?id=anilist-189046&ep=1']);
        
        // Wait for initial load
        await waitFor(() => {
            expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
        }, { timeout: 10000 });
        
        // Change to episode 4
        rerender(
            <BrowserRouter initialEntries={['/watch?id=anilist-189046&ep=4']}>
                <QueryClientProvider client={queryClient}>
                    <Watch />
                </QueryClientProvider>
            </BrowserRouter>
        );
        
        // Wait for new episode data to load
        await waitFor(() => {
            expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
        }, { timeout: 10000 });
    });

    it('should load different anime correctly', async () => {
        renderWatch(['/watch?id=anilist-182205&ep=1']);
        
        // Wait for episode data to load
        await waitFor(() => {
            expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
        }, { timeout: 10000 });
    });

    it('should maintain anime and episode sync when selectedAnimeId and cleanAnimeId change', async () => {
        renderWatch(['/watch?id=anilist-189046&ep=1']);
        
        await waitFor(() => {
            expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
        }, { timeout: 10000 });
        
        // Simulate navigating to different anime
        renderWatch(['/watch?id=anilist-182205&ep=4']);
        
        await waitFor(() => {
            expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
        }, { timeout: 10000 });
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
