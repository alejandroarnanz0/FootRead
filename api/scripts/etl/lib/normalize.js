// Pure normalization helpers shared by the ETL scripts. No I/O, easy to test.

const POSITIONS = {
  Goalkeeper: 'GK',
  Defender: 'DF',
  Midfield: 'MF',
  Attack: 'FW',
};

const FEET = new Set(['left', 'right', 'both']);

// Readable names: Transfermarkt only gives slugs like "laliga".
const COMPETITION_NAMES = {
  ES1: 'LaLiga',
  GB1: 'Premier League',
  IT1: 'Serie A',
  L1: 'Bundesliga',
  FR1: 'Ligue 1',
};

// Empty strings become null so missing fields are not stored as "".
function blank(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

// Trims and collapses inner whitespace.
function cleanName(value) {
  const s = blank(value);
  return s === null ? null : s.replace(/\s+/g, ' ');
}

// "Attack" -> "FW". Unknown or "Missing" -> null (the player is discarded).
function position(value) {
  return POSITIONS[blank(value)] || null;
}

function foot(value) {
  const s = blank(value);
  return s && FEET.has(s.toLowerCase()) ? s.toLowerCase() : null;
}

// Heights outside 140-220 cm are data errors (there is one of 17 cm): drop the field.
function heightCm(value) {
  const n = toInt(value);
  return n !== null && n >= 140 && n <= 220 ? n : null;
}

function toInt(value) {
  const s = blank(value);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : null;
}

// "1978-06-09 00:00:00" or "2012-07-03" -> Date at UTC midnight.
function toDate(value) {
  const s = blank(value);
  if (s === null) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

// Transfermarkt stores the season start year: "2023" -> "2023-24".
function season(value) {
  const year = toInt(value);
  if (year === null || year < 1900) return null;
  return `${year}-${String((year + 1) % 100).padStart(2, '0')}`;
}

// Player portrait from the Transfermarkt CSV. Only their image host is
// accepted, and the generic silhouette (".../default.jpg") counts as no photo.
const TM_IMAGES = /^https:\/\/img\.a\.transfermarkt\.technology\/portrait\/[\w/.-]+\.(?:jpe?g|png|webp)(?:\?[\w=&.-]*)?$/i;
function imageUrl(value) {
  const s = blank(value);
  if (s === null || !TM_IMAGES.test(s) || /\/default\.(?:jpe?g|png)/i.test(s)) return null;
  return s;
}

module.exports = {
  imageUrl,
  TM_IMAGES,
  COMPETITION_NAMES,
  blank,
  cleanName,
  position,
  foot,
  heightCm,
  toInt,
  toDate,
  season,
};
