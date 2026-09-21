/**
 * Source `name` values registered in {@link SourceManager}'s constructor, in call order.
 * `npm run dev` → `tsx src/index.ts` loads exactly these (`new SourceManager()`).
 *
 * Keep in sync with `registerSource(new …Source())` calls in `services/source-manager.ts`.
 */
export const REGISTERED_SOURCE_NAMES: readonly string[] = [
    // ── VERIFIED WORKING ──────────────────────────────────────
    'Yomi',               // ✅ Primary: Yomi.to embedded MegaPlay/AnimePlay/VidNest/etc.
    'Aniwaves',           // ✅ Fallback: EchoVideo → burntburst45.store HLS
    'ReAnime',            // ✅ ReAnime (reanime.to): FlixCloud HD streams
    'Anichi',             // ✅ Anichi (anichi.to): Puppeteer streams (nekostream/pahe/HLS)

    // ── HENTAI SOURCES ─────────────────────────────────────────
    'WatchHentai',        // ✅ watchhentai.net - Hentai streaming (primary hentai source)
    // 'Hanime',           // 🔧 Placeholder - requires JS rendering, not currently functional
];


/**
 * Every prefix an anime id can carry to say which source it came from. Used to tell a
 * source's own id from a plain title slug, both when resolving a URL and when routing an
 * id to its source. Keep in step with SourceManager's prefixMap.
 */
export const KNOWN_SOURCE_PREFIXES: readonly string[] = [
    'animekai-', 'animepahe-',
    '9anime-', 'gogoanime-', 'consumet-',
    'animeflv-', 'anilist-', 'watchhentai-', 'hentaimama-', 'hentaihaven-', 'hanime-', 'akih-',
    'aniwaves-', 'aniwave-', 'aniwatch-', 'allanime-', 'miruro-', 'anichi-', 'reanime-', 'yomi-',
    'gogoorat-', 'wcofun-', 'animeheaven-', 'kaido-',
];

/** The source prefix an id starts with, if any. */
export const sourcePrefixOf = (id: string): string | undefined => {
    const lower = id.toLowerCase();
    return KNOWN_SOURCE_PREFIXES.find((p) => lower.startsWith(p));
};
