// Player descriptions from Wikipedia. Not part of run-all: it needs Internet
// and only reads players already loaded by 03-players.
//
//   node scripts/etl/06-bios.js [--test-db] [--langs=es] [--only-missing] [--limit=N]
//
// --langs=es,en also uses the English article when there is no Spanish one.
// Matching is exact: Wikidata stores each player's Transfermarkt id (P2446).
// A player whose article is gone keeps their old description.
const Player = require('../../models/Player');
const { runStandalone } = require('./lib/common');
const wiki = require('./lib/wikipedia');

const SPARQL = 'https://query.wikidata.org/sparql';
const HEADERS = { 'user-agent': 'footboard-etl/0.1 (educational project)', accept: 'application/json' };
const BATCH = 250;
// Wikimedia throttles bursts (HTTP 429): one request at a time, at least
// GAP_MS apart, 20 articles per request, and a 429 waits its Retry-After.
const GAP_MS = 1000;
const MAX_ATTEMPTS = 6;
const WRITE_BATCH = 500;
const TIMEOUT_MS = 30000; // per request; a hung connection is retried

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readBioOptions(argv = process.argv.slice(2)) {
  const get = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const limit = get('limit');
  if (limit !== undefined && !/^\d+$/.test(limit)) throw new Error('--limit must be a positive integer');
  return { langs: wiki.parseLangs(get('langs')), onlyMissing: argv.includes('--only-missing'), limit: limit ? Number(limit) : null };
}

// GET JSON, paced and shared by all workers. Retries network errors, 429 and
// 5xx with backoff (or the server's Retry-After). 404 -> null.
function pacedGetJson(fetchFn, { delayMs, gapMs }) {
  let nextAt = 0;
  const backoff = (attempt) => Math.min(delayMs * 2 ** (attempt - 1), 60000);
  return async function getJson(url) {
    for (let attempt = 1; ; attempt++) {
      const wait = nextAt - Date.now();
      nextAt = Math.max(Date.now(), nextAt) + gapMs;
      if (wait > 0) await sleep(wait);
      let res;
      try {
        res = await fetchFn(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
      } catch (err) {
        if (attempt >= MAX_ATTEMPTS) throw err;
        await sleep(backoff(attempt));
        continue;
      }
      if (res.status === 404) return null;
      if (res.ok) return await res.json();
      if ((res.status !== 429 && res.status < 500) || attempt >= MAX_ATTEMPTS) throw new Error(`HTTP ${res.status}`);
      const retryAfter = Number(res.headers?.get?.('retry-after'));
      const pause = retryAfter > 0 ? Math.min(retryAfter * 1000, 120000) : backoff(attempt);
      if (res.status === 429) nextAt = Math.max(nextAt, Date.now() + pause);
      await sleep(pause);
    }
  };
}

async function loadBios({ langs = ['es'], onlyMissing = false, limit = null, fetch: fetchFn = fetch, delayMs = 2000, gapMs = GAP_MS } = {}) {
  const getJson = pacedGetJson(fetchFn, { delayMs, gapMs });
  const filter = { 'externalIds.transfermarkt': { $type: 'string' } };
  if (onlyMissing) filter['bio.text'] = { $exists: false };
  let query = Player.find(filter, { 'externalIds.transfermarkt': 1, bio: 1 }).sort({ currentValue: -1 }).lean();
  if (limit) query = query.limit(limit);
  const players = await query;
  console.log(`bios: ${players.length} players · languages ${langs.join(', ')}`);

  const stats = { read: players.length, updated: 0, unchanged: 0, discarded: {} };
  const discard = (reason) => { stats.discarded[reason] = (stats.discarded[reason] || 0) + 1; };

  // 1. Wikidata: Transfermarkt id -> article, in batches.
  const articles = new Map();
  for (let i = 0; i < players.length; i += BATCH) {
    const ids = players.slice(i, i + BATCH).map((p) => p.externalIds.transfermarkt);
    const json = await getJson(`${SPARQL}?query=${encodeURIComponent(wiki.sparqlQuery(ids, langs))}`);
    for (const [tm, found] of wiki.parseSparql(json, langs)) articles.set(tm, found);
    if (players.length > BATCH) console.log(`  wikidata ${Math.min(i + BATCH, players.length)}/${players.length}`);
  }

  // 2. Wikipedia: intro of each article, 20 per request, grouped by language.
  const wanted = new Map(); // lang -> Map(title -> [player ids])
  for (const player of players) {
    const found = articles.get(player.externalIds.transfermarkt);
    if (found === undefined) discard('not in wikidata');
    else if (found === 'ambiguous') discard('several wikidata items');
    else if (found === null) discard(`no article in ${langs.join('/')}`);
    else {
      const byTitle = wanted.get(found.lang) ?? wanted.set(found.lang, new Map()).get(found.lang);
      const title = wiki.titleFromArticle(found.article);
      byTitle.set(title, [...(byTitle.get(title) ?? []), player._id]);
    }
  }

  const ops = [];
  const flush = async () => {
    if (!ops.length) return;
    const res = await Player.bulkWrite(ops.splice(0), { ordered: false });
    stats.updated += res.modifiedCount;
    stats.unchanged += res.matchedCount - res.modifiedCount;
  };
  const total = [...wanted.values()].reduce((n, m) => n + m.size, 0);
  let done = 0;
  for (const [lang, byTitle] of wanted) {
    const titles = [...byTitle.keys()];
    for (let i = 0; i < titles.length; i += wiki.EXTRACTS_PER_REQUEST) {
      const chunk = titles.slice(i, i + wiki.EXTRACTS_PER_REQUEST);
      let bios;
      try {
        const json = await getJson(wiki.extractsUrl(lang, chunk));
        if (json?.error) throw new Error(json.error.code ?? 'API error');
        bios = wiki.parseExtracts(json, lang, chunk);
      } catch (err) {
        for (const t of chunk) for (const _ of byTitle.get(t)) discard('wikipedia error');
        console.warn(`  ${lang} ${chunk[0]}…: ${err.message}`);
        continue;
      }
      for (const t of chunk) {
        const bio = bios.get(t);
        for (const id of byTitle.get(t)) {
          if (!bio) discard('not a plain article');
          else if (new Player({ name: 'x', position: 'FW', bio }).validateSync()) discard('validation');
          else ops.push({ updateOne: { filter: { _id: id }, update: { $set: { bio } } } });
        }
      }
      if (ops.length >= WRITE_BATCH) await flush();
      done += chunk.length;
      if (done % 500 < wiki.EXTRACTS_PER_REQUEST || done === total) console.log(`  wikipedia ${done}/${total}`);
    }
  }
  await flush();

  const list = Object.entries(stats.discarded).map(([r, n]) => `${r} ${n}`).join(' · ') || 'none';
  console.log(`bios: ${stats.read} read · ${stats.updated} updated · ${stats.unchanged} unchanged`);
  console.log(`  without description: ${list}`);
  return stats;
}

module.exports = { loadBios, readBioOptions };
if (require.main === module) runStandalone(() => loadBios(readBioOptions()));
