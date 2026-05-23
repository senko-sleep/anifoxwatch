import fs from 'fs';
const content = fs.readFileSync('src/sources/watchhentai-source.ts', 'utf8');
// Show positions 560-600
for (let p = 560; p <= 600; p++) {
  console.log('pos', p, ':', JSON.stringify(content.charAt(p)), 'hex:', content.charCodeAt(p).toString(16));
}
