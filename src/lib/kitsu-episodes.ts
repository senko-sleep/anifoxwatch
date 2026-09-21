/**
 * Per-episode stills and synopses from Kitsu (free, keyless, anime-native).
 * IMDb has no public API, and its episode data is TV-shaped rather than
 * anime-shaped. We map AniList id -> Kitsu id through Kitsu's own mapping table,
 * so the match is exact rather than a title guess.
 */
const KITSU = 'https://kitsu.io/api/edge';
const HEADERS = { Accept: 'application/vnd.api+json' };
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

export async function fetchKitsuEpisodeDetails(animeId: string): Promise<EpisodeDetail[]> {
  const anilistId = animeId.match(/^anilist-(\d+)$/)?.[1];
  if (!anilistId) return [];

  const kitsuId = await kitsuIdFromAniList(anilistId);
  if (!kitsuId) return [];

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
