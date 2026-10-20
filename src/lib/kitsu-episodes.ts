/**
 * Per-episode stills and synopses from Kitsu (free, keyless, anime-native).
 * IMDb has no public API, and its episode data is TV-shaped rather than
 * anime-shaped. We map AniList id -> Kitsu id through Kitsu's own mapping table,
 * so the match is exact rather than a title guess.
 *
 * Kitsu often lists episodes without stills (e.g. Buddy Daddies), so ani.zip runs
 * alongside it: a keyless, CORS-open mapping service carrying TVDB screencaps,
 * titles and overviews per episode. Each field takes Kitsu's value first.
 */
const KITSU = 'https://kitsu.io/api/edge';
const HEADERS = { Accept: 'application/vnd.api+json' };
const ANIZIP = 'https://api.ani.zip/mappings';
const PAGE = 20; // Kitsu's hard page-size cap
const MAX_EPISODES = 300;

export interface EpisodeDetail {
  number: number;
  title?: string;
  synopsis?: string;
  thumbnail?: string;
  airdate?: string;
}

interface KitsuEpisode {
  attributes: {
    number: number | null;
    canonicalTitle: string | null;
    synopsis: string | null;
    airdate: string | null;
    thumbnail: { original?: string; large?: string; medium?: string } | null;
  };
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`[Kitsu] HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

async function kitsuIdFromAniList(anilistId: string): Promise<string | null> {
  const json = await getJson<{ data: { relationships?: { item?: { data?: { id: string; type: string } } } }[] }>(
    `${KITSU}/mappings?filter[externalSite]=anilist/anime&filter[externalId]=${anilistId}&include=item`
  );
  const item = json.data?.[0]?.relationships?.item?.data;
  return item?.type === 'anime' ? item.id : null;
}

/** Source-native pages do not carry an AniList id, so ask Kitsu for its own id. */
async function kitsuIdFromTitle(title: string): Promise<string | null> {
  const query = title.trim();
  if (!query) return null;
  const json = await getJson<{ data: Array<{ id: string; attributes?: { canonicalTitle?: string | null } }> }>(
    `${KITSU}/anime?filter[text]=${encodeURIComponent(query)}&page[limit]=5`
  );
  const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
  const wanted = normalise(query);
  const exact = json.data?.find((item) => normalise(item.attributes?.canonicalTitle || '') === wanted);
  return exact?.id || json.data?.[0]?.id || null;
}

const toDetail = (e: KitsuEpisode): EpisodeDetail | null => {
  const a = e.attributes;
  if (!a.number) return null;
  const title = a.canonicalTitle?.trim();
  return {
    number: a.number,
    title: title && !/^episode\s*\d+$/i.test(title) ? title : undefined,
    synopsis: a.synopsis?.replace(/\s*\(Source:[^)]*\)\s*$/i, '').trim() || undefined,
    thumbnail: a.thumbnail?.large || a.thumbnail?.original || a.thumbnail?.medium || undefined,
    airdate: a.airdate || undefined,
  };
};

interface AniZipEpisode {
  title?: { en?: string | null; 'x-jat'?: string | null } | null;
  overview?: string | null;
  summary?: string | null;
  image?: string | null;
  airDate?: string | null;
  airdate?: string | null;
}

/** ani.zip keys episodes by number; specials ("S1", "C2"...) are skipped. */
async function aniZipEpisodeDetails(query: string): Promise<EpisodeDetail[]> {
  const res = await fetch(`${ANIZIP}?${query}`, { signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`[ani.zip] HTTP ${res.status}`);
  const json = (await res.json()) as { episodes?: Record<string, AniZipEpisode> };
  return Object.entries(json.episodes ?? {}).flatMap(([key, e]) => {
    if (!/^\d+$/.test(key)) return [];
    const title = (e.title?.en || e.title?.['x-jat'] || '').trim();
    const synopsis = (e.overview || e.summary || '').replace(/\s*Source:.*$/is, '').trim();
    return [{
      number: Number(key),
      title: title && !/^episode\s*\d+$/i.test(title) ? title : undefined,
      synopsis: synopsis || undefined,
      thumbnail: e.image || undefined,
      airdate: e.airDate || e.airdate || undefined,
    }];
  });
}

async function kitsuEpisodes(kitsuId: string): Promise<EpisodeDetail[]> {
  const url = (offset: number) =>
    `${KITSU}/anime/${kitsuId}/episodes?page[limit]=${PAGE}&page[offset]=${offset}&sort=number`;

  const first = await getJson<{ data: KitsuEpisode[]; meta?: { count?: number } }>(url(0));
  const total = Math.min(first.meta?.count ?? first.data.length, MAX_EPISODES);
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, Math.ceil(total / PAGE) - 1) }, (_, i) =>
      getJson<{ data: KitsuEpisode[] }>(url((i + 1) * PAGE)).catch(() => ({ data: [] as KitsuEpisode[] }))
    )
  );

  return [first, ...rest]
    .flatMap((p) => p.data)
    .map(toDetail)
    .filter((d): d is EpisodeDetail => d !== null);
}

/** Field-by-field: the primary list's value wins, the fallback fills what it lacks. */
export function mergeEpisodeDetails(primary: EpisodeDetail[], fallback: EpisodeDetail[]): EpisodeDetail[] {
  const byNumber = new Map<number, EpisodeDetail>();
  for (const d of fallback) byNumber.set(d.number, d);
  for (const d of primary) {
    const f = byNumber.get(d.number);
    byNumber.set(d.number, {
      number: d.number,
      title: d.title || f?.title,
      synopsis: d.synopsis || f?.synopsis,
      thumbnail: d.thumbnail || f?.thumbnail,
      airdate: d.airdate || f?.airdate,
    });
  }
  return [...byNumber.values()]
    .map((d) => Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)) as unknown as EpisodeDetail)
    .sort((a, b) => a.number - b.number)
    .slice(0, MAX_EPISODES);
}

const settled = <T,>(r: PromiseSettledResult<T[]>): T[] => (r.status === 'fulfilled' ? r.value : []);

export async function fetchKitsuEpisodeDetails(animeId: string, title?: string): Promise<EpisodeDetail[]> {
  const anilistId = animeId.match(/^anilist-(\d+)$/)?.[1];

  if (anilistId) {
    // Neither source waits on the other: ani.zip is keyed by the AniList id directly.
    const [kitsu, aniZip] = await Promise.allSettled([
      kitsuIdFromAniList(anilistId).then((id) => (id ? kitsuEpisodes(id) : [])),
      aniZipEpisodeDetails(`anilist_id=${anilistId}`),
    ]);
    return mergeEpisodeDetails(settled(kitsu), settled(aniZip));
  }

  const kitsuId = await kitsuIdFromTitle(title || '');
  if (!kitsuId) return [];
  const [kitsu, aniZip] = await Promise.allSettled([
    kitsuEpisodes(kitsuId),
    aniZipEpisodeDetails(`kitsu_id=${kitsuId}`),
  ]);
  return mergeEpisodeDetails(settled(kitsu), settled(aniZip));
}
