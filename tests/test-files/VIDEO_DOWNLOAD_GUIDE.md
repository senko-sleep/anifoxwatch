# Video Download Guide

This document explains how to download full anime episodes from the AniStream Hub API and convert them to MP4 format.

## Overview

The process involves:
1. Finding an anime with a working CDN (not blocked by Cloudflare)
2. Getting the streaming URL from the API
3. Downloading HLS manifests and segments
4. Concatenating segments with ffmpeg to create a full MP4

## Step-by-Step Process

### 1. Find an Anime with Working CDN

Some CDNs like `flixcloud.cc` are blocked by Cloudflare and return HTML error pages instead of video content. Look for anime that use working CDNs like `echovideo.to`.

**Example: Naruto (works with echovideo.to)**
```bash
# Search for anime
curl "http://127.0.0.1:3001/api/anime/search?q=naruto&page=1"

# Get episodes
curl "http://127.0.0.1:3001/api/anime/aniwaves-naruto-76396/episodes"
```

### 2. Get Streaming URL

```bash
# Get streaming URL for episode 1
curl "http://127.0.0.1:3001/api/stream/watch/aniwaves-76396&eps=1"
```

This returns a JSON response with a proxy URL like:
```
http://127.0.0.1:3001/api/stream/proxy?url=https%3A%2F%2Fru-ri-cdn3.echovideo.to%2Fcdn%2F...
```

### 3. Download Master Manifest

```bash
curl "http://127.0.0.1:3001/api/stream/proxy?url=..." -o naruto-ep1-master.m3u8
```

The master manifest contains quality options and points to segment playlists.

### 4. Download Segment Playlist

Extract the segment playlist URL from the master manifest and download it:
```bash
curl "http://127.0.0.1:3001/api/stream/proxy?url=..." -o naruto-ep1-segments.m3u8
```

The segment playlist contains URLs to individual video segments (typically 100-200 segments per episode).

### 5. Download All Segments

Create a directory and download each segment:
```bash
mkdir naruto-ep1-segments

# Download each segment URL from the playlist
curl "http://127.0.0.1:3001/api/stream/proxy?url=..." -o naruto-ep1-segments/seg_0000.ts
curl "http://127.0.0.1:3001/api/stream/proxy?url=..." -o naruto-ep1-segments/seg_0001.ts
# ... repeat for all segments
```

### 6. Concatenate Segments with FFmpeg

Create a concat file listing all segments:
```
file 'naruto-ep1-segments/seg_0000.ts'
file 'naruto-ep1-segments/seg_0001.ts'
file 'naruto-ep1-segments/seg_0002.ts'
...
```

Then use ffmpeg to concatenate:
```bash
ffmpeg -f concat -safe 0 -i naruto-ep1-concat.txt -c copy naruto-ep1-full.mp4
```

## Automated Script

The `download_full_episode.js` script automates this entire process:

```javascript
import ffmpeg from 'ffmpeg-static';
import { exec } from 'child_process';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';

const segmentsFile = 'tests/test-files/naruto-ep1-segments.m3u8';
const outputDir = 'tests/test-files/naruto-ep1-segments';
const outputFile = 'tests/naruto-ep1-full.mp4';

// Read segments from playlist
const content = await readFile(segmentsFile, 'utf-8');
const lines = content.split('\n');

const segmentUrls = lines
  .filter(line => line.startsWith('http://127.0.0.1:3001/api/stream/proxy?url='))
  .map(line => line.trim());

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
      if (error) reject(error);
      else resolve();
    });
  });
}

// Create concat file
const concatFile = 'tests/test-files/naruto-ep1-concat.txt';
const concatContent = segmentUrls.map((_, i) => 
  `file 'naruto-ep1-segments/seg_${String(i).padStart(4, '0')}.ts'`
).join('\n');

await writeFile(concatFile, concatContent);

// Concatenate with ffmpeg
await new Promise((resolve, reject) => {
  exec(`cd tests/test-files && "${ffmpeg}" -f concat -safe 0 -i "naruto-ep1-concat.txt" -c copy "../naruto-ep1-full.mp4"`, (error) => {
    if (error) reject(error);
    else resolve();
  });
});
```

## Example Result

**Naruto Episode 1:**
- Segments: 138
- Total size: ~94 MB
- Output: `tests/naruto-ep1-full.mp4`

## Notes

- **Blocked CDNs**: `flixcloud.cc`, `rabbitstream.net` are blocked by Cloudflare and return HTML error pages
- **Working CDNs**: `echovideo.to` domains work reliably
- **Proxy routing**: Blocked domains are routed through remote proxy (allorigins.win) but may still fail
- **Segment caching**: The API has a 50MB LRU cache for segments to improve performance
- **Token expiration**: HLS tokens expire, so segments must be downloaded promptly after getting the manifest

## Troubleshooting

**Error: Non-manifest body rejected**
- The CDN returned HTML instead of HLS content (Cloudflare block)
- Try a different anime or server

**Error: TLS wrong version number**
- The CDN has TLS issues with the server
- Domains in `ISP_BLOCKED_DOMAINS` are routed through remote proxy

**Empty segments file**
- The manifest URL expired or is invalid
- Get a fresh streaming URL from the API
