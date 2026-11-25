const { randomInt, randomUUID } = require('node:crypto');
const Player = require('../../models/Player');
const Valuation = require('../../models/Valuation');
const SeasonStat = require('../../models/SeasonStat');
const Club = require('../../models/Club');
const Competition = require('../../models/Competition');
const { recognition } = require('./recognition');

const games = ['value', 'age', 'goals', 'guess'];
const difficulties = ['easy', 'medium', 'hard'];
const DAY = 86400000;
const positions = { GK: 'Portero', DF: 'Defensa', MF: 'Centrocampista', FW: 'Delantero' };
const pick = (rows) => rows[randomInt(rows.length)];
const key = (row) => row.name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim();
const distinct = (a, b) => String(a._id) !== String(b._id) && key(a) !== key(b);
const day = (date) => date.toISOString().slice(0, 10);

async function loadPool(game) {
  const players = await Player.find(game === 'goals' ? {} : { lastSeason: { $gte: 2025 } })
    .select('name birthDate position subPosition club externalIds.transfermarkt').lean();
  const byId = new Map(players.filter((p) => p.name?.trim()).map((p) => [String(p._id), p]));
  if (game === 'age') return [...byId.values()];
  if (game === 'value') {
    const values = await Valuation.aggregate([
      { $match: { player: { $in: [...byId.values()].map((p) => p._id) } } },
      { $sort: { player: 1, date: -1 } },
      { $group: { _id: '$player', value: { $first: '$value' }, date: { $first: '$date' } } },
    ]).option({ maxTimeMS: 8000 });
    return values.filter((v) => Number.isSafeInteger(v.value) && v.value > 0 && v.date instanceof Date
        && Number.isFinite(+v.date) && +v.date <= Date.now())
      .map((v) => ({ ...byId.get(String(v._id)), value: v.value, group: day(v.date) }));
  }
  const competitions = await Competition.find().select('name').lean();
  const leagues = new Map(competitions.map((c) => [String(c._id), c.name]));
  if (game === 'goals') {
    const rows = await SeasonStat.find({ minutes: { $gte: 450 }, season: /^\d{4}-\d{2}$/ })
      .select('player competition season goals').lean();
    const groups = new Map();
    for (const row of rows) {
      const player = byId.get(String(row.player));
      const league = leagues.get(String(row.competition));
      if (!player || !league || !Number.isSafeInteger(row.goals) || row.goals < 0) continue;
      const group = String(row.competition) + ':' + row.season;
      const identity = group + ':' + row.player;
      groups.set(identity, groups.has(identity) ? null : { ...player, value: row.goals, group, league, season: row.season });
    }
    return [...groups.values()].filter(Boolean);
  }
  const clubs = new Map((await Club.find().select('competition').lean())
    .map((c) => [String(c._id), leagues.get(String(c.competition))]));
  return [...byId.values()].map((p) => ({ ...p, league: clubs.get(String(p.club)) }));
}

const cache = new Map();
async function getPool(game) {
  if (!cache.has(game) || cache.get(game).expires < Date.now()) {
    const entry = { expires: Date.now() + 300000 };
    entry.promise = loadPool(game).catch((error) => {
      if (cache.get(game) === entry) cache.delete(game);
      throw error;
    });
    cache.set(game, entry);
  }
  return cache.get(game).promise;
}

function band(game, a, b) {
  const gap = Math.abs(a - b);
  if (!gap) return null;
  if (game === 'value') {
    const ratio = Math.max(a, b) / Math.min(a, b);
    return ratio >= 2 ? 'easy' : ratio >= 1.25 ? 'medium' : 'hard';
  }
  if (game === 'age') return gap >= 5 * 365.25 * DAY ? 'easy' : gap >= 2 * 365.25 * DAY ? 'medium' : 'hard';
  return gap >= 5 ? 'easy' : gap >= 2 ? 'medium' : 'hard';
}

function comparison(game, difficulty, a, rows, reference) {
  const candidates = rows.filter((b) => distinct(a, b) && a.group === b.group
    && band(game, a.value, b.value) === difficulty);
  if (!candidates.length) return null;
  const b = pick(candidates);
  const winner = a.value > b.value ? a : b;
  const context = game === 'goals' ? { league: a.league, season: a.season }
    : { date: game === 'value' ? a.group : day(reference) };
  return {
    players: [a, b], winner, context, clues: [],
    facts: game === 'age' ? [day(a.birthDate), day(b.birthDate)] : [a.value, b.value],
    difference: game === 'age' ? Math.round(Math.abs(a.value - b.value) / DAY) : Math.abs(a.value - b.value),
  };
}

function guess(difficulty, a, rows) {
  const candidates = rows.filter((b) => distinct(a, b)
    && (difficulty !== 'hard' || (b.position === a.position && b.league === a.league
      && Math.abs(b.birthDate - a.birthDate) <= 4 * 366 * DAY))
    && day(b.birthDate) !== day(a.birthDate));
  const distractors = [];
  const same = candidates.filter((b) => b.position === a.position);
  const other = candidates.filter((b) => b.position !== a.position);
  const sameCount = difficulty === 'easy' ? 1 : difficulty === 'medium' ? 2 : 3;
  const otherCount = 3 - sameCount;
  if (same.length < sameCount || other.length < otherCount) return null;
  for (const [group, required] of [[same, sameCount], [other, otherCount]]) {
    let selected = 0;
    while (group.length && selected < required) {
      const b = group.splice(randomInt(group.length), 1)[0];
      if (distractors.every((existing) => distinct(existing, b))) {
        distractors.push(b);
        selected++;
      }
    }
    if (selected < required) return null;
  }
  if (distractors.length < 3) return null;
  return {
    players: [a, ...distractors], winner: a, context: {},
    clues: [
      { type: 'position', value: positions[a.position] },
      { type: 'league', value: a.league },
      { type: 'birthYear', value: a.birthDate.getUTCFullYear() },
      { type: 'birthDate', value: day(a.birthDate) },
    ],
    facts: null, difference: null,
  };
}

function generate(game, difficulty, pool, reference = new Date(), count = 10) {
  const validBirth = (p) => p.birthDate instanceof Date
    && +p.birthDate <= +reference - 14 * 365.25 * DAY && +p.birthDate >= +reference - 90 * 365.25 * DAY;
  let rows = pool.filter((p) => p.name?.trim() && (
    game === 'guess' ? validBirth(p) && p.league && positions[p.position]
      : game === 'age' ? validBirth(p) : true
  ));
  if (difficulty === 'easy') rows = rows.filter((p) => recognition(p) === 'star');
  else if (difficulty === 'medium') rows = rows.filter((p) => recognition(p) !== 'general');
  if (game === 'goals' && difficulty !== 'hard') {
    const firstSeason = difficulty === 'easy' ? 2024 : 2022;
    rows = rows.filter((p) => Number(p.season?.slice(0, 4)) >= firstSeason);
  }
  if (game === 'age') rows = rows.map((p) => ({ ...p, value: Math.floor(+p.birthDate / DAY) * DAY }));
  const questions = [];
  const used = new Set();
  let remaining = rows;
  for (let attempt = 0; attempt < 250 && questions.length < count && remaining.length; attempt++) {
    const a = pick(remaining);
    const round = game === 'guess' ? guess(difficulty, a, remaining) : comparison(game, difficulty, a, remaining, reference);
    if (!round) continue;
    const correct = randomUUID();
    const options = round.players.map((player, index) => {
      used.add(String(player._id));
      return { id: player === round.winner ? correct : randomUUID(), name: player.name, fact: round.facts?.[index] };
    });
    for (let i = options.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [options[i], options[j]] = [options[j], options[i]];
    }
    questions.push({ id: randomUUID(), options, correct, context: round.context, clues: round.clues, difference: round.difference });
    remaining = rows.filter((p) => !used.has(String(p._id)));
  }
  return questions;
}

module.exports = { games, difficulties, generate, getPool, band };
