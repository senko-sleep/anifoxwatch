import { useQuery } from '@tanstack/react-query';

export interface TrendingInsight {
  /** Short, factual reason: "New ep 4", "Just premiered", "Surging", "#1 this week". */
  reason: string;
  /** When the current streak started: "Oct 5–now". */
  range: string | null;
  /** Full-date tooltip for the range. */
  rangeTitle: string | null;
  kind: 'rank' | 'episode' | 'premiere' | 'finale' | 'surge' | 'steady';
}

interface TrendNode { date: number; trending: number | null; episode: number | null }
interface MediaTrendData {
  id: number;
  trending: number | null;
  episodes: number | null;
  status: string | null;
  nextAiringEpisode: { episode: number; airingAt: number } | null;
  trends: { nodes: TrendNode[] } | null;
}

const QUERY = `query ($ids: [Int]) {
  Page(perPage: 50) {
    media(id_in: $ids, type: ANIME, sort: TRENDING_DESC) {
      id trending episodes status
      nextAiringEpisode { episode airingAt }
      trends(sort: DATE_DESC, perPage: 90) { nodes { date trending episode } }
    }
  }
}`;

const DAY = 86400;

function anilistNumericId(id: string): number | null {
  const m = /^(?:anilist-)?(\d+)$/.exec(id);
  return m ? Number(m[1]) : null;
}

const MONTH_DAY = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const MONTH = new Intl.DateTimeFormat(undefined, { month: 'short' });
const FULL = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const HISTORY_DAYS = 90;

/** "Oct 5–now"; month-only when the streak runs past the history we fetched. */
function formatRange(days: number, nowSec: number, capped: boolean): Pick<TrendingInsight, 'range' | 'rangeTitle'> {
  if (days < 2) return { range: null, rangeTitle: null };
  const start = new Date((nowSec - (days - 1) * DAY) * 1000);
  if (capped) return { range: `Before ${MONTH.format(start)}–now`, rangeTitle: `Trending for over ${HISTORY_DAYS} days` };
  return { range: `${MONTH_DAY.format(start)}–now`, rangeTitle: `Trending since ${FULL.format(start)} (${days} days)` };
}

/** Consecutive recent days where the title held at least 60% of its current heat. */
function streakDays(nodes: TrendNode[], current: number): number {
  if (!nodes.length || current <= 0) return 0;
  const floor = Math.max(8, current * 0.6);
  let days = 0;
  let expected = nodes[0].date;
  for (const n of nodes) {
    if (expected - n.date > DAY * 1.5) break; // a gap in the record ends the streak
    if ((n.trending ?? 0) < floor) break;
    days++;
    expected = n.date - DAY;
  }
  return days;
}

function deriveInsight(m: MediaTrendData, rank: number, nowSec: number): TrendingInsight {
  const nodes = (m.trends?.nodes ?? []).filter((n) => n.date <= nowSec + DAY);
  const current = m.trending ?? nodes[0]?.trending ?? 0;
  // Weekly shows: the previous episode aired one week before the next one.
  const next = m.nextAiringEpisode;
  const lastAired = next && next.episode > 1 ? { episode: next.episode - 1, airingAt: next.airingAt - 7 * DAY } : null;
  const airedRecently = lastAired && nowSec - lastAired.airingAt < DAY * 3;
  // A streak can never be older than the show itself.
  const ageDays = lastAired ? Math.floor((nowSec - (lastAired.airingAt - (lastAired.episode - 1) * 7 * DAY)) / DAY) + 1 : Infinity;
  const streak = streakDays(nodes, current);
  const duration = formatRange(Math.min(streak, ageDays), nowSec, streak >= HISTORY_DAYS && ageDays > HISTORY_DAYS);

  if (airedRecently && lastAired) {
    if (m.episodes && lastAired.episode >= m.episodes) return { reason: 'Finale just aired', ...duration, kind: 'finale' };
    if (lastAired.episode <= 1) return { reason: 'Just premiered', ...duration, kind: 'premiere' };
    return { reason: `New ep ${lastAired.episode}`, ...duration, kind: 'episode' };
  }

  if (rank === 0) return { reason: '#1 this week', ...duration, kind: 'rank' };

  const recent = nodes.slice(0, 3).map((n) => n.trending ?? 0);
  const before = nodes.slice(3, 10).map((n) => n.trending ?? 0);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  if (before.length >= 3 && avg(recent) > avg(before) * 1.35) return { reason: 'Surging', ...duration, kind: 'surge' };

  if (rank < 3) return { reason: `#${rank + 1} this week`, ...duration, kind: 'rank' };
  if (m.status === 'RELEASING' && m.nextAiringEpisode) return { reason: 'Weekly favorite', ...duration, kind: 'steady' };
  return { reason: 'Fan favorite', ...duration, kind: 'steady' };
}

/**
 * Why each trending title is trending, from AniList's daily trend history. Purely
 * decorative: if AniList is unreachable the shelf simply renders without captions.
 */
export function useTrendingInsights(ids: string[]) {
  const numeric = ids.map(anilistNumericId).filter((n): n is number => n != null);
  return useQuery<Record<string, TrendingInsight>>({
    queryKey: ['trending-insights', numeric.join(',')],
    enabled: numeric.length > 0,
    staleTime: 30 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: QUERY, variables: { ids: numeric } }),
      });
      if (!res.ok) throw new Error(`AniList ${res.status}`);
      const json = await res.json();
      const media: MediaTrendData[] = json?.data?.Page?.media ?? [];
      const byId = new Map(media.map((m) => [m.id, m]));
      const nowSec = Date.now() / 1000;
      const out: Record<string, TrendingInsight> = {};
      ids.forEach((id, rank) => {
        const m = byId.get(anilistNumericId(id) ?? -1);
        if (m) out[id] = deriveInsight(m, rank, nowSec);
      });
      return out;
    },
  });
}
