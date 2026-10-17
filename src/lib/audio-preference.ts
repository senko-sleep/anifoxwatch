import type { AudioType } from '@/lib/audio-type';

// Remembers SUB/DUB per anime (and the last choice overall) so reopening a show
// from anywhere — search, details, the episode list — plays it in the same language.

const KEY = 'audio-preference';
const MAX_ANIME = 500;

type Store = { last?: AudioType; byAnime: Record<string, AudioType> };

const isAudio = (v: unknown): v is AudioType => v === 'sub' || v === 'dub';

function read(): Store {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      last: isAudio(parsed?.last) ? parsed.last : undefined,
      byAnime: parsed?.byAnime && typeof parsed.byAnime === 'object' ? parsed.byAnime : {},
    };
  } catch {
    return { byAnime: {} };
  }
}

export function rememberAudioPreference(animeId: string, audioType: AudioType): void {
  if (!animeId) return;
  try {
    const store = read();
    delete store.byAnime[animeId]; // re-insert so the most recent is last
    store.byAnime[animeId] = audioType;
    const ids = Object.keys(store.byAnime);
    for (const id of ids.slice(0, Math.max(0, ids.length - MAX_ANIME))) delete store.byAnime[id];
    store.last = audioType;
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* storage unavailable */
  }
}

/**
 * Language to start an anime in. `sticky` means it reflects an explicit or past
 * choice for this anime, so automatic DUB→SUB fallback must not override it.
 * Order: URL `?lang=` → remembered for this anime → watch history → last choice → SUB.
 */
export function preferredAudioType(
  animeId: string,
  queryLang: string | null,
  historyAudioType?: AudioType,
): { audioType: AudioType; sticky: boolean } {
  if (isAudio(queryLang)) return { audioType: queryLang, sticky: true };
  const store = read();
  const remembered = (animeId && store.byAnime[animeId]) || historyAudioType;
  if (isAudio(remembered)) return { audioType: remembered, sticky: true };
  return { audioType: store.last ?? 'sub', sticky: false };
}
