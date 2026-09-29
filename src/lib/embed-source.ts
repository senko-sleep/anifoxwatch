/** Hosts whose URLs are HTML player pages, not raw streams — they play in an iframe. */
export const EMBED_DOMAINS = ['streamwish', 'mega.nz', 'hqq.tv', 'streamtape', 'doodstream', 'mp4upload', 'sendvid', 'ok.ru', 'flixcloud', 'megacloud', 'rabbitstream', 'dokicloud'];
// Aniwaves / EchoVideo embeds are domain-locked — loading them in our iframe yields
// "Embedding blocked on this site". Treat them as non-embeddable so the player never
// tries to render them (and instead fails over to a real stream source).
export const DOMAIN_LOCKED_EMBED = /aniwaves\.ru|echovideo|burntburst|play\.echovideo/i;

export const isEmbedUrl = (url: string) => {
  const lower = url.toLowerCase();
  if (!lower) return false;
  if (DOMAIN_LOCKED_EMBED.test(lower)) return false;
  if (lower.includes('.m3u8') || lower.includes('.mp4')) return false;
  // Streamtape /get_video? and tapecontent CDN are direct video links, not embed pages
  if ((lower.includes('streamtape') || lower.includes('tapecontent')) && lower.includes('get_video')) return false;
  return EMBED_DOMAINS.some((d) => lower.includes(d));
};

interface SourceLike { url?: string; originalUrl?: string; isEmbed?: boolean }

/** Apply FlixCloud's native audio-track and start-position embed parameters. */
export function embedPlaybackUrlFor(
  embedUrl: string | null,
  source: string | undefined,
  audioType: 'sub' | 'dub',
  startAt = 0,
): string | null {
  if (!embedUrl || source !== 'ReAnime') return embedUrl;
  try {
    const url = new URL(embedUrl);
    if (!url.hostname.toLowerCase().includes('flixcloud')) return embedUrl;
    url.searchParams.set('a', audioType === 'dub' ? '1' : '0');
    if (Number.isFinite(startAt) && startAt > 0) url.searchParams.set('start_at', String(Math.floor(startAt)));
    return url.toString();
  } catch {
    return embedUrl;
  }
}

/** The iframe URL for a source that must play as an embed page, or null for a real stream. */
export function embedUrlFor(source: SourceLike | null | undefined): string | null {
  if (!source) return null;
  const raw = source.originalUrl || source.url || '';
  if (source.isEmbed) return raw && !DOMAIN_LOCKED_EMBED.test(raw) ? raw : null;
  // Unwrap the proxy first: its query string contains the embed host, so testing the
  // wrapped URL would match and hand the iframe our proxy instead of the embed page.
  if (source.url?.includes('/api/stream/proxy?url=')) {
    const inner = decodeURIComponent(source.url.split('/api/stream/proxy?url=')[1]?.split('&')[0] || '');
    if (isEmbedUrl(inner)) return inner;
    if (!source.originalUrl) return null;
  }
  return isEmbedUrl(raw) ? raw : null;
}
