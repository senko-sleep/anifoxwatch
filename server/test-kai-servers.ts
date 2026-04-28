import { ANIME } from '@consumet/extensions';
import axios from 'axios';

async function run() {
  const p = new ANIME.AnimeKai();
  
  console.log('Searching...');
  const s = await p.search('One Punch Man');
  console.log('results:', s.results?.length);
  const animeId = s.results[0].id;
  
  console.log('Getting info for', animeId);
  const info = await p.fetchAnimeInfo(animeId);
  const ep = info.episodes?.[0];
  console.log('ep id:', ep?.id);
  
  console.log('Getting servers...');
  const servers = await p.fetchEpisodeServers(ep.id);
  console.log('servers count:', servers?.length);
  for (const sv of (servers || [])) {
    console.log('  server:', sv.name, '| url:', (sv.url || '').substring(0, 80));
  }
  
  if (servers?.length) {
    const sv = servers[0];
    const mediaUrl = sv.url?.replace('/e/', '/media/');
    console.log('Fetching media URL:', mediaUrl?.substring(0, 80));
    const r = await axios.get(mediaUrl!, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    }).catch((e: any) => ({ error: e.message, status: e.response?.status, data: e.response?.data }));
    console.log('Media response:', JSON.stringify((r as any).data ?? r).substring(0, 300));
  }
}

run().catch((e: any) => console.error('FATAL:', e.message));
