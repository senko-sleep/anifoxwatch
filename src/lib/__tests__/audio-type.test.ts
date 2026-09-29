import { describe, expect, it } from 'vitest';
import { audioTypeFromQuery } from '../audio-type';

describe('audioTypeFromQuery', () => {
  it('defaults an omitted or invalid lang argument to sub', () => {
    expect(audioTypeFromQuery(null)).toBe('sub');
    expect(audioTypeFromQuery('')).toBe('sub');
    expect(audioTypeFromQuery('english')).toBe('sub');
  });

  it('uses dub only when explicitly requested', () => {
    expect(audioTypeFromQuery('dub')).toBe('dub');
    expect(audioTypeFromQuery('sub')).toBe('sub');
  });
});
