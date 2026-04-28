import { describe, expect, it } from 'vitest';
import { reconstructAnimeKaiCompoundFromWatchUrl } from '../src/utils/animekai-compound-from-watch.js';

describe('reconstructAnimeKaiCompoundFromWatchUrl', () => {
    it('rebuilds compound id from watch URL + catalog ep when ep is a token', () => {
        expect(
            reconstructAnimeKaiCompoundFromWatchUrl('show-slug-wvg?ep=M4Dwp-D440ig', 1)
        ).toBe('show-slug-wvg$ep=1$token=M4Dwp-D440ig');
    });

    it('returns null when ?ep= is display digits only (not a token)', () => {
        expect(reconstructAnimeKaiCompoundFromWatchUrl('show?ep=1', 1)).toBeNull();
    });

    it('returns null for invalid catalog episode', () => {
        expect(reconstructAnimeKaiCompoundFromWatchUrl('show?ep=abc', 0)).toBeNull();
    });

    it('returns null when not a watch-shaped id', () => {
        expect(reconstructAnimeKaiCompoundFromWatchUrl('show-only', 1)).toBeNull();
    });
});
