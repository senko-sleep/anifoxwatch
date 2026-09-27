import { describe, expect, it } from 'vitest';
import { embedUrlFor, isEmbedUrl } from '../embed-source';

describe('isEmbedUrl', () => {
  it('treats embed-page hosts as embeds', () => {
    expect(isEmbedUrl('https://flixcloud.cc/e/isqxuumubl7e?v=1')).toBe(true);
    expect(isEmbedUrl('https://megacloud.blog/embed-2/e-1/abc')).toBe(true);
  });

  it('treats raw streams as playable, not embeds', () => {
    expect(isEmbedUrl('https://fetch.nexabloom.top/anime/x/master.m3u8?token=1')).toBe(false);
    expect(isEmbedUrl('https://cdn.example.com/ep1.mp4')).toBe(false);
    expect(isEmbedUrl('https://streamtape.com/get_video?id=1')).toBe(false);
  });

  it('rejects domain-locked embeds that refuse to load in our iframe', () => {
    expect(isEmbedUrl('https://play.echovideo.ru/e/abc')).toBe(false);
    expect(isEmbedUrl('https://aniwaves.ru/embed/abc')).toBe(false);
  });

  it('handles empty input', () => {
    expect(isEmbedUrl('')).toBe(false);
  });
});

describe('embedUrlFor', () => {
  it('returns null with no source', () => {
    expect(embedUrlFor(null)).toBeNull();
    expect(embedUrlFor(undefined)).toBeNull();
  });

  it('returns the embed page for the FlixCloud source that broke resume', () => {
    // The exact shape ReAnime returned for Chainsmoker Cat ep 2.
    const src = { url: 'https://flixcloud.cc/e/isqxuumubl7e?v=1', isM3U8: false, isDirect: true };
    expect(embedUrlFor(src)).toBe('https://flixcloud.cc/e/isqxuumubl7e?v=1');
  });

  it('returns null for an HLS stream, so VideoPlayer handles it', () => {
    const src = { url: 'http://localhost:3001/api/stream/proxy?url=https%3A%2F%2Ffetch.nexabloom.top%2Fa%2Fmaster.m3u8' };
    expect(embedUrlFor(src)).toBeNull();
  });

  it('prefers originalUrl for server-flagged embeds', () => {
    const src = { url: 'http://proxy/x', originalUrl: 'https://megacloud.blog/e/1', isEmbed: true };
    expect(embedUrlFor(src)).toBe('https://megacloud.blog/e/1');
  });

  it('refuses server-flagged embeds that are domain-locked', () => {
    expect(embedUrlFor({ url: 'https://play.echovideo.ru/e/1', isEmbed: true })).toBeNull();
  });

  it('unwraps embed pages hidden behind the stream proxy', () => {
    const inner = 'https://flixcloud.cc/e/abc';
    const src = { url: `http://localhost:3001/api/stream/proxy?url=${encodeURIComponent(inner)}&referer=x` };
    expect(embedUrlFor(src)).toBe(inner);
  });
});
