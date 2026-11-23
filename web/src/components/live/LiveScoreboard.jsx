import { clock, formatXg, SHOOTOUT } from './matchData.js';
import { competitionLabel, teamLabel } from '../../matchLabels.js';
import { MatchTeamBadge } from '../visual/TeamBadge.jsx';

const periods = { 1: 'Primera parte', 2: 'Segunda parte', 3: 'Prórroga · 1.ª parte', 4: 'Prórroga · 2.ª parte', 5: 'Tanda de penaltis' };
const connectionLabels = {
  connecting: 'Conectando…',
  connected: 'Conectado en tiempo real',
  reconnecting: 'Reconectando · Actualización REST',
  fallback: 'Actualización REST de respaldo',
  error: 'Error de conexión · Actualización REST',
};

function Team({ match, side, stats, goal, hasEvents }) {
  const name = side === 'home' ? match.homeTeam : match.awayTeam;
  return (
    <div className={`live-team live-${side}`}>
      <div className="live-team-identity">
        <span className="live-eyebrow">{side === 'home' ? 'Local' : 'Visitante'}</span>
        <h2 className="identity-inline"><MatchTeamBadge match={match} side={side} decorative />{teamLabel(name)}</h2>
      </div>
      {hasEvents && (
        <>
          <strong key={stats.goals} className={`live-score${goal ? ' live-score-pop' : ''}`}>{stats.goals}</strong>
          <dl className="live-team-stats">
            <div><dt>xG</dt><dd>{formatXg(stats.measured ? stats.xg : null)}</dd></div>
            <div><dt>Tiros</dt><dd>{stats.shots}</dd></div>
          </dl>
        </>
      )}
    </div>
  );
}

export default function LiveScoreboard({ match, summary, last, elapsed, live, error, goal, goalSide, eventsLoaded, connection }) {
  const status = error ? 'Actualización interrumpida' : live ? 'Replay · Actividad reciente' : last ? 'Replay registrado'
    : eventsLoaded ? 'Sin eventos registrados' : 'Cargando eventos';
  const metadata = [competitionLabel(match.competition), match.season].filter(Boolean).join(' · ');
  return (
    <section className="live-board" aria-label="Marcador del partido">
      <div className="live-board-top">
        <span>{metadata || 'Seguimiento del partido'}</span>
        <span className={`live-status${live ? ' live-status-active' : ''}`}>{status}</span>
      </div>
      <div className={`live-score-grid${last ? '' : ' live-score-grid-empty'}`}>
        <Team match={match} side="home" stats={summary.totals.home} hasEvents={Boolean(last)}
          goal={goalSide === 'home' && goal.period !== SHOOTOUT} />
        {last ? <div className="live-clock">
          <span>{periods[last?.period] || 'Reloj del partido'}</span>
          <strong>{last ? clock(last) : '—'}</strong>
          {summary.hasShootout && <small className="live-shootout">Penaltis <b>{summary.totals.home.penalties}–{summary.totals.away.penalties}</b></small>}
        </div> : (
          <div className="live-empty-score">
            <span aria-hidden="true">VS</span>
            <small>Marcador no disponible</small>
          </div>
        )}
        <Team match={match} side="away" stats={summary.totals.away} hasEvents={Boolean(last)}
          goal={goalSide === 'away' && goal.period !== SHOOTOUT} />
      </div>
      <div className="live-board-bottom">
        <span className="live-connection" data-connection={connection} role="status">{connectionLabels[connection]}</span>
        {last && elapsed !== null && <span>{elapsed < 60000 ? `Último evento hace ${Math.floor(elapsed / 1000)} s` : 'Sin eventos recientes'}</span>}
      </div>
    </section>
  );
}
