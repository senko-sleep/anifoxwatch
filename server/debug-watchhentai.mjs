import fs from 'fs';
const content = fs.readFileSync('src/sources/watchhentai-source.ts', 'utf8');
// Find what's at 547 and 571
console.log('=== Around HC 547-571 ===');
console.log('Full text at HC[0] (547-571):', JSON.stringify(content.substring(547, 571)));
console.log('Full text at HC[1] (571-599):', JSON.stringify(content.substring(571, 599)));
console.log();
// Also look at nearby positions - show bytes
for (let p = 545; p <= 560; p++) {
  console.log('  pos', p, ':', JSON.stringify(content.charAt(p)));
}
console.log();
for (let p = 569; p <= 580; p++) {
  console.log('  pos', p, ':', JSON.stringify(content.charAt(p)));
}
