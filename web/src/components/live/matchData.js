export const SHOOTOUT = 5;
export const formatXg = (value) => Number.isFinite(value)
  ? value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  : '—';

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
