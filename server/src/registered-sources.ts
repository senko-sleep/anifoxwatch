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

