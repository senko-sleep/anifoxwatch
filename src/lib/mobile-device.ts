/** Device capabilities stay useful when mobile browsers request desktop pages. */
export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) return true;
  if ((navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile) return true;
  if (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1) return true;
  return navigator.maxTouchPoints > 0 && typeof window !== 'undefined'
    && window.matchMedia('(pointer: coarse)').matches
    && window.matchMedia('(hover: none)').matches;
}
