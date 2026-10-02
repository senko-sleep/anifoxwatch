import { zipSync } from 'fflate';

export interface EpisodeZipEntry {
  number: number;
  data: Uint8Array;
}

export async function fetchEpisodeVideo(url: string, signal?: AbortSignal): Promise<Uint8Array> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Video request failed (${response.status})`);
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.startsWith('video/') && !contentType.includes('octet-stream')) {
    throw new Error('The provider did not return a video file. Try another server.');
  }
  const data = new Uint8Array(await response.arrayBuffer());
  if (!data.length) throw new Error('The provider returned an empty video file.');
  return data;
}

export function buildEpisodeZip(animeTitle: string, episodes: EpisodeZipEntry[]): Blob {
  const folder = animeTitle.replace(/[\\/:*?"<>|]/g, '').trim() || 'Episodes';
  const files: Record<string, Uint8Array> = {};
  for (const episode of [...episodes].sort((a, b) => a.number - b.number)) {
    files[`${folder}/Episode ${String(episode.number).padStart(2, '0')}.mp4`] = episode.data;
  }
  return new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' });
}
