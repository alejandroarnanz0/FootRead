import { useState } from 'react';
import { Notice } from '../Status.jsx';
import { teamLabel } from '../../matchLabels.js';
import {
  BAND_LIMITS, BANDS, clock, formatPct, formatXg, gameSeconds, shotOutcome, shotVerdict, SHOOTOUT, teamSide, VERDICTS,
} from './matchData.js';
import { VerdictChip } from './XgMeter.jsx';

// Chart frame in SVG units; the SVG scales to the panel width.
const W = 640;
const H = 240;
const PAD = { top: 14, right: 78, bottom: 26, left: 40 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;
const Y_TICKS = [0, 0.1, 0.3, 0.5, 0.75, 1];

// Six verdicts as a 2 × 3 table: rows = what happened, columns = the model's band.
export function VerdictMatrix({ counts }) {
  const columns = ['clear', 'possible', 'unlikely'];
  const rows = [{ goal: true, label: 'Gol' }, { goal: false, label: 'Sin gol' }];
  return (
    <table className="verdict-matrix">
      <caption className="sr-only">Tiros por resultado y franja de probabilidad</caption>
      <thead>
        <tr>
          <td />
          {columns.map((band) => <th key={band} scope="col">{BANDS[band].short}<small>{BANDS[band].range}</small></th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <th scope="row">{row.label}</th>
            {columns.map((band) => {
              const key = Object.keys(VERDICTS).find((k) => VERDICTS[k].band === band && VERDICTS[k].goal === row.goal);
              const verdict = VERDICTS[key];
              return (
                <td key={band} className={verdict.error ? 'matrix-error' : undefined} data-empty={!counts[key] || undefined}>
                  <b>{counts[key]}</b>
                  <small>{verdict.label}</small>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Model accuracy against always saying "no goal", judged by the same rule.
export function AccuracyCompare({ report }) {
  const rows = [
    { key: 'model', label: 'Nuestro modelo', value: report.accuracy },
    { key: 'reference', label: '«Nunca gol»', value: report.reference },
  ];
  return (
    <div className="accuracy-compare">
      {rows.map((row) => (
        <div key={row.key} className={`accuracy-row accuracy-${row.key}`}>
          <span>{row.label}</span>
          <span className="accuracy-track" aria-hidden="true"><i style={{ '--value': row.value ?? 0 }} /></span>
          <b>{formatPct(row.value)}</b>
        </div>
      ))}
    </div>
  );
}

function ShotTimeline({ match, shots, selected, onSelect, viewTime }) {
  const [hovered, setHovered] = useState(null);
  const lastMinute = Math.max(90, ...shots.map((shot) => shot.minute + 1));
  const maxMinute = lastMinute > 90 ? Math.max(120, lastMinute) : 90;
  const x = (seconds) => PAD.left + (Math.min(seconds / 60, maxMinute) / maxMinute) * PLOT_W;
  const y = (xg) => PAD.top + (1 - xg) * PLOT_H;
  const ticks = maxMinute > 90 ? [0, 15, 30, 45, 60, 75, 90, 105, 120] : [0, 15, 30, 45, 60, 75, 90];
  const bands = [
    { key: 'unlikely', from: 0, to: BAND_LIMITS.possible },
    { key: 'possible', from: BAND_LIMITS.possible, to: BAND_LIMITS.clear },
    { key: 'clear', from: BAND_LIMITS.clear, to: 1 },
  ];
  const tip = hovered ?? selected;
  const tipShot = tip && shots.find((shot) => shot.sequence === tip.sequence);

  return (
    <div className="shot-timeline">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Probabilidad de gol de cada tiro a lo largo del partido">
        {bands.map((band) => (
          <g key={band.key} className={`timeline-band timeline-band-${band.key}`}>
            <rect x={PAD.left} y={y(band.to)} width={PLOT_W} height={y(band.from) - y(band.to)} />
            <text x={W - PAD.right + 8} y={(y(band.to) + y(band.from)) / 2 + 3.5}>{BANDS[band.key].short}</text>
          </g>
        ))}
        {Y_TICKS.map((tick) => (
          <g key={tick} className="timeline-grid">
            <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} />
            <text x={PAD.left - 8} y={y(tick) + 4} textAnchor="end">{Math.round(tick * 100)}%</text>
          </g>
        ))}
        {ticks.map((minute) => (
          <g key={minute} className={`timeline-axis${minute === 45 || minute === 90 ? ' timeline-period' : ''}`}>
            {(minute === 45 || minute === 90) && <line x1={x(minute * 60)} x2={x(minute * 60)} y1={PAD.top} y2={H - PAD.bottom} />}
            <text x={x(minute * 60)} y={H - 8} textAnchor="middle">{minute}′</text>
          </g>
        ))}
        {viewTime !== null && (
          <line className="timeline-view" x1={x(viewTime)} x2={x(viewTime)} y1={PAD.top - 6} y2={H - PAD.bottom} />
        )}
        {shots.map((shot) => {
          const side = teamSide(shot, match);
          const cx = x(gameSeconds(shot));
          const cy = y(shot.xg);
          const error = VERDICTS[shotVerdict(shot)]?.error;
          const active = selected?.sequence === shot.sequence;
          return (
            <g key={shot._id ?? shot.sequence}
              className={`timeline-shot live-${side}${shot.isGoal ? ' is-goal' : ''}${error ? ' is-error' : ''}${active ? ' is-selected' : ''}`}
              tabIndex={0} role="button" aria-pressed={active}
              aria-label={`${clock(shot)} ${shot.playerName || 'Tiro'}, ${formatPct(shot.xg)}, ${shotOutcome(shot)}`}
              onClick={() => onSelect(shot)}
              onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(shot); } }}
              onMouseEnter={() => setHovered(shot)} onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(shot)} onBlur={() => setHovered(null)}>
              <line className="timeline-stem" x1={cx} x2={cx} y1={y(0)} y2={cy} />
              {error && <circle className="timeline-alert" cx={cx} cy={cy} r={9.5} />}
              <circle className="timeline-head" cx={cx} cy={cy} r={shot.isGoal ? 5.5 : 4.5} />
              <circle className="timeline-hit" cx={cx} cy={cy} r={12} />
            </g>
          );
        })}
      </svg>
      {tipShot && (
        <div className={`timeline-tip live-${teamSide(tipShot, match)}${tipShot.xg > 0.55 ? ' timeline-tip-below' : ''}`}
          style={{ left: `${(x(gameSeconds(tipShot)) / W) * 100}%`, top: `${(y(tipShot.xg) / H) * 100}%` }}>
          <strong>{tipShot.playerName || teamLabel(tipShot.team)}</strong>
          <span>{clock(tipShot)} · {shotOutcome(tipShot)} · <b>{formatPct(tipShot.xg)}</b></span>
          <VerdictChip event={tipShot} />
        </div>
      )}
    </div>
  );
}

export default function ModelPanel({ match, events, report, selected, onSelect, viewTime }) {
  const shots = events.filter((event) =>
    event.type === 'Shot' && event.period !== SHOOTOUT && Number.isFinite(event.xg) && teamSide(event, match));
  const unrated = events.filter((event) => event.type === 'Shot' && event.period !== SHOOTOUT && !Number.isFinite(event.xg)).length;
  return (
    <section className="card live-panel model-panel" aria-labelledby="model-panel-title">
      <div className="live-panel-heading">
        <h2 id="model-panel-title">Lectura del modelo</h2>
        <span>Probabilidad de gol de cada tiro frente a lo que pasó</span>
      </div>
      {report.total === 0 ? (
        <Notice>Cuando llegue el primer tiro con xG, aquí verás qué esperaba el modelo y si acertó.</Notice>
      ) : (
        <div className="model-grid">
          <div className="model-chart">
            <ShotTimeline match={match} shots={shots} selected={selected} onSelect={onSelect} viewTime={viewTime} />
            <ul className="timeline-legend" aria-label="Leyenda">
              <li className="live-home"><i className="key-team" />{teamLabel(match.homeTeam)}</li>
              <li className="live-away"><i className="key-team" />{teamLabel(match.awayTeam)}</li>
              <li><i className="key-goal" />Gol</li>
              <li><i className="key-miss" />Sin gol</li>
              <li><i className="key-error" />Error del modelo</li>
            </ul>
          </div>
          <div className="model-score">
            <div className="model-kpi">
              <span>Acierto del modelo</span>
              <strong>{formatPct(report.accuracy)}</strong>
              <small>{report.hits} de {report.total} tiros · {report.errors} {report.errors === 1 ? 'error' : 'errores'}</small>
            </div>
            <AccuracyCompare report={report} />
            <VerdictMatrix counts={report.counts} />
            <dl className="model-teams">
              {['home', 'away'].map((side) => (
                <div key={side} className={`live-${side}`}>
                  <dt>{teamLabel(side === 'home' ? match.homeTeam : match.awayTeam)}</dt>
                  <dd><b>{report.teams[side].goals}</b> goles <span>· {formatXg(report.teams[side].xg)} esperados</span></dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
      {unrated > 0 && <p className="live-note">Tiros sin xG (servicio de ML no disponible): {unrated}.</p>}
    </section>
  );
}
