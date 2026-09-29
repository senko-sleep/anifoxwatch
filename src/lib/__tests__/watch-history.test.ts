// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { WatchHistory } from '../watch-history';
import type { Anime } from '@/types/anime';

const cat = { id: 'aniwaves-yani-neko-82684', title: 'Chainsmoker Cat', image: 'https://img/cat.jpg', season: 'summer' } as Anime;

describe('WatchHistory', () => {
  beforeEach(() => localStorage.clear());

  it('records an embed episode with no timestamp at 0% progress', () => {
    // What Watch.tsx saves when the source is a cross-origin iframe.
    WatchHistory.save(cat, '2', 2, 0, 0, undefined, false);
    const [entry] = WatchHistory.get();
    expect(entry.animeId).toBe(cat.id);
    expect(entry.episodeNumber).toBe(2);
    expect(entry.progress).toBe(0);
    expect(Number.isNaN(entry.progress)).toBe(false);
  });

  it('computes progress for native playback', () => {
    WatchHistory.save(cat, '3', 3, 600, 1440);
    expect(WatchHistory.get()[0].progress).toBeCloseTo(600 / 1440);
  });

  it('persists audio mode and retains it across later progress updates', () => {
    WatchHistory.save(cat, '3', 3, 600, 1440, undefined, false, 'dub');
    WatchHistory.save(cat, '3', 3, 660, 1440);
    expect(WatchHistory.get()[0].audioType).toBe('dub');
    expect(WatchHistory.get()[0].timestamp).toBe(660);
  });

  it('keeps one entry per anime, pointing at the latest episode', () => {
    WatchHistory.save(cat, '1', 1, 900, 1440);
    WatchHistory.save(cat, '2', 2, 0, 0);
    const history = WatchHistory.get();
    expect(history).toHaveLength(1);
    expect(history[0].episodeNumber).toBe(2);
  });

  it('does not lose a saved frame when an embed save has none', () => {
    WatchHistory.save(cat, '2', 2, 300, 1440, 'data:image/jpeg;base64,AAA');
    WatchHistory.save(cat, '2', 2, 0, 0, undefined);
    expect(WatchHistory.get()[0].frameThumbnail).toBe('data:image/jpeg;base64,AAA');
  });

  it('puts the most recent anime first', () => {
    WatchHistory.save(cat, '1', 1, 100, 1440);
    WatchHistory.save({ ...cat, id: 'other', title: 'Other' } as Anime, '1', 1, 100, 1440);
    expect(WatchHistory.get().map((h) => h.animeId)).toEqual(['other', cat.id]);
  });
});
