import { describe, expect, it } from 'vitest';
import { streamQueryKey } from './stream-query';

describe('stream request identity', () => {
  it('reuses the in-flight and prefetched request when title metadata arrives', () => {
    expect(streamQueryKey('aniwaves-82704&eps=1', undefined, 'sub', 1, 210031))
      .toEqual(streamQueryKey('aniwaves-82704&eps=1', undefined, 'sub', 1, 210031, 'You and I Are Polar Opposites Season 2', false, []));
  });
  it('separates playback choices and failed providers', () => {
    const base = streamQueryKey('ep1', undefined, 'sub', 1, 21);
    expect(streamQueryKey('ep1', undefined, 'dub', 1, 21)).not.toEqual(base);
    expect(streamQueryKey('ep1', 'Vidplay', 'sub', 1, 21)).not.toEqual(base);
    expect(streamQueryKey('ep1', undefined, 'sub', 1, 21, undefined, true)).not.toEqual(base);
    expect(streamQueryKey('ep1', undefined, 'sub', 1, 21, undefined, false, ['Miruro'])).not.toEqual(base);
    expect(streamQueryKey('ep1', undefined, 'sub', 1, undefined, 'Season 1'))
      .not.toEqual(streamQueryKey('ep1', undefined, 'sub', 1, undefined, 'Season 2'));
  });
});
