/**
 * Source `name` values registered in {@link SourceManager}'s constructor, in call order.
 * `npm run dev` → `tsx src/index.ts` loads exactly these (`new SourceManager()`).
 *
 * Keep in sync with `registerSource(new …Source())` calls in `services/source-manager.ts`.
 */
export const REGISTERED_SOURCE_NAMES: readonly string[] = [
    'Gogoanime',
    'AnimeFLV',
    'AnimeKai',
    'AllAnime',
    'AnimePahe',
    'WatchHentai',
    'Hanime',
    'AkiH',
];
