import { useState, useEffect } from 'react';

const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

type Breakpoint = keyof typeof BREAKPOINTS;

interface DeviceInfo {
  width: number;
  height: number;
  isMobile: boolean;       // < 768px
  isTablet: boolean;       // 768–1023px
  isDesktop: boolean;      // >= 1024px
  isLandscape: boolean;    // width > height
  isTouchDevice: boolean;
  breakpoint: Breakpoint | 'xs'; // current active breakpoint
  below: (bp: Breakpoint) => boolean;
  above: (bp: Breakpoint) => boolean;
}

function getDeviceInfo(w: number, h: number): Omit<DeviceInfo, 'below' | 'above'> {
  const isMobile = w < BREAKPOINTS.md;
  const isTablet = w >= BREAKPOINTS.md && w < BREAKPOINTS.lg;
  const isDesktop = w >= BREAKPOINTS.lg;
  const isLandscape = w > h;
  const isTouchDevice =
    typeof window !== 'undefined' &&
    (navigator.maxTouchPoints > 0 || 'ontouchstart' in window);

  let breakpoint: Breakpoint | 'xs' = 'xs';
  for (const [key, val] of Object.entries(BREAKPOINTS).reverse() as [Breakpoint, number][]) {
    if (w >= val) { breakpoint = key; break; }
  }

  return { width: w, height: h, isMobile, isTablet, isDesktop, isLandscape, isTouchDevice, breakpoint };
}

export function useBreakpoint(): DeviceInfo {
  const [info, setInfo] = useState<Omit<DeviceInfo, 'below' | 'above'>>(() =>
    typeof window !== 'undefined'
      ? getDeviceInfo(window.innerWidth, window.innerHeight)
      : { width: 1024, height: 768, isMobile: false, isTablet: false, isDesktop: true, isLandscape: true, isTouchDevice: false, breakpoint: 'lg' }
  );

  useEffect(() => {
    const update = () => setInfo(getDeviceInfo(window.innerWidth, window.innerHeight));

    // ResizeObserver on body catches zoom + font-size changes too
    const ro = new ResizeObserver(update);
    ro.observe(document.documentElement);

    // Orientation change (iOS Safari fires this reliably)
    window.addEventListener('orientationchange', update);

    return () => {
      ro.disconnect();
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return {
    ...info,
    below: (bp: Breakpoint) => info.width < BREAKPOINTS[bp],
    above: (bp: Breakpoint) => info.width >= BREAKPOINTS[bp],
  };
}
