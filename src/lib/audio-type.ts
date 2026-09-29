export type AudioType = 'sub' | 'dub';

/** Missing or unrecognized lang values use the fast SUB default. */
export function audioTypeFromQuery(value: string | null): AudioType {
  return value === 'dub' ? 'dub' : 'sub';
}
