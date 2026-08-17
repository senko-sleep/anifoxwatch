import { describe, it, expect } from 'vitest';

describe('API Slug Resolution Integration Tests', () => {
  it('should resolve hentai slug to correct anime', async () => {
    const slug = 'a-kiss-for-the-petals-joined-in-love-with-you';
    const apiUrl = 'http://localhost:3001';
    
    try {
      // Use adult mode explicitly for hentai content
      const response = await fetch(`${apiUrl}/api/anime/resolve-slug?slug=${encodeURIComponent(slug)}&mode=adult`);
      const data = await response.json();
      
      console.log('Slug Resolution Result:', JSON.stringify(data, null, 2));
      
      // Check if we got a result
      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('title');
      
      // The improved matching algorithm should find hentai content
      if (data.title) {
        console.log('Resolved title:', data.title);
        console.log('Resolved ID:', data.id);
        console.log('Source:', data.source);
        
        // Should be from watchhentai OR have "kiss" in the title (good match)
        const isFromWatchHentai = data.id.includes('watchhentai') || data.source === 'WatchHentai';
        const hasKissInTitle = data.title.toLowerCase().includes('kiss');
        
        expect(isFromWatchHentai || hasKissInTitle).toBe(true);
      }
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  });

  it('should resolve slug in adult mode', async () => {
    const slug = 'a-kiss-for-the-petals-joined-in-love-with-you';
    const apiUrl = 'http://localhost:3001';
    
    try {
      const response = await fetch(`${apiUrl}/api/anime/resolve-slug?slug=${encodeURIComponent(slug)}&mode=adult`);
      const data = await response.json();
      
      console.log('Adult Mode Result:', JSON.stringify(data, null, 2));
      
      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('title');
      
      // In adult mode, it should find hentai content
      if (data.title) {
        console.log('Adult mode resolved title:', data.title);
        console.log('Adult mode source:', data.source);
      }
    } catch (error) {
      console.error('Adult Mode API Error:', error);
      throw error;
    }
  });

  it('should resolve regular anime slug correctly', { timeout: 15000 }, async () => {
    const slug = 'attack-on-titan';
    const apiUrl = 'http://localhost:3001';
    
    try {
      const response = await fetch(`${apiUrl}/api/anime/resolve-slug?slug=${encodeURIComponent(slug)}&mode=safe`);
      const data = await response.json();
      
      console.log('Regular Anime Result:', JSON.stringify(data, null, 2));
      
      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('title');
      
      // Should find Attack on Titan or similar
      if (data.title) {
        console.log('Regular anime resolved title:', data.title);
        expect(data.title.toLowerCase()).toContain('attack');
      }
    } catch (error) {
      console.error('Regular Anime API Error:', error);
      throw error;
    }
  });
});
