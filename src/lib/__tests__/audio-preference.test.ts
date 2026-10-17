// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { preferredAudioType, rememberAudioPreference } from '@/lib/audio-preference';

describe('audio preference', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to SUB, not sticky, with nothing remembered', () => {
    expect(preferredAudioType('anilist-1', null)).toEqual({ audioType: 'sub', sticky: false });
  });

  it('remembers the language per anime', () => {
    rememberAudioPreference('anilist-1', 'dub');
    rememberAudioPreference('anilist-2', 'sub');
    expect(preferredAudioType('anilist-1', null)).toEqual({ audioType: 'dub', sticky: true });
    expect(preferredAudioType('anilist-2', null)).toEqual({ audioType: 'sub', sticky: true });
  });

  it('an explicit ?lang= wins over the remembered choice', () => {
    rememberAudioPreference('anilist-1', 'dub');
    expect(preferredAudioType('anilist-1', 'sub')).toEqual({ audioType: 'sub', sticky: true });
  });

  it('falls back to the watch-history language for the anime', () => {
    expect(preferredAudioType('anilist-1', null, 'dub')).toEqual({ audioType: 'dub', sticky: true });
  });

  it('a new anime starts in the last chosen language but may still fall back to SUB', () => {
    rememberAudioPreference('anilist-1', 'dub');
    expect(preferredAudioType('anilist-99', null)).toEqual({ audioType: 'dub', sticky: false });
  });

  it('survives corrupt storage', () => {
    localStorage.setItem('audio-preference', '{not json');
    expect(preferredAudioType('anilist-1', null)).toEqual({ audioType: 'sub', sticky: false });
    rememberAudioPreference('anilist-1', 'dub');
    expect(preferredAudioType('anilist-1', null).audioType).toBe('dub');
  });
});
