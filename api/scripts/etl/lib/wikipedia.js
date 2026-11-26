// Pure helpers for 06-bios: Wikidata maps each Transfermarkt player id
// (property P2446) to its Wikipedia articles, and the Wikipedia Action API
// (TextExtracts) gives the lead of up to 20 articles per request. No I/O here,
// so it is unit tested.

const LANGS = ['es', 'en'];
const WIKIPEDIA_ARTICLE = /^https:\/\/(?:es|en)\.wikipedia\.org\/wiki\/[^\s?#]+$/;
const MAX_BIO = 2000;
const EXTRACTS_PER_REQUEST = 20; // TextExtracts' limit for intros

// --langs=es (default) or --langs=es,en (first language wins).
function parseLangs(value) {
  const langs = (value || 'es').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const unknown = langs.filter((l) => !LANGS.includes(l));
  if (!langs.length || unknown.length) throw new Error(`Invalid --langs. Allowed: ${LANGS.join(', ')}`);
  return [...new Set(langs)];
}

// SPARQL for a batch of Transfermarkt ids. Ids are digits only, so they are
// safe to inline.
function sparqlQuery(tmIds, langs) {
  const ids = tmIds.filter((id) => /^\d+$/.test(id));
  if (!ids.length) throw new Error('No valid Transfermarkt ids');
  const values = ids.map((id) => `"${id}"`).join(' ');
  const optionals = langs
    .map((l) => `OPTIONAL { ?${l} schema:about ?item ; schema:isPartOf <https://${l}.wikipedia.org/> }`)
    .join(' ');
  return `SELECT ?tm ${langs.map((l) => `?${l}`).join(' ')} WHERE { VALUES ?tm { ${values} } ?item wdt:P2446 ?tm . ${optionals} }`;
}

// SPARQL JSON -> Map(tmId -> { lang, article }) with the preferred language.
// A tm id linked to several Wikidata items is ambiguous and left out.
function parseSparql(json, langs) {
  const seen = new Map();
  for (const b of json?.results?.bindings ?? []) {
    const tm = b.tm?.value;
    if (!tm) continue;
    const lang = langs.find((l) => WIKIPEDIA_ARTICLE.test(b[l]?.value ?? ''));
    const found = lang ? { lang, article: b[lang].value } : null;
    const prev = seen.get(tm);
    if (prev === undefined) seen.set(tm, found);
    else if (prev?.article !== found?.article) seen.set(tm, 'ambiguous');
  }
  return seen;
}

// Article URL <-> page title ("Kylian_Mbapp%C3%A9" <-> "Kylian Mbappé").
function titleFromArticle(article) {
  return decodeURIComponent(new URL(article).pathname.slice('/wiki/'.length)).replace(/_/g, ' ');
}
function articleUrl(lang, title) {
  return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
}

// One Action API request for the plain-text intro of up to 20 titles.
function extractsUrl(lang, titles) {
  if (!LANGS.includes(lang) || !titles.length || titles.length > EXTRACTS_PER_REQUEST) throw new Error('Invalid extracts request');
  const params = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', prop: 'extracts|pageprops', ppprop: 'disambiguation',
    exintro: '1', explaintext: '1', exlimit: String(EXTRACTS_PER_REQUEST), redirects: '1', titles: titles.join('|'),
  });
  return `https://${lang}.wikipedia.org/w/api.php?${params}`;
}

// First paragraph of an intro, cut at a sentence if it is too long.
function bioFromText(extract, url, lang) {
  const paragraph = typeof extract === 'string' ? extract.split(/\n+/).map((p) => p.trim()).find(Boolean) : '';
  // Zero-width spaces are left where the references were.
  const text = (paragraph ?? '').replace(/[​-‍﻿]/g, '').replace(/\s+/g, ' ').trim();
  if (!text || !WIKIPEDIA_ARTICLE.test(url ?? '')) return null;
  if (text.length <= MAX_BIO) return { text, url, lang };
  const cut = text.slice(0, MAX_BIO);
  const end = cut.lastIndexOf('. ');
  return { text: end > 0 ? cut.slice(0, end + 1) : `${cut.slice(0, MAX_BIO - 1)}…`, url, lang };
}

// Action API answer -> Map(requested title -> bio or null), following the
// title normalizations and redirects the API reports.
function parseExtracts(json, lang, titles) {
  const q = json?.query ?? {};
  const hop = new Map([...(q.normalized ?? []), ...(q.redirects ?? [])].map((r) => [r.from, r.to]));
  const pages = new Map((q.pages ?? []).map((p) => [p.title, p]));
  const out = new Map();
  for (const title of titles) {
    let t = title;
    for (let i = 0; i < 3 && hop.has(t); i++) t = hop.get(t);
    const page = pages.get(t);
    const plain = page && !page.missing && !page.invalid && !Object.hasOwn(page.pageprops ?? {}, 'disambiguation'); // its value is ""
    out.set(title, plain ? bioFromText(page.extract, articleUrl(lang, page.title), lang) : null);
  }
  return out;
}

module.exports = {
  LANGS, WIKIPEDIA_ARTICLE, MAX_BIO, EXTRACTS_PER_REQUEST,
  parseLangs, sparqlQuery, parseSparql, titleFromArticle, articleUrl, extractsUrl, bioFromText, parseExtracts,
};
