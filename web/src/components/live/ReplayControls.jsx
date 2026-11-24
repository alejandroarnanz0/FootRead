import { useState } from 'react';
import { clock, gameSeconds, isGoal, SHOOTOUT, teamSide } from './matchData.js';

export const SPEEDS = [5, 10, 20, 60, 120];
const DEFAULT_SPEED = 20;

const STATUS = {
  offline: 'Reproductor desconectado',
  idle: 'Listo para reproducir',
  playing: 'Reproduciendo',
  paused: 'En pausa',
  finished: 'Partido terminado',
};

const asClock = (seconds) => clock({ minute: Math.floor(seconds / 60), second: Math.floor(seconds % 60) });

function PlayIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" /></svg>;
}
function PauseIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1.2" /><rect x="13.5" y="5" width="4" height="14" rx="1.2" /></svg>;
}
function RestartIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4h4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

// Scrubbing only moves what the page shows; the replay keeps running.
function Timeline({ match, events, end, viewTime, onSeek }) {
  const max = Math.max(end, 1);
  const value = viewTime ?? max;
  const shots = events.filter((event) => event.type === 'Shot' && event.period !== SHOOTOUT && teamSide(event, match));
  const goals = events.filter((event) => isGoal(event) && event.period !== SHOOTOUT);
  const at = (event) => `${(Math.min(gameSeconds(event), max) / max) * 100}%`;
  return (
    <div className="replay-timeline">
      <div className="replay-track-wrap">
        <div className="replay-markers" aria-hidden="true">
          {shots.map((event) => (
            <i key={event._id ?? event.sequence} className={`replay-marker live-${teamSide(event, match)}${event.isGoal ? ' is-goal' : ''}`}
              style={{ left: at(event) }} />
          ))}
          {goals.filter((event) => event.type !== 'Shot').map((event) => (
            <i key={event._id ?? event.sequence} className="replay-marker is-goal is-own" style={{ left: at(event) }} />
          ))}
        </div>
        <input type="range" className="replay-range" min="0" max={max} step="1" value={value}
          style={{ '--control-value': value, '--attr-min': 0, '--attr-max': max }}
          aria-label="Momento del partido que se muestra"
          aria-valuetext={viewTime === null ? `En directo, minuto ${asClock(max)}` : `Minuto ${asClock(value)}`}
          onChange={(event) => {
            const next = Number(event.target.value);
            onSeek(next >= max ? null : next);
          }} />
      </div>
      <div className="replay-time">
        <span><b>{asClock(value)}</b> / {asClock(max)}</span>
        {viewTime === null
          ? <span className="replay-live-pill">En directo</span>
          : <button type="button" className="replay-golive" onClick={() => onSeek(null)}>Volver al directo</button>}
      </div>
    </div>
  );
}

export default function ReplayControls({ match, events, replay, finished, busy, error, onCommand, viewTime, onSeek, onReport }) {
  const [speed, setSpeed] = useState(replay?.speed ?? DEFAULT_SPEED);
  const online = Boolean(replay?.online);
  const status = online ? (replay.status ?? 'idle') : 'offline';
  const playing = status === 'playing';
  const lastEvent = events.reduce((latest, event) => Math.max(latest, event.period === SHOOTOUT ? 0 : gameSeconds(event)), 0);
  const end = Math.max(lastEvent, playing || status === 'paused' ? replay.clock ?? 0 : 0);
  const progress = replay?.total ? replay.sent / replay.total : finished ? 1 : 0;
  const shownSpeed = replay?.speed ?? speed;

  const mainLabel = playing ? 'Pausar' : status === 'paused' ? 'Reanudar'
    : status === 'finished' || finished ? 'Volver a reproducir' : 'Reproducir';

  return (
    <section className="replay-bar" aria-label="Control del reproductor">
      <div className="replay-row">
        <div className="replay-buttons">
          <button type="button" className={`replay-main${playing ? ' is-playing' : ''}`} disabled={!online || busy}
            onClick={() => onCommand(playing ? 'pause' : 'play', playing ? undefined : speed)}>
            {playing ? <PauseIcon /> : <PlayIcon />}
            <span>{mainLabel}</span>
          </button>
          <button type="button" className="replay-icon" disabled={!online || busy || status === 'idle'}
            onClick={() => onCommand('restart', speed)} title="Reiniciar desde el minuto 0" aria-label="Reiniciar desde el minuto 0">
            <RestartIcon />
          </button>
        </div>

        <div className="replay-status" data-status={status} role="status">
          <span className="replay-dot" aria-hidden="true" />
          <span>
            <b>{STATUS[status]}</b>
            {online && replay.total > 0 && <small>{replay.sent} de {replay.total} eventos · x{shownSpeed}</small>}
            {!online && <small>Arráncalo con <code>npm run replay:agent</code></small>}
          </span>
          <span className="replay-progress" aria-hidden="true"><i style={{ '--value': progress }} /></span>
        </div>

        <div className="replay-speeds" role="group" aria-label="Velocidad de reproducción">
          {SPEEDS.map((value) => (
            <button key={value} type="button" aria-pressed={shownSpeed === value} disabled={busy}
              onClick={() => {
                setSpeed(value);
                if (online && status !== 'idle') onCommand('speed', value);
              }}>
              x{value}
            </button>
          ))}
        </div>

        {finished && <button type="button" className="replay-report" onClick={onReport}>Ver resumen</button>}
      </div>
      {error && <p className="replay-error" role="alert">{error}</p>}
      {events.length > 0 && <Timeline match={match} events={events} end={end} viewTime={viewTime} onSeek={onSeek} />}
    </section>
  );
}
