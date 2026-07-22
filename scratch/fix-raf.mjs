import { readFileSync, writeFileSync } from 'fs';

const file = 'c:/Users/Owner/anistream-hub/src/components/player/VideoPlayer.tsx';
let content = readFileSync(file, 'utf8');

// Find and replace the RAF polling block (handles both CRLF and LF)
const rafPattern = /\/\/ which breaks scrubbing UI[\s\S]*?return \(\) => cancelAnimationFrame\(raf\);\r?\n  \}, \[src\]\);/;

const newBlock = `  // Keep duration in sync — use event-driven approach instead of RAF polling.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const onDurationChange = () => {
      const d = v.duration;
      if (Number.isFinite(d) && d > 0) setDuration(d);
    };
    const onLoadedMeta = () => {
      const d = v.duration;
      if (Number.isFinite(d) && d > 0) setDuration(d);
    };
    v.addEventListener('durationchange', onDurationChange);
    v.addEventListener('loadedmetadata', onLoadedMeta);
    return () => {
      v.removeEventListener('durationchange', onDurationChange);
      v.removeEventListener('loadedmetadata', onLoadedMeta);
    };
  }, [src]);`;

const match = content.match(rafPattern);
if (match) {
  content = content.replace(rafPattern, newBlock);
  writeFileSync(file, content, 'utf8');
  console.log('SUCCESS: RAF polling replaced with event listeners');
} else {
  console.log('Pattern not found — dumping nearby lines:');
  const lines = content.split('\n');
  const idx = lines.findIndex(l => l.includes('which breaks scrubbing UI'));
  console.log('Line', idx, ':', JSON.stringify(lines[idx]));
  console.log('Line', idx+1, ':', JSON.stringify(lines[idx+1]));
}
