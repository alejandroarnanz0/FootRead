export const SHOOTOUT = 5;
// Team totals stay in expected goals (2,41 xG): a sum of probabilities is not a percentage.
export const formatXg = (value) => Number.isFinite(value)
  ? value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  : '—';

// A single shot's xG is a probability: shown out of 100.
const percent = new Intl.NumberFormat('es-ES', { style: 'percent', maximumFractionDigits: 0 });
export function formatPct(value) {
  if (!Number.isFinite(value)) return '—';
  if (value > 0 && value < 0.005) return '<1 %';
  return percent.format(value);
}

// Match clock in seconds. StatsBomb minutes run on across periods (45, 90, 105...).
export const gameSeconds = (event) => event.minute * 60 + (event.second ?? 0);

// How good the chance was, by its xG.
export const BAND_LIMITS = { possible: 0.1, clear: 0.3 };
export const BANDS = {
  clear: { label: 'Ocasión clara', short: 'Clara', range: '≥ 30 %' },
  possible: { label: 'Ocasión posible', short: 'Posible', range: '10–30 %' },
  unlikely: { label: 'Ocasión improbable', short: 'Improbable', range: '< 10 %' },
};
export function xgBand(xg) {
  if (!Number.isFinite(xg)) return null;
  if (xg >= BAND_LIMITS.clear) return 'clear';
  return xg >= BAND_LIMITS.possible ? 'possible' : 'unlikely';
}

// What the model said against what happened. Only the two clear contradictions
// count as model errors: a goal from an unlikely chance and a missed clear one.
export const VERDICTS = {
  'expected-goal': { label: 'Gol previsto', goal: true, band: 'clear', error: false },
  'possible-goal': { label: 'Gol posible', goal: true, band: 'possible', error: false },
  'unexpected-goal': { label: 'Gol inesperado', goal: true, band: 'unlikely', error: true },
  'missed-chance': { label: 'Ocasión perdida', goal: false, band: 'clear', error: true },
  'normal-miss': { label: 'Fallo normal', goal: false, band: 'possible', error: false },
  'expected-miss': { label: 'Fallo previsto', goal: false, band: 'unlikely', error: false },
};
export function shotVerdict(event) {
  const band = xgBand(event?.xg);
  if (!band || event.type !== 'Shot') return null;
  return Object.keys(VERDICTS).find((key) => VERDICTS[key].band === band && VERDICTS[key].goal === Boolean(event.isGoal));
}

// The model's scorecard over the shots it rated (shoot-out penalties apart).
// The reference is a "model" that always says no goal, judged by the same rule:
// it misses every goal and gets every other shot right.
export function modelReport(match, events) {
  const shots = events.filter((event) =>
    event.type === 'Shot' && event.period !== SHOOTOUT && Number.isFinite(event.xg) && teamSide(event, match));
  const counts = Object.fromEntries(Object.keys(VERDICTS).map((key) => [key, 0]));
  const teams = { home: { goals: 0, xg: 0, shots: 0 }, away: { goals: 0, xg: 0, shots: 0 } };
  let surprise = null;
  let miss = null;
  for (const shot of shots) {
    counts[shotVerdict(shot)]++;
    const team = teams[teamSide(shot, match)];
    team.shots++;
    team.xg += shot.xg;
    if (shot.isGoal) {
      team.goals++;
      if (!surprise || shot.xg < surprise.xg) surprise = shot;
    } else if (!miss || shot.xg > miss.xg) miss = shot;
  }
  const total = shots.length;
  const goals = shots.filter((shot) => shot.isGoal).length;
  const errors = counts['unexpected-goal'] + counts['missed-chance'];
  return {
    total,
    goals,
    errors,
    hits: total - errors,
    accuracy: total ? (total - errors) / total : null,
    reference: total ? (total - goals) / total : null,
    counts,
    teams,
    surprise, // the goal with the lowest xG
    miss, // the missed shot with the highest xG
  };
}

export const clock = (event) =>
  `${String(event.minute).padStart(2, '0')}:${String(event.second ?? 0).padStart(2, '0')}`;

export function teamSide(event, match) {
  if (event.team === match.homeTeam) return 'home';
  if (event.team === match.awayTeam) return 'away';
  return null;
}

export const isGoal = (event) =>
  (event.type === 'Shot' && event.isGoal) || event.type === 'Own Goal For';

const outcomes = {
  Goal: 'Gol', Saved: 'Parado', Blocked: 'Bloqueado', 'Off T': 'Fuera',
  Post: 'Al poste', 'Wayward': 'Desviado', 'Saved Off T': 'Parado fuera de puerta',
  'Saved to Post': 'Parado al poste',
};

export const shotOutcome = (event) => outcomes[event.shotOutcome] ?? event.shotOutcome ?? 'Resultado sin registrar';

export function eventLabel(event) {
  if (event.type === 'Own Goal For') return 'Gol en propia puerta';
  if (event.type === 'Own Goal Against') return 'Autogol encajado';
  if (event.type === 'Shot' && event.period === SHOOTOUT) return 'Tanda de penaltis';
  if (event.type === 'Shot' && event.shotType === 'Penalty') return event.isGoal ? 'Gol de penalti' : 'Penalti';
  if (event.type === 'Shot') return event.isGoal ? 'Gol' : 'Tiro';
  if (event.card === 'Red Card') return 'Tarjeta roja';
  if (event.card === 'Second Yellow') return 'Segunda amarilla';
  if (event.card === 'Yellow Card') return 'Tarjeta amarilla';
  return ({
    Substitution: 'Cambio',
    'Foul Committed': 'Falta',
    'Bad Behaviour': 'Conducta antideportiva',
    Pass: 'Pase previo a ocasión',
  })[event.type] ?? event.type;
}

export function summarizeMatch(match, events) {
  const sideStats = () => ({ goals: 0, shots: 0, xg: 0, measured: 0, penalties: 0 });
  const totals = { home: sideStats(), away: sideStats() };
  const timeline = [{ time: 0, home: 0, away: 0 }];
  const shotPoints = new Map();
  let time = 0;
  let hasShootout = false;
  for (const event of events) {
    const side = teamSide(event, match);
    if (!side) continue;
    const stats = totals[side];
    if (event.period === SHOOTOUT) {
      hasShootout = true;
      if (isGoal(event)) stats.penalties++;
      continue;
    }
    if (isGoal(event)) stats.goals++;
    // Added time can overlap the start of the following period.
    time = Math.max(time, event.minute + (event.second ?? 0) / 60);
    if (event.type !== 'Shot') continue;
    stats.shots++;
    if (Number.isFinite(event.xg)) {
      stats.xg += event.xg;
      stats.measured++;
    }
    const point = { time, home: totals.home.xg, away: totals.away.xg };
    shotPoints.set(event.sequence, { ...point, side });
    if (Number.isFinite(event.xg)) timeline.push(point);
  }
  if (timeline.at(-1).time < time) {
    timeline.push({ time, home: totals.home.xg, away: totals.away.xg });
  }
  return { totals, timeline, shotPoints, hasShootout };
}
