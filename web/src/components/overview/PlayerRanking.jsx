import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { formatEuros, formatResidual, POSITION_LABELS } from '../../format.js';
import { ErrorMessage, Loading, Notice } from '../Status.jsx';
import { usePagedRanking } from '../../hooks/usePagedRanking.js';
import PlayerAvatar from '../visual/PlayerAvatar.jsx';

const LOAD_DISTANCE = 48;
const downKeys = new Set(['ArrowDown', 'PageDown', 'End', ' ']);

export default function PlayerRanking({ loadPage, scouting = false }) {
  const { players, error, retry, pending, hasMore, loadMore } = usePagedRanking(loadPage);
  const previousScroll = useRef(0);
  const key = scouting ? 'residual' : 'currentValue';
  const title = scouting ? 'Oportunidades de scouting' : 'Mayor valor de mercado';
  const id = scouting ? 'overview-scouting' : 'overview-leaders';
  const description = scouting
    ? 'Referencia por comparables menos valor de mercado. Una diferencia positiva indica un candidato para revisar.'
    : 'Jugadores con mayor valoración de mercado del catálogo.';

  function requestNearEnd(viewport) {
    // Check proximity only on interaction to avoid prefetching a short list.
    const remaining = viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop;
    if (remaining <= LOAD_DISTANCE) loadMore();
  }

  function onScroll(event) {
    const viewport = event.currentTarget;
    const movedDown = viewport.scrollTop > previousScroll.current;
    previousScroll.current = viewport.scrollTop;
    if (movedDown) requestNearEnd(viewport);
  }

  return (
    <section className={`card overview-panel overview-ranking-panel${scouting ? ' overview-scouting' : ''}`} aria-labelledby={id}>
      <header className="overview-ranking-heading">
        <h3 id={id}>{title}</h3>
        <p className="muted">{description}</p>
      </header>
      <div className="overview-ranking-scroll" role="group" aria-labelledby={id} tabIndex={0}
        onScroll={onScroll}
        onWheel={(event) => { if (event.deltaY > 0 && !event.ctrlKey) requestNearEnd(event.currentTarget); }}
        onKeyDown={(event) => {
          if (event.target === event.currentTarget && downKeys.has(event.key) && !event.shiftKey) {
            requestNearEnd(event.currentTarget);
          }
        }}
        onFocus={(event) => {
          if (event.target === event.currentTarget.querySelector('.overview-ranking li:last-child a')) {
            requestNearEnd(event.currentTarget);
          }
        }}>
        {players.length > 0 && (
          <ol className="overview-ranking">
            {players.map((player, index) => (
              <li key={player._id}>
                <Link to={`/players/${player._id}`}>
                  <span className="overview-rank" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                  <PlayerAvatar player={player} decorative />
                  <span className="overview-player">
                    <strong>{player.name}</strong>
                    <small>{[player.club?.name, POSITION_LABELS[player.position]].filter(Boolean).join(' · ')}</small>
                    <span className="overview-meter" aria-hidden="true"><i style={{ width: `${players[0][key] > 0 ? player[key] / players[0][key] * 100 : 0}%` }} /></span>
                  </span>
                  <b className="overview-ranking-value">{scouting ? formatResidual(player[key]) : formatEuros(player[key])}</b>
                </Link>
              </li>
            ))}
          </ol>
        )}
        <div className="overview-ranking-status">
          {error ? (
            <ErrorMessage error={error} onRetry={retry} title={players.length ? 'No se pudieron cargar más jugadores' : 'No se pudo cargar el ranking'} />
          ) : pending ? (
            <Loading>{players.length ? 'Cargando más jugadores…' : 'Cargando ranking…'}</Loading>
          ) : players.length === 0 ? (
            <Notice>{scouting ? 'No hay jugadores con referencia superior al valor de mercado.' : 'No hay jugadores con valor de mercado registrado.'}</Notice>
          ) : (
            <p className="muted" role="status">
              {hasMore ? `${players.length} jugadores cargados · Desplázate para ver más` : `Fin del ranking · ${players.length} jugadores`}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
