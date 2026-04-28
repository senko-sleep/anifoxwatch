import axios from 'axios';
import * as cheerio from 'cheerio';

async function run() {
  const iframeUrl = 'https://anikai.to/iframe/Ksf-sOWq_1C7hntHyI7D-mpY4MJRzTuX6sYo2Hl2cRT41Q_CtK2ywR8';
  
  const r1 = await axios.get(iframeUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  });
  console.log('iframe HTML (first 800 chars):\n', r1.data?.substring(0, 800));
  
  // Try to find iframe src
  const $ = cheerio.load(r1.data);
  const iframeSrc = $('iframe').attr('src');
  console.log('\niframe src:', iframeSrc);
  
  if (iframeSrc) {
    // Fetch the actual megaup media
    const mediaUrl = iframeSrc.replace('/e/', '/media/');
    console.log('media URL:', mediaUrl);
    const r2 = await axios.get(mediaUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    }).catch((e: any) => ({ error: e.message, data: e.response?.data?.toString?.()?.substring(0, 200) }));
    console.log('media response:', JSON.stringify((r2 as any).data ?? r2).substring(0, 400));
  }
}
run().catch((e: any) => console.error('FATAL:', e.message));
