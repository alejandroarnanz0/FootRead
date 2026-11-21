import { clock, formatXg, SHOOTOUT } from './matchData.js';

const periods = { 1: 'Primera parte', 2: 'Segunda parte', 3: 'Prórroga · 1.ª parte', 4: 'Prórroga · 2.ª parte', 5: 'Tanda de penaltis' };

function Team({ name, side, stats, goal }) {
  return (
    <div className={`live-team live-${side}`}>
      <div className="live-team-identity">
        <span className="live-eyebrow">{side === 'home' ? 'Local' : 'Visitante'}</span>
        <h2>{name}</h2>
      </div>
      <strong key={stats.goals} className={`live-score${goal ? ' live-score-pop' : ''}`}>{stats.goals}</strong>
      <dl className="live-team-stats">
        <div><dt>xG</dt><dd>{formatXg(stats.measured ? stats.xg : null)}</dd></div>
        <div><dt>Tiros</dt><dd>{stats.shots}</dd></div>
      </dl>
    </div>
  );
}

export default function LiveScoreboard({ match, summary, last, elapsed, live, error, goal, goalSide }) {
  const status = error ? 'Actualización interrumpida' : live ? 'LIVE' : last ? 'Replay registrado' : 'Esperando eventos';
  const metadata = [match.competition, match.season].filter(Boolean).join(' · ');
  return (
    <section className="live-board" aria-label="Marcador del partido">
      <div className="live-board-top">
        <span>{metadata || 'Seguimiento del partido'}</span>
        <span className={`live-status${live ? ' live-status-active' : ''}`}>{status}</span>
      </div>
      <div className="live-score-grid">
        <Team name={match.homeTeam} side="home" stats={summary.totals.home} goal={goalSide === 'home' && goal.period !== SHOOTOUT} />
        <div className="live-clock">
          <span>{periods[last?.period] || 'Reloj del partido'}</span>
          <strong>{last ? clock(last) : '—'}</strong>
          {summary.hasShootout && <small className="live-shootout">Penaltis <b>{summary.totals.home.penalties}–{summary.totals.away.penalties}</b></small>}
        </div>
        <Team name={match.awayTeam} side="away" stats={summary.totals.away} goal={goalSide === 'away' && goal.period !== SHOOTOUT} />
      </div>
      <div className="live-board-bottom">
        <span>{match.available ? 'Replay de StatsBomb' : 'Archivo de StatsBomb'} · Consulta automática</span>
        {last && elapsed !== null && <span>{elapsed < 60000 ? `Último evento hace ${Math.floor(elapsed / 1000)} s` : 'Sin eventos recientes'}</span>}
      </div>
    </section>
  );
}
