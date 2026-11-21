import { clock, formatXg, shotOutcome, teamSide } from './matchData.js';

function ShotDetails({ event }) {
  return (
    <>
      <strong>{event.playerName || 'Tiro sin jugador registrado'}</strong>
      <span>{event.team} · {clock(event)}</span>
      <span>{shotOutcome(event)} · xG {formatXg(event.xg)}</span>
    </>
  );
}

export default function ShotMap({ match, shots, selected, newestShot, onSelect }) {
  return (
    <section className="card live-panel" aria-labelledby="live-map-title">
      <div className="live-panel-heading"><h2 id="live-map-title">Mapa de tiros</h2><span>{shots.length} en el campo</span></div>
      <div className="live-pitch">
        <svg viewBox="0 0 128 88" aria-hidden="true" className="live-pitch-lines">
          <rect x="4" y="4" width="120" height="80" rx=".5" />
          <path d="M64 4v80 M4 22h18v44H4 M124 22h-18v44h18 M4 34h6v20H4 M124 34h-6v20h6 M4 40H1v8h3 M124 40h3v8h-3 M22 36a10 10 0 0 1 0 16 M106 36a10 10 0 0 0 0 16" />
          <circle cx="64" cy="44" r="10" />
          <circle cx="64" cy="44" r=".65" /><circle cx="16" cy="44" r=".65" /><circle cx="112" cy="44" r=".65" />
        </svg>
        {shots.map((event) => {
          const side = teamSide(event, match);
          const x = side === 'away' ? 120 - event.x : event.x;
          const y = side === 'away' ? 80 - event.y : event.y;
          const active = selected?.sequence === event.sequence;
          return (
            <button key={event._id ?? event.sequence} type="button"
              className={`live-shot live-${side}${event.isGoal ? ' live-shot-goal' : ''}${active ? ' live-shot-selected' : ''}${newestShot?.sequence === event.sequence ? ' live-shot-new' : ''}${x > 60 ? ' live-shot-right' : ''}${y > 40 ? ' live-shot-low' : ''}`}
              style={{ left: `${(x + 4) / 128 * 100}%`, top: `${(y + 4) / 88 * 100}%`, '--shot-size': `${9 + Math.sqrt(event.xg ?? 0) * 16}px` }}
              aria-label={`${event.playerName || 'Tiro'}, ${event.team}, ${clock(event)}, ${shotOutcome(event)}, xG ${formatXg(event.xg)}`}
              aria-pressed={active} onClick={() => onSelect(event)}>
              <span className="live-shot-mark" aria-hidden="true" />
              <span className="live-shot-tooltip" aria-hidden="true"><ShotDetails event={event} /></span>
            </button>
          );
        })}
        {shots.length === 0 && <span className="live-pitch-empty">Sin tiros para mostrar</span>}
      </div>
      <div className="live-map-legend">
        <span className="live-home"><i aria-hidden="true" />{match.homeTeam}</span>
        <span className="live-away"><i aria-hidden="true" />{match.awayTeam}</span>
        <span className="live-key-goal"><i aria-hidden="true" />Gol</span>
        <span className="live-key-selected"><i aria-hidden="true" />Seleccionado</span>
        <span className="live-key-xg">Tamaño según xG</span>
      </div>
      {selected && (
        <div className={`live-selected-shot live-${teamSide(selected, match)}`}>
          <div>
            <strong>{selected.playerName || 'Tiro sin jugador registrado'}</strong>
            <span>{selected.team} · {clock(selected)}</span>
          </div>
          <span className="live-selected-outcome">{shotOutcome(selected)}</span>
          <span className="live-selected-xg"><small>xG</small><b>{formatXg(selected.xg)}</b></span>
        </div>
      )}
    </section>
  );
}
