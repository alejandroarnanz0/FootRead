// Player descriptions from Wikipedia: the pure helpers, the 06-bios script
// (Wikidata and Wikipedia faked) and the API, against footboard_ci_test.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { startApi } = require('./helpers/apiServer');
const { wipe } = require('./helpers/testDb');
const Player = require('../models/Player');
const wiki = require('../scripts/etl/lib/wikipedia');
const { loadBios, readBioOptions } = require('../scripts/etl/06-bios');

const ES = 'https://es.wikipedia.org/wiki/Pedri';

describe('wikipedia helpers', () => {
  it('parses --langs and rejects unknown languages', () => {
    assert.deepEqual(wiki.parseLangs(undefined), ['es']);
    assert.deepEqual(wiki.parseLangs('es,en,es'), ['es', 'en']);
    assert.throws(() => wiki.parseLangs('fr'));
    assert.throws(() => readBioOptions(['--limit=abc']));
    assert.deepEqual(readBioOptions(['--only-missing', '--limit=5']), { langs: ['es'], onlyMissing: true, limit: 5 });
  });

  it('builds the query only with numeric ids', () => {
    const q = wiki.sparqlQuery(['683840', '"} DROP', '12'], ['es']);
    assert.match(q, /VALUES \?tm \{ "683840" "12" \}/);
    assert.match(q, /wdt:P2446/);
    assert.throws(() => wiki.sparqlQuery(['x'], ['es']));
  });

  it('picks the preferred language and drops ambiguous ids', () => {
    const json = { results: { bindings: [
      { tm: { value: '1' }, es: { value: ES }, en: { value: 'https://en.wikipedia.org/wiki/Pedri' } },
      { tm: { value: '2' }, en: { value: 'https://en.wikipedia.org/wiki/B' } },
      { tm: { value: '3' } },
      { tm: { value: '4' }, es: { value: 'https://es.wikipedia.org/wiki/A' } },
      { tm: { value: '4' }, es: { value: 'https://es.wikipedia.org/wiki/C' } },
      { tm: { value: '5' }, es: { value: 'https://evil.example/wiki/X' } },
    ] } };
    const es = wiki.parseSparql(json, ['es']);
    assert.deepEqual(es.get('1'), { lang: 'es', article: ES });
    assert.equal(es.get('2'), null);
    assert.equal(es.get('3'), null);
    assert.equal(es.get('4'), 'ambiguous');
    assert.equal(es.get('5'), null);
    assert.equal(wiki.parseSparql(json, ['es', 'en']).get('2').lang, 'en');
  });

  it('builds batched extract requests and maps titles both ways', () => {
    assert.equal(wiki.titleFromArticle('https://es.wikipedia.org/wiki/Kylian_Mbapp%C3%A9'), 'Kylian Mbappé');
    assert.equal(wiki.articleUrl('es', 'Kylian Mbappé'), 'https://es.wikipedia.org/wiki/Kylian_Mbapp%C3%A9');
    const url = new URL(wiki.extractsUrl('es', ['Pedri', 'Kylian Mbappé']));
    assert.equal(url.hostname, 'es.wikipedia.org');
    assert.equal(url.searchParams.get('titles'), 'Pedri|Kylian Mbappé');
    assert.equal(url.searchParams.get('exintro'), '1');
    assert.throws(() => wiki.extractsUrl('fr', ['A']));
    assert.throws(() => wiki.extractsUrl('es', Array(21).fill('A')));
  });

  it('keeps the first paragraph, and skips missing pages and disambiguations', () => {
    assert.deepEqual(wiki.bioFromText('  Pedri es   un futbolista.\n\nSegundo párrafo.', ES, 'es'),
      { text: 'Pedri es un futbolista.', url: ES, lang: 'es' });
    assert.equal(wiki.bioFromText('Juega en el Barça.​ Es internacional.​', ES, 'es').text, 'Juega en el Barça. Es internacional.');
    assert.equal(wiki.bioFromText('', ES, 'es'), null);
    assert.equal(wiki.bioFromText('Texto.', 'https://evil.example/x', 'es'), null);
    const long = wiki.bioFromText('Frase larga. '.repeat(300), ES, 'es');
    assert.ok(long.text.length <= wiki.MAX_BIO && long.text.endsWith('.'));

    const json = { query: {
      normalized: [{ from: 'Rodri_Hernández', to: 'Rodri Hernández' }],
      redirects: [{ from: 'Rodri Hernández', to: 'Rodrigo Hernández Cascante' }],
      pages: [
        { title: 'Rodrigo Hernández Cascante', extract: 'Rodri es un futbolista.' },
        { title: 'Pedri', extract: 'Pedri es un futbolista.' },
        { title: 'Juan', extract: 'Juan puede referirse a:', pageprops: { disambiguation: '' } },
        { title: 'Nadie', missing: true },
      ],
    } };
    const out = wiki.parseExtracts(json, 'es', ['Rodri_Hernández', 'Pedri', 'Juan', 'Nadie', 'Otro']);
    assert.equal(out.get('Rodri_Hernández').url, 'https://es.wikipedia.org/wiki/Rodrigo_Hern%C3%A1ndez_Cascante');
    assert.equal(out.get('Pedri').text, 'Pedri es un futbolista.');
    assert.equal(out.get('Juan'), null);
    assert.equal(out.get('Nadie'), null);
    assert.equal(out.get('Otro'), null);
  });
});

describe('06-bios and the API', () => {
  let srv;
  let pedri;
  let other;
  let calls;

  // Fake Wikidata + Wikipedia: 683840 has a Spanish article, 2 only English,
  // 3 is not in Wikidata.
  const fakeFetch = async (url) => {
    calls.push(url);
    const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
    if (url.startsWith('https://query.wikidata.org/')) {
      return json({ results: { bindings: [
        { tm: { value: '683840' }, es: { value: ES } },
        { tm: { value: '2' }, en: { value: 'https://en.wikipedia.org/wiki/Two' } },
      ] } });
    }
    const extracts = { 'es.wikipedia.org': { Pedri: 'Pedri es un futbolista español.' }, 'en.wikipedia.org': { Two: 'Two is a footballer.' } };
    const { hostname, pathname, searchParams } = new URL(url);
    if (pathname === '/w/api.php' && extracts[hostname]) {
      const pages = searchParams.get('titles').split('|')
        .map((title) => (extracts[hostname][title] ? { title, extract: extracts[hostname][title] } : { title, missing: true }));
      return json({ query: { pages } });
    }
    return json(null, 404);
  };

  before(async () => {
    srv = await startApi();
    await wipe(Player);
    [pedri, other] = await Player.create([
      { name: 'Pedri', position: 'MF', currentValue: 9e7, externalIds: { transfermarkt: '683840' } },
      { name: 'Two', position: 'DF', currentValue: 2e6, externalIds: { transfermarkt: '2' } },
      { name: 'Three', position: 'GK', currentValue: 1e6, externalIds: { transfermarkt: '3' } },
    ]);
  });

  after(async () => {
    await wipe(Player);
    await srv.close();
  });

  it('loads Spanish descriptions only, by Transfermarkt id', async () => {
    calls = [];
    const stats = await loadBios({ langs: ['es'], fetch: fakeFetch, delayMs: 1, gapMs: 0 });
    assert.equal(stats.updated, 1);
    assert.deepEqual(stats.discarded, { 'no article in es': 1, 'not in wikidata': 1 });
    assert.deepEqual((await Player.findById(pedri._id).lean()).bio,
      { text: 'Pedri es un futbolista español.', url: ES, lang: 'es' });
    assert.equal((await Player.findById(other._id).lean()).bio, undefined);
    assert.equal(calls.filter((u) => u.includes('/w/api.php')).length, 1);
  });

  it('is idempotent, and --only-missing skips players that already have one', async () => {
    assert.equal((await loadBios({ fetch: fakeFetch, delayMs: 1, gapMs: 0 })).unchanged, 1);
    const stats = await loadBios({ onlyMissing: true, fetch: fakeFetch, delayMs: 1, gapMs: 0 });
    assert.equal(stats.read, 2);
  });

  it('falls back to English with --langs=es,en', async () => {
    await loadBios({ langs: ['es', 'en'], onlyMissing: true, fetch: fakeFetch, delayMs: 1, gapMs: 0 });
    assert.equal((await Player.findById(other._id).lean()).bio.lang, 'en');
  });

  it('retries a Wikipedia error and counts it if it keeps failing', async () => {
    await Player.updateMany({}, { $unset: { bio: 1 } });
    let fails = 0;
    const flaky = async (url) => (url.includes('/w/api.php') ? (fails++, { ok: false, status: 503 }) : fakeFetch(url));
    const stats = await loadBios({ fetch: flaky, delayMs: 1, gapMs: 0 });
    assert.equal(stats.discarded['wikipedia error'], 1);
    assert.equal(fails, 6);
  });

  it('waits and retries when Wikipedia answers 429, and keeps the description', async () => {
    await Player.updateMany({}, { $unset: { bio: 1 } });
    let throttled = 0;
    const busy = async (url) => {
      if (url.includes('/w/api.php') && throttled < 2) {
        throttled++;
        return { ok: false, status: 429, headers: { get: (h) => (h === 'retry-after' ? '0.01' : null) } };
      }
      return fakeFetch(url);
    };
    const stats = await loadBios({ fetch: busy, delayMs: 1, gapMs: 0 });
    assert.equal(throttled, 2);
    assert.equal(stats.updated, 1);
    assert.equal(stats.discarded['wikipedia error'], undefined);
  });

  it('shows the description in the detail, not in the list, and the API cannot write it', async () => {
    await loadBios({ fetch: fakeFetch, delayMs: 1, gapMs: 0 });
    const one = await srv.api('GET', `/api/players/${pedri._id}`);
    assert.equal(one.body.bio.text, 'Pedri es un futbolista español.');
    const list = await srv.api('GET', '/api/players?sort=-currentValue');
    assert.equal(list.body.data[0].bio, undefined);
    const res = await srv.api('PUT', `/api/players/${pedri._id}`, { bio: { text: 'hack', url: ES, lang: 'es' } });
    assert.ok([200, 400].includes(res.status));
    assert.equal((await Player.findById(pedri._id).lean()).bio.text, 'Pedri es un futbolista español.');
  });

  it('rejects links that are not Wikipedia articles at the schema', () => {
    const bad = new Player({ name: 'X', position: 'MF', bio: { text: 't', url: 'https://evil.example/wiki/X', lang: 'es' } });
    assert.ok(bad.validateSync()?.errors['bio.url']);
  });
});
