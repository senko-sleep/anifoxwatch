import { describe, expect, it } from 'vitest';
import { nextAniwavesServer } from './stream-failover';

describe('Aniwaves embed failover', () => {
  const servers = [
    { name: 'DatSaV', type: 'sub' },
    { name: 'Vidplay', type: 'sub' },
    { name: 'BYFMS', type: 'sub' },
    { name: 'Vidplay', type: 'dub' },
  ];

  it('tries another embed from the same provider after a fragment failure', () => {
    expect(nextAniwavesServer(servers, 'sub', 'DatSaV', [])).toBe('Vidplay');
  });

  it('skips every embed already known to have failed and respects audio category', () => {
    expect(nextAniwavesServer(servers, 'sub', 'Vidplay', ['DatSaV'])).toBe('BYFMS');
    expect(nextAniwavesServer(servers, 'sub', 'BYFMS', ['DatSaV', 'Vidplay'])).toBeUndefined();
  });
});
