export function isTimeBuffered(ranges: TimeRanges, time: number, tolerance = 0.1): boolean {
  for (let i = 0; i < ranges.length; i++) {
    if (time >= ranges.start(i) - tolerance && time <= ranges.end(i)) return true;
  }
  return false;
}
