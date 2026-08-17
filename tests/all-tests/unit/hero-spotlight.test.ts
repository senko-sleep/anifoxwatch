import { describe, it, expect } from 'vitest';
import {
  getStaticFallbackHeroAnime,
  convertAnimeListToHeroAnime,
  getHeroTitle,
  formatHeroRating,
  getFormatLabel,
  getSeasonLabel,
  fetchHeroAnime,
  STATIC_FALLBACK_HERO_ANIME,
} from '@/hooks/useHeroAnimeMultiSource';
import type { Anime } from '@/types/anime';

describe('Hero Spotlight Logic & Fallbacks', () => {
  it('should have a rich static fallback dataset', () => {
    const list = getStaticFallbackHeroAnime();
    expect(list.length).toBeGreaterThanOrEqual(4);
    for (const anime of list) {
      expect(anime.id).toBeDefined();
      expect(anime.title).toBeDefined();
      expect(getHeroTitle(anime)).toBeTruthy();
      expect(anime.coverImage?.extraLarge || anime.bannerImage).toBeTruthy();
    }
  });

  it('should format title correctly with english and romaji fallbacks', () => {
    const animeWithEnglish = {
      ...STATIC_FALLBACK_HERO_ANIME[0],
      title: { english: 'Solo Leveling', romaji: 'Ore dake Level Up na Ken', native: null },
    };
    expect(getHeroTitle(animeWithEnglish)).toBe('Solo Leveling');

    const animeWithoutEnglish = {
      ...STATIC_FALLBACK_HERO_ANIME[0],
      title: { english: null, romaji: 'Ore dake Level Up na Ken', native: null },
    };
    expect(getHeroTitle(animeWithoutEnglish)).toBe('Ore dake Level Up na Ken');
  });

  it('should format ratings and season labels properly', () => {
    expect(formatHeroRating(85)).toBe('8.5');
    expect(formatHeroRating(null)).toBeNull();
    expect(formatHeroRating(0)).toBeNull();

    expect(getFormatLabel('TV')).toBe('TV Series');
    expect(getFormatLabel('MOVIE')).toBe('Movie');

    expect(getSeasonLabel('WINTER', 2024)).toBe('Winter 2024');
    expect(getSeasonLabel(null, 2024)).toBe('2024');
  });

  it('should convert an Anime list to HeroAnime objects correctly', () => {
    const mockAnimeList: Anime[] = [
      {
        id: 'anilist-151807',
        title: 'Solo Leveling',
        titleEnglish: 'Solo Leveling',
        titleRomaji: 'Ore dake Level Up na Ken',
        image: 'https://example.com/cover.jpg',
        banner: 'https://example.com/banner.jpg',
        description: 'Hunter story',
        genres: ['Action', 'Fantasy'],
        rating: 8.4,
        type: 'TV',
        status: 'Ongoing',
        year: 2024,
        season: 'Winter',
        episodes: 12,
        source: 'anilist',
      },
    ];

    const heroConverted = convertAnimeListToHeroAnime(mockAnimeList);
    expect(heroConverted.length).toBe(1);
    expect(heroConverted[0].id).toBe(151807);
    expect(heroConverted[0].title.english).toBe('Solo Leveling');
    expect(heroConverted[0].bannerImage).toBe('https://example.com/banner.jpg');
    expect(heroConverted[0].coverImage.extraLarge).toBe('https://example.com/cover.jpg');
    expect(heroConverted[0].averageScore).toBe(84);
  });

  it('should always return fallback items if remote fetches fail', async () => {
    const results = await fetchHeroAnime();
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  }, 15000);
});
