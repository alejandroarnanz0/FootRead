// Pure functions of the comparables heuristic (CLAUDE.md 11.1). No I/O.

// League matches per season, for the share of minutes played.
const LEAGUE_GAMES = { ES1: 38, GB1: 38, IT1: 38, L1: 34, FR1: 34 };

// Positions where goals + assists say something about quality.
const ATTACKING = new Set([
  'Centre-Forward',
  'Second Striker',
  'Left Winger',
  'Right Winger',
  'Attacking Midfield',
]);

const MIN_GROUP = 10;

function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function ageBand(age) {
  if (age <= 21) return '<=21';
  if (age <= 24) return '22-24';
  if (age <= 27) return '25-27';
  if (age <= 30) return '28-30';
  return '31+';
}

function wideAgeBand(age) {
  if (age <= 23) return '<=23';
  if (age <= 29) return '24-29';
  return '30+';
}

function minutesBand(minutes, league) {
  const share = minutes / ((LEAGUE_GAMES[league] || 38) * 90);
  if (share < 0.25) return 'bench';
  if (share < 0.5) return 'rotation';
  if (share < 0.75) return 'starter';
  return 'key';
}

// null when it does not apply: not an attacker, or too few minutes to judge.
function productionBand(p) {
  if (!ATTACKING.has(p.subPosition) || p.minutes < 450) return null;
  const per90 = ((p.goals + p.assists) * 90) / p.minutes;
  if (per90 < 0.2) return '<0.2';
  if (per90 < 0.4) return '0.2-0.4';
  if (per90 < 0.6) return '0.4-0.6';
  return '0.6+';
}

// Group keys from strictest (0) to loosest (3). Each level drops one criterion.
function groupKeys(p) {
  const minutes = minutesBand(p.minutes, p.league);
  const sub = p.subPosition || p.position;
  return [
    [sub, ageBand(p.age), minutes, productionBand(p) ?? '-'].join('|'),
    [sub, ageBand(p.age), minutes].join('|'),
    [sub, wideAgeBand(p.age), minutes].join('|'),
    [p.position, wideAgeBand(p.age), minutes].join('|'),
  ];
}

// players: [{ id, position, subPosition, age, minutes, goals, assists, league, club?, value }]
// Returns Map id -> { predicted, level, groupSize } (level null if no group was big enough).
function predictValues(players) {
  // Relative value: value / median of the player's club (or league when the club
  // is unknown). The club median absorbs both league and club strength, so a
  // Brentford starter is compared with what starters are worth to their own
  // clubs, not with Barcelona's.
  const baseOf = (p) => p.club ?? p.league;
  const byBase = new Map();
  for (const p of players) {
    if (!byBase.has(baseOf(p))) byBase.set(baseOf(p), []);
    byBase.get(baseOf(p)).push(p.value);
  }
  const baseMedian = new Map([...byBase].map(([b, v]) => [b, median(v)]));

  const keyed = players.map((p) => ({
    ...p,
    relative: p.value / baseMedian.get(baseOf(p)),
    keys: groupKeys(p),
  }));

  // Level -> key -> [{ id, relative }]
  const groups = [0, 1, 2, 3].map(() => new Map());
  for (const p of keyed) {
    p.keys.forEach((key, level) => {
      if (!groups[level].has(key)) groups[level].set(key, []);
      groups[level].get(key).push(p);
    });
  }

  const result = new Map();
  for (const p of keyed) {
    let found = null;
    for (let level = 0; level < 4 && !found; level++) {
      // Leave-one-out: the player never prices himself.
      const others = groups[level].get(p.keys[level]).filter((o) => o.id !== p.id);
      if (others.length >= MIN_GROUP) {
        const rel = median(others.map((o) => o.relative));
        found = {
          predicted: Math.round((rel * baseMedian.get(baseOf(p))) / 10000) * 10000,
          level,
          groupSize: others.length,
          key: p.keys[level],
        };
      }
    }
    result.set(p.id, found || { predicted: null, level: null, groupSize: 0, key: null });
  }
  return { result, baseMedian, groups };
}

const LEVEL_CRITERIA = [
  ['subPosition', 'ageBand', 'minutesBand', 'productionBand'],
  ['subPosition', 'ageBand', 'minutesBand'],
  ['subPosition', 'wideAgeBand', 'minutesBand'],
  ['position', 'wideAgeBand', 'minutesBand'],
];

// The comparables behind one player's reference value: the group actually used
// (strictest level with enough players), without the player himself.
function comparablesOf(players, id) {
  const { result, groups } = predictValues(players);
  const r = result.get(id);
  if (!r || r.level === null) return { found: false };
  const members = groups[r.level].get(r.key).filter((o) => o.id !== id);
  return { found: true, ...r, criteria: LEVEL_CRITERIA[r.level], members };
}

module.exports = {
  comparablesOf,
  LEVEL_CRITERIA,
  LEAGUE_GAMES,
  MIN_GROUP,
  median,
  ageBand,
  minutesBand,
  productionBand,
  groupKeys,
  predictValues,
};
