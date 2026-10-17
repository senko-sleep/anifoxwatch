// Landscape lock for mobile fullscreen. Chrome/Android only honours
// screen.orientation.lock() while the document is fullscreen, so the lock must
// be requested after (and re-applied on) fullscreen entry, and released on exit.

type LockableOrientation = {
  lock?: (orientation: string) => Promise<void>;
  unlock?: () => void;
};

const getOrientation = (): LockableOrientation | null =>
  (typeof screen !== 'undefined' && (screen.orientation as unknown as LockableOrientation)) || null;

export async function lockLandscape(): Promise<boolean> {
  const o = getOrientation();
  if (!o?.lock) return false;
  try {
    await o.lock('landscape');
    return true;
  } catch {
    return false;
  }
}

export function unlockOrientation(): void {
  try {
    getOrientation()?.unlock?.();
  } catch {
    /* ignore */
  }
}

/**
 * Keeps orientation in sync with fullscreen: landscape-locked while `target`
 * (or any element) is fullscreen on a mobile device, unlocked otherwise.
 * Returns a cleanup function.
 */
export function syncOrientationWithFullscreen(
  isMobile: () => boolean,
  onChange?: (inFullscreen: boolean) => void,
  doc: Document = document,
): () => void {
  const handler = () => {
    const inFullscreen = !!doc.fullscreenElement;
    if (isMobile()) {
      if (inFullscreen) void lockLandscape();
      else unlockOrientation();
    }
    onChange?.(inFullscreen);
  };
  doc.addEventListener('fullscreenchange', handler);
  return () => doc.removeEventListener('fullscreenchange', handler);
}
