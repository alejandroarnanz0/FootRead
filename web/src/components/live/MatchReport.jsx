import { useEffect, useRef } from 'react';
import { teamLabel } from '../../matchLabels.js';
import { clock, formatPct, formatXg } from './matchData.js';
import { MatchTeamBadge } from '../visual/TeamBadge.jsx';
import { AccuracyCompare, VerdictMatrix } from './ModelPanel.jsx';
import { VerdictChip } from './XgMeter.jsx';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function Highlight({ title, event, note }) {
  return (
    <article className="report-highlight">
      <h3>{title}</h3>
      {event ? (
        <>
          <strong>{event.playerName || teamLabel(event.team)}</strong>
          <span>{teamLabel(event.team)} · {clock(event)}</span>
          <b className="report-highlight-xg">{formatPct(event.xg)}</b>
          <VerdictChip event={event} />
        </>
      ) : <p>{note}</p>}
    </article>
  );
}

// End-of-match screen. A native modal <dialog>: focus, Esc and the backdrop
// come from the browser.
export default function MatchReport({ open, onClose, onReplay, match, summary, report }) {
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  // Light dismiss where closedby="any" is not supported yet (Safari).
  useEffect(() => {
    const element = dialog.current;
    if (!element || 'closedBy' in HTMLDialogElement.prototype) return undefined;
    const onClick = (event) => {
      if (event.target !== element) return;
      const r = element.getBoundingClientRect();
      const inside = r.top <= event.clientY && event.clientY <= r.bottom && r.left <= event.clientX && event.clientX <= r.right;
      if (!inside) element.close();
    };
    element.addEventListener('click', onClick);
    return () => element.removeEventListener('click', onClick);
  }, []);

  const sides = ['home', 'away'];
  const maxXg = Math.max(1, ...sides.flatMap((side) => [report.teams[side].xg, summary.totals[side].goals]));
  const delta = report.accuracy !== null ? report.accuracy - report.reference : null;

  return (
    <dialog ref={dialog} className="match-report" aria-labelledby="match-report-title" closedby="any" onClose={onClose}>
      <header className="report-head">
        <p className="report-kicker">Final del partido</p>
        <h1 id="match-report-title" className="report-score">
          <span className="live-home"><MatchTeamBadge match={match} side="home" decorative />{teamLabel(match.homeTeam)}</span>
          <b>{summary.totals.home.goals} – {summary.totals.away.goals}</b>
          <span className="live-away">{teamLabel(match.awayTeam)}<MatchTeamBadge match={match} side="away" decorative /></span>
        </h1>
        {summary.hasShootout && <p className="report-shootout">Penaltis {summary.totals.home.penalties}–{summary.totals.away.penalties}</p>}
      </header>

      <div className="report-body">
        <section className="report-kpis" aria-label="Resultado del modelo">
          <div className="report-kpi report-kpi-main">
            <span>Acierto del modelo</span>
            <strong>{formatPct(report.accuracy)}</strong>
            <small>{report.hits} de {report.total} tiros bien leídos</small>
          </div>
          <div className="report-kpi">
            <span>Frente a «nunca gol»</span>
            <strong className={delta > 0 ? 'is-better' : delta < 0 ? 'is-worse' : undefined}>
              {delta === null ? '—' : `${delta > 0 ? '+' : ''}${Math.round(delta * 100)} pts`}
            </strong>
            <small>la referencia acierta el {formatPct(report.reference)}</small>
          </div>
          <div className="report-kpi">
            <span>Errores del modelo</span>
            <strong>{report.errors}</strong>
            <small>{plural(report.counts['unexpected-goal'], 'gol inesperado', 'goles inesperados')} · {plural(report.counts['missed-chance'], 'ocasión perdida', 'ocasiones perdidas')}</small>
          </div>
        </section>

        <section className="report-section">
          <h2>Qué esperaba el modelo y qué pasó</h2>
          <VerdictMatrix counts={report.counts} />
          <AccuracyCompare report={report} />
        </section>

        <section className="report-section">
          <h2>Goles reales frente a esperados</h2>
          <div className="report-bars">
            {sides.map((side) => (
              <div key={side} className={`report-bar live-${side}`}>
                <span className="report-bar-team">{teamLabel(side === 'home' ? match.homeTeam : match.awayTeam)}</span>
                <span className="report-bar-track" aria-hidden="true">
                  <i className="bar-goals" style={{ '--value': summary.totals[side].goals / maxXg }} />
                  <i className="bar-xg" style={{ '--value': report.teams[side].xg / maxXg }} />
                </span>
                <span className="report-bar-values"><b>{summary.totals[side].goals}</b> goles · {formatXg(report.teams[side].xg)} xG</span>
              </div>
            ))}
            <p className="report-bar-key"><i className="bar-goals" /> Goles <i className="bar-xg" /> Goles esperados (suma del xG de sus tiros)</p>
          </div>
        </section>

        <section className="report-highlights" aria-label="Momentos del modelo">
          <Highlight title="El gol más inesperado" event={report.surprise} note="No hubo goles en jugada." />
          <Highlight title="La ocasión más clara fallada" event={report.miss} note="Todos los tiros acabaron en gol." />
        </section>
      </div>

      <form method="dialog" className="report-actions">
        <button type="button" className="report-replay" onClick={onReplay}>Volver a reproducir</button>
        <button type="submit" className="report-close" autoFocus>Ver el partido</button>
      </form>
    </dialog>
  );
}
