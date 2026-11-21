import { Notice } from '../Status.jsx';
import { clock, eventLabel, formatXg, isGoal, SHOOTOUT, shotOutcome } from './matchData.js';

const cardColors = {
  'Yellow Card': 'yellow',
  'Red Card': 'red',
  'Second Yellow': 'second',
};

export default function EventFeed({ events, animated, newest, selected, onSelect, selectable }) {
  return (
    <section className="card live-panel live-feed" aria-labelledby="live-feed-title">
      <div className="live-panel-heading">
        <h2 id="live-feed-title">Eventos</h2><span>{events.length}</span>
      </div>
      {events.length === 0 ? <Notice>Aquí aparecerán los eventos que reciba la API.</Notice> : (
        <div className="live-feed-scroll" role="region" aria-label="Cronología de eventos" tabIndex={0}>
          <ol className="live-event-list">
            {[...events].reverse().map((event) => {
              const shot = event.type === 'Shot';
              const card = cardColors[event.card];
              const substitute = event.type === 'Substitution';
              const active = selected?.sequence === event.sequence;
              const className = `live-event${isGoal(event) ? ' live-event-goal' : ''}${active ? ' live-event-selected' : ''}${animated.has(event.sequence) ? ' live-event-enter' : ''}`;
              const content = (
                <>
                  <span className="live-event-clock">{clock(event)}</span>
                  <span className="live-event-body">
                    <span className="live-event-label">
                      {card && <i className={`live-card-symbol live-card-${card}`} aria-hidden="true" />}
                      {substitute && <span className="live-sub-symbol" aria-hidden="true">⇄</span>}
                      {eventLabel(event)}
                    </span>
                    {event.playerName && <strong>{event.playerName}{event.replacement && ` → ${event.replacement}`}</strong>}
                    <span className="live-event-meta">
                      {event.team}{shot && (!event.isGoal || event.period === SHOOTOUT) && ` · ${shotOutcome(event)}`}
                    </span>
                  </span>
                  {(shot || newest?.sequence === event.sequence) && (
                    <span className="live-event-aside">
                      {newest?.sequence === event.sequence && <span className="live-new">Nuevo</span>}
                      {shot && <span className="live-event-xg"><small>xG</small> {formatXg(event.xg)}</span>}
                    </span>
                  )}
                </>
              );
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
