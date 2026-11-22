const httpError = require('./httpError');

const fold = (text) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const variants = new Map();

// Expand Latin letters at query time so existing names need no migration.
for (const [start, end] of [[0x00c0, 0x024f], [0x1e00, 0x1eff]]) {
  for (let point = start; point <= end; point++) {
    const letter = String.fromCodePoint(point);
    const base = fold(letter);
    if (!/^[a-z]$/.test(base) || base === letter.toLowerCase()) continue;
    variants.set(base, (variants.get(base) ?? base) + letter);
  }
}

function playerNameSearch(query) {
  if (query === undefined) return null;
  if (typeof query !== 'string' || query.length > 80 || /\p{Cc}/u.test(query)) {
    throw httpError(400, 'q must be a plain string of at most 80 characters');
  }
  const text = fold(query.trim().replace(/\s+/g, ' '));
  if (!text) return null;
  const pattern = Array.from(text, (char) => {
    if (variants.has(char)) return '[' + variants.get(char) + ']\\p{M}*';
    if (char === ' ') return '\\s+';
    return char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('');
  return { $regex: pattern, $options: 'i' };
}

module.exports = playerNameSearch;
