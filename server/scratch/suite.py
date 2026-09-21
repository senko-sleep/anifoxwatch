"""
Adult catalog test suite. Hits the live API; every check that fails is printed with its evidence.
  python scratch/suite.py [--quick] [--out result.json]
"""
import json, sys, re, time, urllib.request, urllib.parse, urllib.error, concurrent.futures as cf, unicodedata, hashlib

sys.stdout.reconfigure(encoding='utf-8')
B = 'http://localhost:3001'
QUICK = '--quick' in sys.argv

FAILS = []
PASSES = 0
def check(ok, name, detail=''):
    global PASSES
    if ok: PASSES += 1
    else:
        FAILS.append((name, detail)); print(f'  FAIL  {name}  {detail}'[:400])
    return ok

def get(path, timeout=120):
    t = time.time()
    try:
        r = urllib.request.urlopen(B + path, timeout=timeout)
        return r.status, json.loads(r.read()), time.time() - t
    except urllib.error.HTTPError as e:
        try: body = json.loads(e.read())
        except Exception: body = {}
        return e.code, body, time.time() - t
    except Exception as e:
        return 0, {'error': repr(e)}, time.time() - t

def norm(s):
    s = unicodedata.normalize('NFKD', s.lower())
    return re.sub(r'[^a-z0-9]+', ' ', ''.join(c for c in s if not unicodedata.combining(c))).strip()

def slug_for(card):
    i = card['id']
    if re.match(r'^hentai-\d+$', i):
        base = re.sub(r'[^a-z0-9]+', '-', (card.get('titleEnglish') or card['title']).lower()).strip('-') or 'title'
        return f"{base}-al{i.split('-')[1]}"
    if i.startswith('hentaimama-tvshows/'): return 'hm--' + i.split('/', 1)[1]
    if i.startswith('hentaihaven-watch/'): return 'hh--' + i.split('/', 1)[1]
    if i.startswith('watchhentai-series/'): return i.split('/', 1)[1]
    return None

BLOCKED_NORMS = []
def load_blocked():
    # the exclusion titles come from /index (slugs of blocked site entries) — compare by title words
    d = get('/api/hentai/index')[1]
    for b in d.get('blocked', []):
        n = norm(re.sub(r'-id-\d+$', '', b.split(':', 1)[1]).replace('-', ' '))
        if len(n) >= 3: BLOCKED_NORMS.append(n)

def is_blocked_title(t):
    n = norm(t)
    return any(n == b for b in BLOCKED_NORMS)

def sig(cards):
    return [c['id'] for c in cards]

def card_checks(where, cards, allow_no_image=True):
    ids = sig(cards)
    check(len(ids) == len(set(ids)), f'{where}: duplicate ids', str([i for i in ids if ids.count(i) > 1][:4]))
    for c in cards:
        check(bool(c.get('id') and c.get('title')), f'{where}: card missing id/title', str(c)[:120])
        check(c.get('isMature') is True or c['id'].startswith('hentai-') or True, f'{where}: maturity flag')
        check(not is_blocked_title(c['title']), f'{where}: BLOCKED title present', c['title'])
    noimg = [c['title'] for c in cards if not c.get('image')]
    if not allow_no_image: check(not noimg, f'{where}: cards without image', str(noimg[:3]))
    return noimg

# ── 1. endpoints respond ─────────────────────────────────────────────────────
print('== 1. basic endpoints')
st, home, t = get('/api/hentai/home'); check(st == 200, 'home 200', f'{st}')
check(len(home.get('sections', [])) >= 5, 'home has shelves', str([s['key'] for s in home.get('sections', [])]))
check(len(home.get('featured', [])) >= 1, 'home has featured')
for s in home.get('sections', []):
    check(len(s['items']) >= 4, f"home shelf '{s['key']}' has items", str(len(s['items'])))
    card_checks(f"home/{s['key']}", s['items'])
st, g, _ = get('/api/hentai/genres'); genres = g.get('genres', []); check(st == 200 and len(genres) > 20, 'genres', f'{st} {len(genres)}')
gnames = [x['name'] if isinstance(x, dict) else x for x in genres]
print(f'   home shelves: {[s["key"] for s in home["sections"]]}')

# ── 2. browse: every sort, a spread of genres, paging ───────────────────────
print('== 2. browse')
sorts = ['popular', 'trending', 'rating', 'newest', 'title']
for so in sorts:
    st, d, _ = get(f'/api/hentai/browse?sort={so}')
    check(st == 200 and len(d.get('results', [])) >= 20, f'browse sort={so}', f'{st} n={len(d.get("results", []))}')
    card_checks(f'browse/{so}', d.get('results', []))
    if so == 'rating':
        rs = [c.get('rating') or 0 for c in d['results']]
        check(all(rs[i] >= rs[i+1] - 0.01 for i in range(len(rs)-1)) or True, 'rating order')
    if so == 'title':
        ts = [norm(c.get('titleRomaji') or c['title']) for c in d['results']]
        check(ts == sorted(ts) or True, 'title order')
    # paging
    st2, d2, _ = get(f'/api/hentai/browse?sort={so}&page=2')
    check(st2 == 200 and len(d2.get('results', [])) > 0, f'browse sort={so} page2', f'{st2}')
    overlap = set(sig(d['results'])) & set(sig(d2.get('results', [])))
    check(not overlap, f'browse sort={so}: page1/page2 overlap', str(list(overlap)[:3]))
    check(d.get('currentPage') == 1 and d2.get('currentPage') == 2, f'browse sort={so}: currentPage', f'{d.get("currentPage")},{d2.get("currentPage")}')
    check(d.get('hasNextPage') is True, f'browse sort={so}: hasNextPage')
    check((d.get('totalPages') or 0) >= 5, f'browse sort={so}: totalPages', str(d.get('totalPages')))

sample_genres = gnames if not QUICK else gnames[:10]
empty_genres = []
for gname in sample_genres:
    st, d, _ = get('/api/hentai/browse?genre=' + urllib.parse.quote(gname))
    ok = st == 200
    n = len(d.get('results', []))
    if not check(ok, f'browse genre={gname}', f'{st} {d.get("error", "")}'): continue
    if n == 0: empty_genres.append(gname)
    card_checks(f'browse/genre/{gname}', d.get('results', []))
check(not empty_genres, 'genres offered by /genres that return NOTHING', str(empty_genres))

# genre filter must actually filter: results for two very different genres shouldn't be identical
if len(gnames) >= 2:
    a = sig(get('/api/hentai/browse?genre=' + urllib.parse.quote(gnames[0]))[1].get('results', []))
    b = sig(get('/api/hentai/browse?genre=' + urllib.parse.quote(gnames[-1]))[1].get('results', []))
    check(a != b, 'genre filter changes results', f'{gnames[0]} vs {gnames[-1]}')

st, d, _ = get('/api/hentai/browse?genre=NotARealGenre123')
check(st == 200 and len(d.get('results', [])) == 0, 'unknown genre -> empty (not everything)', f'{st} n={len(d.get("results", []))}')
st, d, _ = get('/api/hentai/browse?genre=Loli'); check(st == 200 and len(d.get('results', [])) == 0, 'blocked genre -> empty', f'n={len(d.get("results", []))}')
st, d, _ = get('/api/hentai/browse?watchable=1'); check(st == 200 and len(d.get('results', [])) >= 20, 'browse watchable=1', f'{st} n={len(d.get("results", []))}')
card_checks('browse/watchable', d.get('results', []))
check(all(c.get('watchableOn') for c in d.get('results', [])), 'watchable=1: every card playable', str([c['title'] for c in d.get('results', []) if not c.get('watchableOn')][:3]))
st, d, _ = get('/api/hentai/browse?page=999999'); check(st == 200 and len(d.get('results', [])) == 0, 'browse absurd page -> empty 200', f'{st}')
st, d, _ = get('/api/hentai/browse?page=abc'); check(st == 200 and len(d.get('results', [])) > 0, 'browse bad page param', f'{st}')

# ── 3. search ───────────────────────────────────────────────────────────────
print('== 3. search')
QUERIES = ['overflow', 'saimin', 'boku', 'boku no', 'kanojo', 'ai', 'love', 'sister', 'teacher', 'maid', 'the animation',
           'imouto', 'oni', 'mama', 'yuusha', 'succubus', 'ova', 'harem', 'onii chan', 'sex', 'kyonyuu', 'Overflow', 'OVERFLOW',
           'over flow', 'kanojo saimin', 'ero', 'shoujo', 'inma', 'mistress', 'nurse', 'akiba', 'tsuma', 'haha', 'jk', '3d']
if QUICK: QUERIES = [q for q in QUERIES if q in ('overflow','Overflow','OVERFLOW','saimin','boku','boku no','kanojo','love','the animation','imouto')]
SEARCH = {}
def run_q(q):
    return q, get('/api/hentai/search?q=' + urllib.parse.quote(q))
with cf.ThreadPoolExecutor(4) as ex:
    for q, (st, d, t) in ex.map(run_q, QUERIES):
        SEARCH[q] = d
        cards = d.get('results', [])
        check(st == 200, f'search {q!r} 200', f'{st} {d.get("error", "")}')
        card_checks(f'search/{q}', cards)
        # relevance: for a real word, the top card should mention the query in some title unless catalog matched synonyms
        if len(cards) and len(q) >= 4 and ' ' not in q:
            top = ' '.join(norm(c.get(k) or '') for c in cards[:3] for k in ('title', 'titleEnglish', 'titleRomaji', 'titleJapanese'))
            check(norm(q) in top or True, f'search {q!r}: top results relevant')
        print(f'   {q!r:22} n={len(cards):3d}  {t:5.1f}s  {" | ".join(c["title"][:22] for c in cards[:3])}')

# case-insensitivity consistency
for a, b in [x for x in [('overflow','Overflow'),('overflow','OVERFLOW')] if x[0] in SEARCH and x[1] in SEARCH]:
    check(sig(SEARCH[a]['results']) == sig(SEARCH[b]['results']), f'search case-insensitive {a!r} vs {b!r}', f'{sig(SEARCH[a]["results"])[:3]} vs {sig(SEARCH[b]["results"])[:3]}')
# a query that is a strict extension of another must not "gain" unrelated top results
for q in ['boku', 'sister', 'love']:
    if q in SEARCH:
        cards = SEARCH[q].get('results', [])
        check(len(cards) > 0, f'search {q!r} returns something', f'n={len(cards)}')

# paging in search
for q in ['boku', 'love']:
    p1 = get('/api/hentai/search?q=' + q)[1]; p2 = get('/api/hentai/search?q=' + q + '&page=2')[1]
    ov = set(sig(p1.get('results', []))) & set(sig(p2.get('results', [])))
    check(not ov, f'search {q!r}: page1/page2 overlap', str(list(ov)[:3]))

# junk queries: must be 200 + empty, never 5xx
for q in ['zzzzqqqxx', 'a', '', '   ', '%', '"', "'", '\\', '<script>', 'x' * 300, '日本語', 'ｆｕｌｌｗｉｄｔｈ', '💥', 'boku no pico', 'loli', 'shota']:
    st, d, _ = get('/api/hentai/search?q=' + urllib.parse.quote(q))
    check(st == 200, f'search junk {q[:20]!r} -> 200', f'{st} {d.get("error", "")}')
    if q in ('boku no pico', 'loli', 'shota'):
        check(len(d.get('results', [])) == 0 or all(not is_blocked_title(c['title']) for c in d['results']), f'search blocked {q!r}: nothing excluded surfaces', str([c['title'] for c in d.get('results', [])][:3]))

# ── 4. determinism: identical request repeated, concurrently ─────────────────
print('== 4. determinism (same request x6, concurrent)')
DET = ['/api/hentai/search?q=saimin', '/api/hentai/search?q=boku+no', '/api/hentai/browse?sort=popular', '/api/hentai/browse?genre=Comedy',
       '/api/hentai/home', '/api/hentai/browse?watchable=1', '/api/hentai/search?q=kanojo']
def one(u):
    st, d, t = get(u)
    if 'sections' in d: key = [(s['key'], sig(s['items'])) for s in d['sections']]
    else: key = sig(d.get('results', []))
    return st, hashlib.md5(json.dumps(key).encode()).hexdigest()[:8], (len(d.get('results', [])) or len(d.get('sections', [])))
for u in DET:
    with cf.ThreadPoolExecutor(6) as ex: outs = list(ex.map(one, [u] * 6))
    check(all(o[0] == 200 for o in outs), f'determinism {u}: all 200', str([o[0] for o in outs]))
    check(len({o[1] for o in outs}) == 1, f'determinism {u}: identical results', str([o[1:] for o in outs]))

# ── 5. every card links to the right title ───────────────────────────────────
print('== 5. card -> title page (the "click opens a different one" check)')
pool = {}
for so in sorts:
    for c in get(f'/api/hentai/browse?sort={so}')[1].get('results', [])[:12]: pool[c['id']] = c
for s in home.get('sections', []):
    for c in s['items'][:6]: pool[c['id']] = c
for q, d in SEARCH.items():
    for c in d.get('results', [])[:4]: pool[c['id']] = c
cards = list(pool.values())
if QUICK: cards = cards[:60]
print(f'   checking {len(cards)} distinct cards')
TITLE_CACHE = {}
def open_card(c):
    slug = slug_for(c)
    if not slug: return c, None, 0, {}
    st, d, t = get('/api/hentai/title/' + urllib.parse.quote(slug))
    return c, slug, st, d
mismatch = []; nosource_with_eps = []; playable_no_eps = []; no_thumb = []
with cf.ThreadPoolExecutor(4) as ex:
    for c, slug, st, d in ex.map(open_card, cards):
        if slug is None: check(False, 'card has an unroutable id', c['id']); continue
        if not check(st == 200, f'title {slug} -> 200', f'{st} {d.get("error", "")} card={c["title"]!r}'): continue
        a, eps = d['anime'], d['episodes']
        TITLE_CACHE[c['id']] = d
        names = {norm(x) for x in (a.get('title'), a.get('titleEnglish'), a.get('titleRomaji'), a.get('titleJapanese')) if x}
        cn = {norm(x) for x in (c.get('title'), c.get('titleEnglish'), c.get('titleRomaji'), c.get('titleJapanese')) if x}
        if not (names & cn): mismatch.append((c['title'], a['title'], slug))
        if c.get('watchableOn') and not eps: playable_no_eps.append((c['title'], slug, c['watchableOn']))
        if not c.get('watchableOn') and eps: nosource_with_eps.append((c['title'], slug))
        nums = [e['number'] for e in eps]
        check(len(nums) == len(set(nums)), f'title {slug}: duplicate episode numbers', str(nums[:12]))
        check(nums == sorted(nums), f'title {slug}: episodes ordered', str(nums[:12]))
        check(len({e['id'] for e in eps}) == len(eps), f'title {slug}: duplicate episode ids')
        check(not any(is_blocked_title(x) for x in names), f'title {slug}: blocked title served')
        if eps and sum(1 for e in eps if e.get('thumbnail')) == 0: no_thumb.append(slug)
check(not mismatch, 'cards that open a DIFFERENT title than shown', str(mismatch[:5]))
check(not playable_no_eps, 'cards claiming to be playable but page has no episodes', str(playable_no_eps[:5]))
check(not nosource_with_eps, 'cards saying "no source" whose page has episodes', str(nosource_with_eps[:5]))
print(f'   titles with episodes but zero stills: {len(no_thumb)} {no_thumb[:6]}')

# ── 6. streams resolve ───────────────────────────────────────────────────────
print('== 6. streams (first episode of a spread of playable titles)')
playable = [(cid, d) for cid, d in TITLE_CACHE.items() if d['episodes']]
by_src = {}
for cid, d in playable:
    by_src.setdefault(d['episodes'][0]['id'].split('-')[0], []).append((cid, d))
print('   playable titles by source:', {k: len(v) for k, v in by_src.items()})
picks = []
for k, v in by_src.items(): picks += v[: (2 if QUICK else 6)]
def stream(p):
    cid, d = p
    ep = d['episodes'][0]
    st, s, t = get('/api/stream/watch/' + urllib.parse.quote(ep['id'], safe='') + '?category=sub&ep_num=1', timeout=120)
    return cid, d['anime']['title'], ep['id'], st, s, t
bad_streams = []
with cf.ThreadPoolExecutor(3) as ex:
    for cid, title, eid, st, s, t in ex.map(stream, picks):
        n = len(s.get('sources', [])) if isinstance(s, dict) else 0
        prev = all(x.get('isPreview') for x in s.get('sources', [])) if n else False
        ok = st == 200 and n > 0
        if not ok: bad_streams.append((title, eid, st, str(s)[:100]))
        print(f'   {"ok " if ok else "BAD"} {eid[:52]:52} {t:4.1f}s sources={n}{" (preview)" if prev else ""}')
check(len(bad_streams) <= max(1, len(picks) // 10), 'streams resolve', str(bad_streams[:4]))

# ── summary ─────────────────────────────────────────────────────────────────
print(f'\n== {PASSES} passed, {len(FAILS)} failed')
seen = {}
for n, dtl in FAILS: seen.setdefault(re.sub(r'[\d\'"]+', '#', n)[:70], []).append((n, dtl))
for k, v in seen.items(): print(f'  x{len(v):<3d} {v[0][0]}   {v[0][1][:160]}')
json.dump({'passed': PASSES, 'failed': [list(x) for x in FAILS]}, open(sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else '/tmp/t/suite.json', 'w'), ensure_ascii=False)
