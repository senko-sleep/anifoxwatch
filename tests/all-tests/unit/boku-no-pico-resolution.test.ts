import { describe, it, expect } from 'vitest';

describe('Boku no Pico Hentai Resolution - Dynamic API System', () => {
    it('should resolve boku-no-pico slug to WatchHentai source using dynamic hentai resolver', { timeout: 15000 }, async () => {
        const slug = 'boku-no-pico';
        const apiUrl = 'http://localhost:3001';
        
        try {
            // Test automatic hentai detection - no mode parameter needed now
            // Backend auto-detects hentai using fast local string matching
            const response = await fetch(`${apiUrl}/api/anime/resolve-slug?slug=${encodeURIComponent(slug)}`);
            const data = await response.json();
            
            console.log('Boku no Pico Resolution Result:', JSON.stringify(data, null, 2));
            
            // Check if we got a result
            expect(data).toHaveProperty('id');
            expect(data).toHaveProperty('title');
            
            // Should be from watchhentai (via dynamic resolution)
            if (data.title) {
                console.log('Resolved title:', data.title);
                console.log('Resolved ID:', data.id);
                console.log('Source:', data.source);
                
                // Should be from watchhentai or similar adult source
                expect(data.id.includes('watchhentai') || data.source === 'WatchHentai').toBe(true);
                expect(data.title.toLowerCase()).toContain('boku');
                expect(data.title.toLowerCase()).toContain('pico');
            }
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    });

    it('should get all variants of boku no pico name from sources dynamically', { timeout: 15000 }, async () => {
        const apiUrl = 'http://localhost:3001';
        
        try {
            // Search in adult mode for boku no pico
            const response = await fetch(`${apiUrl}/api/anime/search?q=boku%20no%20pico&page=1&mode=adult`);
            const data = await response.json();
            
            console.log('Search Results:', JSON.stringify(data, null, 2));
            
            // Check if we got results
            expect(data).toHaveProperty('results');
            expect(Array.isArray(data.results)).toBe(true);
            
            if (data.results.length > 0) {
                console.log('Found', data.results.length, 'results');
                data.results.forEach((result: any, index: number) => {
                    console.log(`Result ${index + 1}:`, {
                        id: result.id,
                        title: result.title,
                        source: result.source
                    });
                });
                
                // Should have at least one result from WatchHentai
                const watchHentaiResults = data.results.filter((r: any) => 
                    r.id?.includes('watchhentai') || r.source === 'WatchHentai'
                );
                console.log('WatchHentai results:', watchHentaiResults.length);
                expect(watchHentaiResults.length).toBeGreaterThan(0);
                
                // First result should be Boku no Pico
                const firstResult = data.results[0];
                expect(firstResult.title.toLowerCase()).toContain('boku');
                expect(firstResult.title.toLowerCase()).toContain('pico');
            }
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    });

    it('should test episode switching for hentai content', { timeout: 15000 }, async () => {
        const apiUrl = 'http://localhost:3001';
        
        try {
            // First resolve the slug to get the ID
            const resolveResponse = await fetch(`${apiUrl}/api/anime/resolve-slug?slug=boku-no-pico`);
            const resolveData = await resolveResponse.json();
            
            console.log('Resolved ID:', resolveData.id);
            
            // Get episodes for the resolved ID
            const episodesResponse = await fetch(`${apiUrl}/api/anime/episodes?id=${encodeURIComponent(resolveData.id)}`);
            const episodesData = await episodesResponse.json();
            
            console.log('Episodes:', JSON.stringify(episodesData, null, 2));
            
            // Check if we got episodes
            expect(episodesData).toHaveProperty('episodes');
            expect(Array.isArray(episodesData.episodes)).toBe(true);
            expect(episodesData.episodes.length).toBeGreaterThan(0);
            
            // Test that episodes have proper numbering for switching
            const episodes = episodesData.episodes;
            episodes.forEach((ep: any, index: number) => {
                console.log(`Episode ${index + 1}:`, {
                    id: ep.id,
                    number: ep.number,
                    title: ep.title
                });
                expect(ep.number).toBe(index + 1); // Should be sequentially numbered
            });
            
            // Note: Hentai content now generates only 1 episode (most hentai is single videos)
            // This prevents timeout issues with non-existent episode URLs
            console.log('Total episodes:', episodes.length);
            expect(episodes.length).toBeGreaterThanOrEqual(1);
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    });
});