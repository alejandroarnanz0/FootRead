import { useState } from 'react';
import { Notice } from '../Status.jsx';
import { teamLabel } from '../../matchLabels.js';
import { clock, eventLabel, formatPct, isGoal, SHOOTOUT, shotOutcome, teamSide } from './matchData.js';
import { VerdictChip, XgMeter } from './XgMeter.jsx';

const cardColors = {
  'Yellow Card': 'yellow',
  'Red Card': 'red',
  'Second Yellow': 'second',
};

const FILTERS = [
  { key: 'all', label: 'Todo', keep: () => true },
  { key: 'shots', label: 'Tiros', keep: (event) => event.type === 'Shot' },
  { key: 'goals', label: 'Goles', keep: isGoal },
];

// Shots are the heart of the model: a full card with its probability and verdict.
function ShotCard({ event, match }) {
  const shootout = event.period === SHOOTOUT;
  return (
    <>
      <span className="feed-shot-top">
        <span className="feed-clock">{clock(event)}</span>
        <span className="feed-shot-kind">{eventLabel(event)}</span>
        {!event.isGoal && <span className="feed-shot-outcome">{shotOutcome(event)}</span>}
        <b className="feed-shot-xg">{formatPct(event.xg)}</b>
      </span>
      <span className="feed-shot-who">
        <strong>{event.playerName || 'Jugador sin registrar'}</strong>
        <span>{teamLabel(event.team)}</span>
      </span>
      {!shootout && (
        <span className="feed-shot-model">
          <XgMeter xg={event.xg} size="sm" />
          <VerdictChip event={event} />
        </span>
      )}
      <span className="sr-only">{teamSide(event, match) === 'home' ? 'Local' : 'Visitante'}</span>
    </>
  );
}

// Everything else is context: one quiet line.
function EventLine({ event }) {
  const card = cardColors[event.card];
  return (
    <>
      <span className="feed-clock">{clock(event)}</span>
      <span className="feed-line-label">
        {card && <i className={`live-card-symbol live-card-${card}`} aria-hidden="true" />}
        {event.type === 'Substitution' && <span className="live-sub-symbol" aria-hidden="true">⇄</span>}
        {isGoal(event) && <span className="feed-goal-dot" aria-hidden="true" />}
        {eventLabel(event)}
      </span>
      <span className="feed-line-who">
        {event.playerName}{event.replacement && ` → ${event.replacement}`}
        {event.playerName ? ' · ' : ''}{teamLabel(event.team)}
      </span>
    </>
  );
}

export default function EventFeed({ match, events, animated, newest, selected, onSelect, selectable }) {
  const [filter, setFilter] = useState('all');
  const counts = Object.fromEntries(FILTERS.map((f) => [f.key, events.filter(f.keep).length]));
  const shown = events.filter(FILTERS.find((f) => f.key === filter).keep).toReversed();

  return (
    <section className="card live-panel live-feed" aria-labelledby="live-feed-title">
      <div className="live-panel-heading">
        <h2 id="live-feed-title">Eventos</h2>
        <div className="feed-filters" role="group" aria-label="Filtrar eventos">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label}<span>{counts[f.key]}</span>
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <Notice>{events.length ? 'Ningún evento de este tipo todavía.' : 'Aquí aparecerán los eventos que reciba la API.'}</Notice>
      ) : (
        <div className="live-feed-scroll" role="region" aria-label="Cronología de eventos" tabIndex={0}>
          <ol className="feed-list">
            {shown.map((event) => {
              const shot = event.type === 'Shot';
              const side = teamSide(event, match);
              const active = selected?.sequence === event.sequence;
              const className = [
                shot ? 'feed-shot' : 'feed-line',
                side && `live-${side}`,
                isGoal(event) && 'feed-goal',
                active && 'feed-selected',
                animated.has(event.sequence) && 'feed-enter',
                newest?.sequence === event.sequence && 'feed-newest',
              ].filter(Boolean).join(' ');
              const content = shot ? <ShotCard event={event} match={match} /> : <EventLine event={event} />;
              return (
                <li key={event._id ?? event.sequence}>
                  {selectable.has(event.sequence) ? (
                    <button type="button" className={className} aria-pressed={active} onClick={() => onSelect(event)}>{content}</button>
                  ) : <div className={className}>{content}</div>}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}
