import http from 'http';

// Test without specifying mode - let backend auto-detect hentai
http.get('http://localhost:3001/api/anime/resolve-slug?slug=a-kiss-for-the-petals-joined-in-love-with-you', (res) => {
  let data = '';
  res.on('data', chunk => { data += chunk; });
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log('Result:', JSON.stringify(json, null, 2));
    } catch (e) {
      console.log('Raw:', data);
    }
  });
}).on('error', (err) => {
  console.error('Error:', err);
});