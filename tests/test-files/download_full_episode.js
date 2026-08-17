import ffmpeg from 'ffmpeg-static';
import { exec } from 'child_process';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';

const segmentsFile = 'tests/test-files/naruto-ep1-segments.m3u8';
const outputDir = 'tests/test-files/naruto-ep1-segments';
const outputFile = 'tests/test-files/naruto-ep1-full.mp4';

console.log('Reading segments from:', segmentsFile);

const content = await readFile(segmentsFile, 'utf-8');
const lines = content.split('\n');

const segmentUrls = lines
  .filter(line => line.startsWith('http://127.0.0.1:3001/api/stream/proxy?url='))
  .map(line => line.trim());

console.log(`Found ${segmentUrls.length} segments`);

// Download all segments
for (let i = 0; i < segmentUrls.length; i++) {
  const url = segmentUrls[i];
  const segFile = `${outputDir}/seg_${String(i).padStart(4, '0')}.ts`;
  
  if (existsSync(segFile)) {
    console.log(`[${i + 1}/${segmentUrls.length}] Skipping existing: ${segFile}`);
    continue;
  }
  
  console.log(`[${i + 1}/${segmentUrls.length}] Downloading: ${segFile}`);
  
  await new Promise((resolve, reject) => {
    exec(`curl -s "${url}" -o "${segFile}"`, (error) => {
      if (error) {
        console.error(`Error downloading segment ${i}:`, error);
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

console.log('All segments downloaded. Creating concat list...');

// Create concat file for ffmpeg
const concatFile = 'tests/test-files/naruto-ep1-concat.txt';
const concatContent = segmentUrls.map((_, i) => 
  `file 'naruto-ep1-segments/seg_${String(i).padStart(4, '0')}.ts'`
).join('\n');

await writeFile(concatFile, concatContent);

console.log('Concatenating segments with ffmpeg...');

await new Promise((resolve, reject) => {
  exec(`cd tests/test-files && "${ffmpeg}" -f concat -safe 0 -i "naruto-ep1-concat.txt" -c copy "../naruto-ep1-full.mp4"`, (error, stdout, stderr) => {
    if (error) {
      console.error('Error:', error);
      console.error('Stderr:', stderr);
      reject(error);
    } else {
      console.log('Full episode created: tests/naruto-ep1-full.mp4');
      resolve();
    }
  });
});

console.log('Done!');
