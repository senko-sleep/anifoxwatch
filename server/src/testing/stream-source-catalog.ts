import { REGISTERED_SOURCE_NAMES } from '../registered-sources.js';

export type StreamSourceCatalogEntry = {
  /** Human label as provided/known by users. */
  label: string;
  /** Normalized key for dedupe + lookups. */
  key: string;
  /** True if this source is currently implemented/registered in this API. */
  implemented: boolean;
  /** If implemented, the canonical SourceManager name. */
  canonicalName?: string;
};

function normalizeSourceKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[_/\\]+/g, '-')
    .replace(/[^\p{L}\p{N}]+/gu, '-') // unicode-safe word chars
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const canonicalByKey = new Map<string, string>(
  REGISTERED_SOURCE_NAMES.map((n) => [normalizeSourceKey(n), n]),
);

/**
 * Sources you asked to cover for "stream getting" tests.
 *
 * Notes:
 * - This file is a *catalog* only (no network calls).
 * - Most entries are not implemented in this repo yet; `implemented=false` makes that explicit.
 * - Build tests on top of this list to track coverage and prevent regressions as sources are added.
 */
export const STREAM_SOURCE_CATALOG: readonly StreamSourceCatalogEntry[] = [
  // --- Implemented in this repo (REGISTERED_SOURCE_NAMES) ---
  ...REGISTERED_SOURCE_NAMES.map((n) => ({
    label: n,
    key: normalizeSourceKey(n),
    implemented: true,
    canonicalName: n,
  })),

  // --- Requested (unimplemented here unless it matches a registered name) ---
  ...[
    'AnimePahe', 'AnimeSuge', 'KickAssAnime', '4Anime', 'AnimeHeaven', 'YugenAnime', 'Kaido', 'AnimeKai', 'AniLife',
    'Chia-Anime', 'AnimeDao', 'MyAnimeLive', 'AnimeFrenzy', 'AnimeKisa', 'AnimixPlay', 'Masterani', 'AllAnime',
    'AnimeUltima', 'AnimeFlix', 'AnimeKarma', 'Kawaiifu', 'SoulReaper', 'SimplyDotAnime', 'AnimeHeros', 'Wcofun',
    'AnimeKaizoku', 'Nyaa', 'AniNow', 'Okanime', 'AnimeSama', '123Anime', 'Anicrush', 'AnimeTake', 'AnimePlyx',
    'KissAnime', 'DubbedAnime', 'AnimeHub', 'AnimeRush', 'AnimeVibe', 'AnimeWorld', 'UniqueStream', 'AnimeShow',
    'AnimeStreaming', 'AnimeZ', 'OtakuStream', 'GoGoAnime.bid', 'Anitaku', 'LunarAnime', 'AniMag', 'Kaguya',
    '1Anime', 'AniPlayNow', 'Shiroko', 'Enimoe', 'AnimeHi', 'AnimeNexus', 'MovieMaze', 'AnimeRealms', 'RiveStream',
    'AnimeSlayer', 'AnimesUpdate', 'AnimeFox', 'AnimeSeason', 'AnimeNova', 'AnimeTV', 'AnimeKayo', 'AnimeOut',
    'AnimeLand', 'AnimeToon', 'AnimeBam', 'AnimeSeed', 'AnimeRam', 'AnimePill', 'AnimeIndo', 'Animeid', 'AnimeMobile',
    'AnimeHype', 'AnimeFreak', 'AnimeKun', 'AnimeUltimo', 'AnimeFever', 'AnimeNet', 'AnimePlus', 'AnimeTube', 'AnimeX',
    'AnimeZone', 'AnimePure', 'AnimeFire', 'AnimeFast', 'AnimeLife', 'AnimeVost', 'AnimeSub', 'AnimeRaw', 'AnimeDub',
    'AnimeBase', 'AnimeList', 'AnimeBox', 'AniWatch', 'AniPlay', 'AniMix', 'AniClick', 'AniPulse', 'AniGlance',
    'AnimeBytes', 'Bakabt', 'AnimeTorrents', 'AnimeTosho', 'AniArena', 'HorribleSubs', 'Erai-raws', 'SubsPlease',
    'Shanaproject', 'TokyoToshokan', 'Anidex', 'Anisource', 'AnimeLayer', 'RuTracker', 'BlueBird', 'AnimeAccess',
    'AnimeAdmirer', 'AnimeBlyat', 'AnimeCenter', 'AnimeCloud', 'AnimeCrazy', 'AnimeCrunch', 'AnimeDay', 'AnimeDream',
    'AnimeEater', 'AnimeEdge', 'AnimeEnjoy', 'AnimeEver', 'AnimeEvolution', 'AnimeExpert', 'AnimeFan', 'AnimeFave',
    'AnimeFlash', 'AnimeFocus', 'AnimeForce', 'AnimeGalaxy', 'AnimeGate', 'AnimeGen', 'AnimeGhost', 'AnimeGlow',
    'AnimeGold', 'AnimeGram', 'AnimeGrid', 'AnimeGrow', 'AnimeGuy', 'AnimeHeart', 'AnimeHide', 'AnimeHint', 'AnimeHit',
    'AnimeHold', 'AnimeHoly', 'AnimeHome', 'AnimeHood', 'AnimeHope', 'AnimeHost', 'AnimeHot', 'AnimeHouse', 'AnimeHuge',
    'AnimeIcon', 'AnimeIdeal', 'AnimeIllusion', 'AnimeImage', 'AnimeImpact', 'AnimeInfinity', 'AnimeInk', 'AnimeInsu',
    'AnimeIron', 'AnimeIsland', 'AnimeItem', 'AnimeJack', 'AnimeJet', 'AnimeJoy', 'AnimeJump', 'AnimeJust', 'AnimeKey',
    'AnimeKind', 'AnimeKing', 'AnimeKiss', 'AnimeKnot', 'AnimeLace', 'AnimeLamp', 'AnimeLeaf', 'AnimeLens', 'AnimeLight',
    'AnimeLink', 'AnimeLoop', 'AnimeLush', 'AnimeMad', 'AnimeMaze', 'AnimeMojo', 'AnimeMv', 'Miruro',
  ].map((label) => {
    const key = normalizeSourceKey(label);
    const canonicalName = canonicalByKey.get(key);
    return {
      label,
      key,
      implemented: Boolean(canonicalName),
      canonicalName,
    } satisfies StreamSourceCatalogEntry;
  }),
].reduce<StreamSourceCatalogEntry[]>((acc, entry) => {
  // Deduplicate by key (prefer implemented entry)
  const i = acc.findIndex((e) => e.key === entry.key);
  if (i === -1) acc.push(entry);
  else if (!acc[i].implemented && entry.implemented) acc[i] = entry;
  return acc;
}, []);

export function getImplementedStreamSources(): string[] {
  return STREAM_SOURCE_CATALOG.filter((s) => s.implemented && s.canonicalName).map((s) => s.canonicalName!) as string[];
}

export function getUnimplementedRequestedSources(): string[] {
  return STREAM_SOURCE_CATALOG.filter((s) => !s.implemented).map((s) => s.label);
}

