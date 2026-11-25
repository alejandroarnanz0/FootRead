import { Link } from 'react-router-dom';
import { gameCatalog, gameStats } from '../api/games.js';
import PageHeader from '../components/PageHeader.jsx';
import { ErrorMessage, Loading } from '../components/Status.jsx';
import { dateText, difficulties, games } from '../components/games/content.js';
import { useApi } from '../hooks/useApi.js';
import { useAuth } from '../hooks/useAuth.jsx';
import './GamesPage.css';

function GamesPitch() {
  return <div className="games-hero-art" aria-hidden="true">
    <svg viewBox="0 0 560 260" preserveAspectRatio="xMidYMid slice" focusable="false">
      <defs>
        <radialGradient id="games-pitch-glow"><stop stopColor="currentColor" stopOpacity=".18" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" /></radialGradient>
      </defs>
      <ellipse className="games-pitch-light" cx="315" cy="135" rx="225" ry="125" fill="url(#games-pitch-glow)" />
      <g className="games-pitch-lines" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="28" y="16" width="504" height="228" rx="2" />
        <path d="M280 16v228" /><circle cx="280" cy="130" r="39" />
        <circle cx="280" cy="130" r="2" fill="currentColor" stroke="none" />
        <path d="M28 66h73v128H28m0-98h28v68H28m504-98h-73v128h73m0-98h-28v68h28" />
        <path d="M101 109a39 39 0 0 1 0 42m358-42a39 39 0 0 0 0 42" />
      </g>
      <g className="games-pitch-markers">
        <g><circle cx="150" cy="82" r="6" /><animateTransform attributeName="transform" type="translate" values="0 0;8 5;0 0" dur="8s" repeatCount="indefinite" /></g>
        <g><circle cx="217" cy="178" r="6" /><animateTransform attributeName="transform" type="translate" values="0 0;-5 -6;0 0" dur="9s" repeatCount="indefinite" /></g>
        <g><circle cx="373" cy="73" r="6" /><animateTransform attributeName="transform" type="translate" values="0 0;6 8;0 0" dur="10s" repeatCount="indefinite" /></g>
        <g><circle cx="428" cy="175" r="6" /><animateTransform attributeName="transform" type="translate" values="0 0;-7 -4;0 0" dur="8.5s" repeatCount="indefinite" /></g>
      </g>
      <g className="games-pitch-ball-moving">
        <animateMotion dur="12s" repeatCount="indefinite" path="M165 131 C213 117 238 105 277 131 S357 177 394 131 S337 73 280 101 S195 171 165 131" />
        <ellipse className="games-pitch-trail" cx="-14" cy="2" rx="23" ry="6" />
        <circle className="games-pitch-ball-halo" r="15" />
        <circle className="games-pitch-ball" r="5" />
      </g>
      <g className="games-pitch-still">
        <circle className="games-pitch-static-marker" cx="150" cy="82" r="6" />
        <circle className="games-pitch-static-marker" cx="217" cy="178" r="6" />
        <circle className="games-pitch-static-marker" cx="373" cy="73" r="6" />
        <circle className="games-pitch-static-marker" cx="428" cy="175" r="6" />
        <circle className="games-pitch-ball-halo" cx="280" cy="101" r="15" />
        <circle className="games-pitch-ball" cx="280" cy="101" r="5" />
      </g>
    </svg>
  </div>;
}

function PersonalStats({ user }) {
  const { data, loading, error, retry } = useApi(gameStats, [user._id]);
  return <section className="card games-stats games-catalog-stats" aria-labelledby="games-history">
    <h2 id="games-history">Tu historial</h2>
    {loading && <Loading />}
    {error && <ErrorMessage error={error} onRetry={retry} />}
    {data && (!data.totals.length ? <p className="muted">Completa una partida para ver tus estadísticas.</p>
      : <>
        <ul className="games-stats-grid">
          {data.totals.map((item) => <li key={item.game}><strong>{games[item.game].title}</strong>
            <span>{item.games} partidas · Récord {item.best} puntos · {item.accuracy} % de acierto</span></li>)}
        </ul>
        <h3>Últimas partidas</h3>
        <ul className="games-history-list">
          {data.recent.map((item) => <li key={item.id}><strong>{games[item.game].title}</strong>
            <span>{dateText(item.finishedAt)} · {difficulties[item.difficulty]} · {item.score} puntos</span></li>)}
        </ul>
      </>)}
  </section>;
}

export default function GamesPage() {
  const { user, checking } = useAuth();
  const { data, loading, error, retry } = useApi(gameCatalog, []);
  return <div className="page games-page games-catalog">
    <div className="card games-hero"><PageHeader title="Footboard Games"
      description="Cuatro retos de fútbol con datos de Footboard." /><GamesPitch /></div>
    {loading && <Loading />}
    {error && <ErrorMessage error={error} onRetry={retry} />}
    {data && <div className="games-grid">
      {data.games.map((id) => {
        const game = games[id];
        return <article className="card games-tile" key={id}>
          <svg aria-hidden="true" width="30" height="30" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={game.icon} /></svg>
          <h2>{game.title}</h2>
          <p>{game.description}</p>
          <Link className="button button-secondary games-play-link" to={'/games/' + id} aria-label={'Jugar a ' + game.title}>Jugar <span aria-hidden="true">→</span></Link>
        </article>;
      })}
    </div>}
    {!checking && (user ? <PersonalStats key={user._id} user={user} />
      : <p className="muted">Puedes jugar como invitado. <Link to="/login" state={{ from: '/games' }}>Inicia sesión</Link> para guardar tu historial.</p>)}
  </div>;
}
