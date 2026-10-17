// Landscape lock for mobile fullscreen. Chrome/Android only honours
// screen.orientation.lock() while the document is fullscreen, so the lock must
// be requested after (and re-applied on) fullscreen entry, and released on exit.

type LockableOrientation = {
  lock?: (orientation: string) => Promise<void>;
  unlock?: () => void;
};

const getOrientation = (): LockableOrientation | null =>
  (typeof screen !== 'undefined' && (screen.orientation as unknown as LockableOrientation)) || null;

export type OrientationPref = 'landscape' | 'portrait';

const PREF_KEY = 'player-orientation-pref';

/** The viewer's remembered fullscreen orientation (landscape unless they chose portrait). */
export function loadOrientationPref(): OrientationPref {
  try {
    return localStorage.getItem(PREF_KEY) === 'portrait' ? 'portrait' : 'landscape';
  } catch {
    return 'landscape';
  }
}

export function saveOrientationPref(pref: OrientationPref): void {
  try {
    localStorage.setItem(PREF_KEY, pref);
  } catch {
    /* storage unavailable */
  }
}

export async function lockOrientation(pref: OrientationPref): Promise<boolean> {
  const o = getOrientation();
  if (!o?.lock) return false;
  try {
    await o.lock(pref);
    return true;
  } catch {
    return false;
  }
}

export const lockLandscape = () => lockOrientation('landscape');

export function unlockOrientation(): void {
  try {
    getOrientation()?.unlock?.();
  } catch {
    /* ignore */
  }
}

/**
 * Keeps orientation in sync with fullscreen: locked to the viewer's preferred
 * orientation while fullscreen on a mobile device, unlocked otherwise.
 * Returns a cleanup function.
 */
export function syncOrientationWithFullscreen(
  isMobile: () => boolean,
  onChange?: (inFullscreen: boolean) => void,
  doc: Document = document,
  getPref: () => OrientationPref = () => 'landscape',
): () => void {
  const handler = () => {
    const inFullscreen = !!doc.fullscreenElement;
    if (isMobile()) {
      if (inFullscreen) void lockOrientation(getPref());
      else unlockOrientation();
    }
    onChange?.(inFullscreen);
  };
  doc.addEventListener('fullscreenchange', handler);
  return () => doc.removeEventListener('fullscreenchange', handler);
}
