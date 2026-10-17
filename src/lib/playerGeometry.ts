import type { CSSProperties } from 'react';

// When the OS refuses to rotate (iPhone Safari, some Android browsers/webviews),
// the player stage is CSS-rotated 90° clockwise to fake landscape. Pointer events
// still arrive in screen coordinates, so convert them into the element's own frame.

export type LocalPoint = { x: number; y: number; width: number; height: number };

/** Pointer position in `el`'s own (pre-rotation) CSS pixels. */
export function localPoint(el: Element, clientX: number, clientY: number, rotated: boolean): LocalPoint {
  const r = el.getBoundingClientRect();
  // rotate(90deg): the element's x axis runs down the screen, its y axis runs right-to-left.
  return rotated
    ? { x: clientY - r.top, y: r.right - clientX, width: r.height, height: r.width }
    : { x: clientX - r.left, y: clientY - r.top, width: r.width, height: r.height };
}

/** Inline style that rotates a full-screen stage into landscape on a portrait screen. */
export function landscapeStageStyle(viewportWidth: number, viewportHeight: number): CSSProperties {
  return {
    width: viewportHeight,
    height: viewportWidth,
    transformOrigin: 'top left',
    transform: 'rotate(90deg) translateY(-100%)',
  };
}
