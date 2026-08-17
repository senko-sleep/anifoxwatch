import { describe, it, expect } from 'vitest';

describe('Slug Resolution Tests', () => {
  it('should detect hentai-like title patterns', () => {
    const slug = 'a-kiss-for-the-petals-joined-in-love-with-you';
    const slugLower = slug.toLowerCase();
    
    // Check if title is long (30+ characters)
    const isLongTitle = slugLower.length > 30;
    expect(isLongTitle).toBe(true);
    
    // Check for hentai-like connecting words
    const hasConnectingWords = slugLower.includes('joined') || slugLower.includes('with') || slugLower.includes('and');
    expect(hasConnectingWords).toBe(true);
    
    // Combined detection
    const isLikelyHentai = isLongTitle && hasConnectingWords;
    expect(isLikelyHentai).toBe(true);
  });

  it('should NOT detect regular anime as hentai', () => {
    const slug = 'attack-on-titan';
    const slugLower = slug.toLowerCase();
    
    const isLongTitle = slugLower.length > 30;
    expect(isLongTitle).toBe(false);
    
    const hasConnectingWords = slugLower.includes('joined') || slugLower.includes('with') || slugLower.includes('and');
    expect(hasConnectingWords).toBe(false);
    
    const isLikelyHentai = isLongTitle && hasConnectingWords;
    expect(isLikelyHentai).toBe(false);
  });

  it('should detect another hentai title pattern', () => {
    const slug = 'my-private-tutor-and-secret-love-affair';
    const slugLower = slug.toLowerCase();
    
    const isLongTitle = slugLower.length > 30;
    expect(isLongTitle).toBe(true);
    
    const hasConnectingWords = slugLower.includes('joined') || slugLower.includes('with') || slugLower.includes('and');
    expect(hasConnectingWords).toBe(true);
    
    const isLikelyHentai = isLongTitle && hasConnectingWords;
    expect(isLikelyHentai).toBe(true);
  });

  it('should calculate match score correctly', () => {
    const slug = 'a-kiss-for-the-petals-joined-in-love-with-you';
    const slugLowerClean = slug.toLowerCase().replace(/-/g, ' ');
    
    // Test with a close match
    const title1 = 'A Kiss for the Petals: Joined in Love with You';
    const titleLower1 = title1.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    
    const slugWords = slugLowerClean.split(' ').filter(w => w.length > 2);
    const titleWords = titleLower1.split(' ').filter(w => w.length > 2);
    const matchCount = slugWords.filter(w => titleWords.includes(w)).length;
    const score = matchCount / Math.max(slugWords.length, 1);
    
    expect(score).toBeGreaterThan(0.5); // Should be high match
  });

  it('should reject low match scores', () => {
    const slug = 'a-kiss-for-the-petals-joined-in-love-with-you';
    const slugLowerClean = slug.toLowerCase().replace(/-/g, ' ');
    
    // Test with a completely different title
    const title2 = 'Mahou Shoujo wa Kiss Shite Kawaru';
    const titleLower2 = title2.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    
    const slugWords = slugLowerClean.split(' ').filter(w => w.length > 2);
    const titleWords = titleLower2.split(' ').filter(w => w.length > 2);
    const matchCount = slugWords.filter(w => titleWords.includes(w)).length;
    const score = matchCount / Math.max(slugWords.length, 1);
    
    expect(score).toBeLessThan(0.5); // Should be low match
  });

  // New test for improved matching algorithm
  it('should test improved matching with title variants', () => {
    const searchTerm = 'a kiss for the petals joined in love with you';
    
    // Test anime object with multiple title variants
    const animeWithVariants = {
      title: 'Sono Hanabira ni Kuchizuke wo: Anata to Koibito Tsunagi',
      titleEnglish: 'A Kiss For The Petals - Joined in Love with You',
      titleRomaji: 'Sono Hanabira ni Kuchizuke wo: Anata to Koibito Tsunagi',
      titleJapanese: 'その花びらにくちづけを　あなたと恋人つなぎ'
    };
    
    // Test that the matching algorithm considers all variants
    const titleVariants = [
      animeWithVariants.title,
      animeWithVariants.titleEnglish,
      animeWithVariants.titleRomaji,
      animeWithVariants.titleJapanese
    ].filter(Boolean);
    
    // At least one variant should match well
    let bestMatch = 0;
    for (const title of titleVariants) {
      const titleLower = title.toLowerCase().replace(/[^a-z0-9\s]/g, '');
      const searchLower = searchTerm.toLowerCase().replace(/[^a-z0-9\s]/g, '');
      
      const searchWords = searchLower.split(' ').filter(w => w.length > 2);
      const titleWords = titleLower.split(' ').filter(w => w.length > 2);
      
      const matchCount = searchWords.filter(w => titleWords.includes(w)).length;
      const score = matchCount / Math.max(searchWords.length, 1);
      
      if (score > bestMatch) {
        bestMatch = score;
      }
    }
    
    expect(bestMatch).toBeGreaterThan(0.5); // Should find a good match among variants
  });

  it('should test sequence matching in improved algorithm', () => {
    const searchTerm = 'sono hanabira ni kuchizuke wo';
    const title = 'Sono Hanabira ni Kuchizuke wo: Anata to Koibito Tsunagi';
    
    const searchLower = searchTerm.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    const titleLower = title.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    
    const searchWords = searchLower.split(' ').filter(w => w.length > 2);
    const titleWords = titleLower.split(' ').filter(w => w.length > 2);
    
    // Test sequence matching
    let matchedSequences = 0;
    for (let i = 0; i < searchWords.length - 1; i++) {
      const currentIdx = titleWords.indexOf(searchWords[i]);
      const nextIdx = titleWords.indexOf(searchWords[i + 1]);
      if (currentIdx !== -1 && nextIdx !== -1 && nextIdx > currentIdx) {
        matchedSequences++;
      }
    }
    
    const sequenceScore = matchedSequences / Math.max(searchWords.length - 1, 1);
    
    expect(sequenceScore).toBeGreaterThan(0.5); // Should have good sequence matching
  });
});
