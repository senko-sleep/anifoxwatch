/**
 * Shared AniList GraphQL access: proxied through our Vercel API to avoid
 * browser CORS blocks. One-at-a-time pacing + 429 retry.
 */
import { apiUrl } from '@/lib/api-config';

export const ANILIST_GRAPHQL_URL = apiUrl('/api/anilist/graphql');
const ANILIST_DIRECT_URL = 'https://graphql.anilist.co';

const MIN_SPACING_MS = 850;
const MAX_429_RETRIES = 5;

let queue: Promise<unknown> = Promise.resolve();

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function retryAfterMs(res: Response): number | null {
  const raw = res.headers.get('retry-after');
  if (!raw) return null;
  const sec = parseInt(raw, 10);
  if (!Number.isNaN(sec)) return sec * 1000;
  const when = Date.parse(raw);
  if (!Number.isNaN(when)) return Math.max(0, when - Date.now());
  return null;
}

async function fetchWith429Retry(init: RequestInit): Promise<Response> {
  let attempt = 0;
  while (true) {
    let res = await fetch(ANILIST_GRAPHQL_URL, init);
    // Proxy blocked by AniList (datacenter IP ban) — fall back to direct browser request
    if (res.status === 403) {
      res = await fetch(ANILIST_DIRECT_URL, init);
    }
    if (res.status !== 429) return res;
    if (attempt >= MAX_429_RETRIES) return res;

    const waitMs = retryAfterMs(res) ?? Math.min(45_000, 1800 * 2 ** attempt);
    await delay(waitMs);
    attempt++;
  }
}

const MAX_TRANSIENT_RETRIES = 3;

/** 429 handled above; also retry 5xx and cold-start network failures. */
async function fetchAniListOnceWithTransientRetry(init: RequestInit): Promise<Response> {
  for (let attempt = 0; attempt < MAX_TRANSIENT_RETRIES; attempt++) {
    try {
      const res = await fetchWith429Retry(init);
      if (res.ok) return res;
      if (res.status === 429) return res;
      if (res.status >= 500 && res.status < 600 && attempt < MAX_TRANSIENT_RETRIES - 1) {
        await delay(500 * (attempt + 1));
        continue;
      }
      return res;
    } catch (e) {
      if (attempt === MAX_TRANSIENT_RETRIES - 1) throw e;
      await delay(650 * (attempt + 1));
    }
  }
  throw new Error('AniList request exhausted retries');
}

/**
 * Serialize all AniList GraphQL POSTs and space them apart to stay under rate limits.
 */
export function fetchAniListGraphQL(body: Record<string, unknown>): Promise<Response> {
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  };

  const run = queue.then(() => fetchAniListOnceWithTransientRetry(init));
  queue = run.finally(() => delay(MIN_SPACING_MS));
  return run;
}
