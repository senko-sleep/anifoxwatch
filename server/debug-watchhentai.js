const fs = require('fs');
const content = fs.readFileSync('src/sources/watchhentai-source.ts', 'utf8');
const lines = content.split('\n');
for (let i = 0; i < 20; i++) {
  console.log(`${i + 1}: ${JSON.stringify(lines[i])}`);
}
console.log('\n---');
const classStart = content.indexOf('class WatchHentaiSource');
console.log('class at pos:', classStart, 'context:', JSON.stringify(content.substring(classStart - 30, classStart + 80)));
