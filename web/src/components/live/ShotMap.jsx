import { clock, formatPct, shotOutcome, shotVerdict, teamSide, VERDICTS } from './matchData.js';
import { teamLabel } from '../../matchLabels.js';
import { VerdictChip, XgFigure, XgMeter } from './XgMeter.jsx';

const TOAST_MS = 4500;

// Both teams on one pitch: StatsBomb orients every event towards the goal its
// team attacks, so the away team is mirrored (CLAUDE.md 7).
function position(event, side) {
  const x = side === 'away' ? 120 - event.x : event.x;
  const y = side === 'away' ? 80 - event.y : event.y;
  return { x, y };
}

// Mark area grows with the probability, so a 40 % chance reads as a big one.
const markSize = (xg) => `${11 + Math.sqrt(Number.isFinite(xg) ? xg : 0) * 24}px`;

function ShotTooltip({ event }) {
  return (
    <span className="live-shot-tooltip" aria-hidden="true">
      <span className="live-tip-head">
        <strong>{event.playerName || 'Tiro sin jugador registrado'}</strong>
        <b>{formatPct(event.xg)}</b>
      </span>
      <span>{teamLabel(event.team)} · {clock(event)} · {shotOutcome(event)}</span>
      <XgMeter xg={event.xg} size="sm" />
      <VerdictChip event={event} />
    </span>
  );
}

// Big card over the pitch for the shot that has just arrived.
function ShotToast({ event, match }) {
  const side = teamSide(event, match);
  return (
    <div className={`live-shot-toast live-${side}${event.isGoal ? ' live-shot-toast-goal' : ''}`}
      key={event._id ?? event.sequence} role="status">
      <span className="live-toast-kicker">{event.isGoal ? 'Gol' : 'Tiro'} · {clock(event)}</span>
      <strong>{event.playerName || teamLabel(event.team)}</strong>
      <span className="live-toast-meta">{teamLabel(event.team)} · {shotOutcome(event)}</span>
      <span className="live-toast-xg"><b>{formatPct(event.xg)}</b><small>probabilidad de gol</small></span>
      <VerdictChip event={event} />
    </div>
  );
}

export default function ShotMap({ match, shots, selected, newestShot, activityAge, onSelect }) {
  const toast = newestShot && activityAge < TOAST_MS ? newestShot : null;
  const errors = shots.filter((event) => VERDICTS[shotVerdict(event)]?.error).length;
  return (
    <section className="card live-panel live-map" aria-labelledby="live-map-title">
      <div className="live-panel-heading">
        <h2 id="live-map-title">Mapa de tiros</h2>
        <span>{shots.length} tiros · {errors} {errors === 1 ? 'error' : 'errores'} del modelo</span>
      </div>
      <div className="live-pitch">
        <svg viewBox="0 0 128 88" aria-hidden="true" className="live-pitch-lines">
          <rect x="4" y="4" width="120" height="80" rx=".5" />
          <path d="M64 4v80 M4 22h18v44H4 M124 22h-18v44h18 M4 34h6v20H4 M124 34h-6v20h6 M4 40H1v8h3 M124 40h3v8h-3 M22 36a10 10 0 0 1 0 16 M106 36a10 10 0 0 0 0 16" />
          <circle cx="64" cy="44" r="10" />
          <circle cx="64" cy="44" r=".65" /><circle cx="16" cy="44" r=".65" /><circle cx="112" cy="44" r=".65" />
        </svg>
        <span className="live-pitch-side live-pitch-side-away">{teamLabel(match.awayTeam)} ataca ←</span>
        <span className="live-pitch-side live-pitch-side-home">→ {teamLabel(match.homeTeam)} ataca</span>
        {shots.map((event) => {
          const side = teamSide(event, match);
          const { x, y } = position(event, side);
          const verdict = VERDICTS[shotVerdict(event)];
          const active = selected?.sequence === event.sequence;
          const className = [
            'live-shot', `live-${side}`,
            event.isGoal ? 'live-shot-goal' : 'live-shot-miss',
            verdict?.error && 'live-shot-error',
            active && 'live-shot-selected',
            newestShot?.sequence === event.sequence && 'live-shot-new',
            x > 64 && 'live-shot-right',
            y > 44 && 'live-shot-low',
          ].filter(Boolean).join(' ');
          return (
            <button key={event._id ?? event.sequence} type="button" className={className}
              style={{ left: `${((x + 4) / 128) * 100}%`, top: `${((y + 4) / 88) * 100}%`, '--shot-size': markSize(event.xg) }}
              aria-label={`${event.playerName || 'Tiro'}, ${teamLabel(event.team)}, ${clock(event)}, ${shotOutcome(event)}, probabilidad ${formatPct(event.xg)}${verdict ? `, ${verdict.label}` : ''}`}
              aria-pressed={active} onClick={() => onSelect(event)}>
              <span className="live-shot-mark" aria-hidden="true" />
              <ShotTooltip event={event} />
            </button>
          );
        })}
        {toast && <ShotToast event={toast} match={match} />}
        {shots.length === 0 && <span className="live-pitch-empty">Sin tiros para mostrar</span>}
      </div>
      <ul className="live-map-legend" aria-label="Leyenda del mapa">
        <li className="live-home"><i className="key-team" />{teamLabel(match.homeTeam)}</li>
        <li className="live-away"><i className="key-team" />{teamLabel(match.awayTeam)}</li>
        <li><i className="key-goal" />Gol</li>
        <li><i className="key-miss" />Sin gol</li>
        <li><i className="key-error" />Error del modelo</li>
        <li className="live-key-xg">Tamaño = probabilidad de gol</li>
      </ul>
      {selected && (
        <div className={`live-selected-shot live-${teamSide(selected, match)}`}>
          <div className="live-selected-who">
            <strong>{selected.playerName || 'Tiro sin jugador registrado'}</strong>
            <span>{teamLabel(selected.team)} · {clock(selected)} · {shotOutcome(selected)}</span>
          </div>
          <div className="live-selected-model">
            <XgMeter xg={selected.xg} />
            <VerdictChip event={selected} withBand />
          </div>
          <XgFigure xg={selected.xg} />
          <button type="button" className="live-selected-close" onClick={() => onSelect(selected)} aria-label="Quitar selección">×</button>
        </div>
      )}
    </section>
  );
}
