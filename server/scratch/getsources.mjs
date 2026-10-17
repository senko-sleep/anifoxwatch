const embed = process.argv[2];
const u = new URL(embed);
const m = u.pathname.match(/^\/(embed-\d+)\/([^/?]+)/);
const api = `${u.origin}/${m[1]}/getSources?id=${m[2]}`;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
for (const [name, h] of [
  ['bare', {}],
  ['ua', { 'User-Agent': UA }],
  ['ua+ref', { 'User-Agent': UA, Referer: embed }],
  ['ua+ref+xhr', { 'User-Agent': UA, Referer: embed, 'X-Requested-With': 'XMLHttpRequest' }],
]) {
  const t0 = Date.now();
  const r = await fetch(api, { headers: h });
  const t = await r.text();
  console.log(name, r.status, Date.now() - t0, 'ms', t.slice(0, 200));
  if (name === 'bare' && r.ok) {
    const src = JSON.parse(t).sources;
    for (const [n2, h2] of [['m3u8-bare', {}], ['m3u8-ref', { Referer: 'https://play.echovideo.ru/', 'User-Agent': UA }]]) {
      const r2 = await fetch(src, { headers: h2 });
      console.log('  ', n2, r2.status, (await r2.text()).slice(0, 160).replace(/\n/g, ' | '));
    }
  }
}
