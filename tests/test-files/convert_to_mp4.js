import ffmpeg from 'ffmpeg-static';
import { exec } from 'child_process';

const input = 'tests/test-files/demon-slayer-ep1-segment.ts';
const output = 'tests/test-files/demon-slayer-ep1-segment.mp4';

console.log('Converting', input, 'to', output, '...');
console.log('Using ffmpeg from:', ffmpeg);

exec(`"${ffmpeg}" -i "${input}" -c copy "${output}"`, (error, stdout, stderr) => {
  if (error) {
    console.error('Error:', error);
    return;
  }
  console.log('Conversion complete!');
  console.log('Output:', output);
});
