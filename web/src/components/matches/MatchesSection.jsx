import { useState } from 'react';
import { Link } from 'react-router-dom';
import { listReplayMatches } from '../../api/matches.js';
import { useApi } from '../../hooks/useApi.js';
import { competitionLabel, teamLabel } from '../../matchLabels.js';
import Button from '../Button.jsx';
import { ErrorMessage, Loading, Notice } from '../Status.jsx';
import { MatchTeamBadge } from '../visual/TeamBadge.jsx';
import './MatchesSection.css';

const PAGE_SIZE = 8;
const dateFormat = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeZone: 'UTC' });
const nameOrder = new Intl.Collator('es-ES');
const searchKey = (name) => name.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es');
function matchDate(value) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : -Infinity;
}

function MatchRow({ match }) {
  const date = matchDate(match.matchDate);
  const hasEvents = match.eventCount > 0;
  const home = teamLabel(match.homeTeam);
  const away = teamLabel(match.awayTeam);
  const status = hasEvents ? 'Replay registrado' : match.eventCount === 0 ? 'Sin eventos registrados' : 'Estado no verificado';
  return (
    <li className="overview-match">
      <div className="overview-match-meta">
        <strong>{competitionLabel(match.competition) || 'Competición sin registrar'}</strong>
        {Number.isFinite(date)
          ? <time dateTime={new Date(date).toISOString().slice(0, 10)}>{dateFormat.format(date)}</time>
          : <span>Fecha no disponible</span>}
      </div>
      <div className="overview-match-teams">
        <strong className="identity-inline"><MatchTeamBadge match={match} side="home" decorative />{home}</strong>
        <span className="overview-match-versus" aria-hidden="true">VS</span>
        <strong className="identity-inline"><MatchTeamBadge match={match} side="away" decorative />{away}</strong>
      </div>
      <span className={`overview-replay${hasEvents ? ' overview-replay-recorded' : ''}`}>{status}</span>
      <Link className="button button-secondary" to={`/live/${encodeURIComponent(match.matchId)}`}
        aria-label={`Ver partido: ${home} – ${away}`}>Ver partido <span aria-hidden="true">↗</span></Link>
    </li>
  );
}

function MatchCatalog({ matches }) {
  const [query, setQuery] = useState('');
  const [competition, setCompetition] = useState('');
  const [availability, setAvailability] = useState('');
  const [dateOrder, setDateOrder] = useState('desc');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const term = searchKey(query.trim());
  const change = (setter) => (event) => {
    setter(event.target.value);
    setLimit(PAGE_SIZE);
  };
  const competitions = [...new Set(matches.map((match) => competitionLabel(match.competition)).filter(Boolean))].sort(nameOrder.compare);
  const filtered = matches.filter((match) => {
    if (competition && competitionLabel(match.competition) !== competition) return false;
    if (availability === 'recorded' && !(match.eventCount > 0)) return false;
    if (availability === 'empty' && match.eventCount !== 0) return false;
    return !term || [match.homeTeam, match.awayTeam, teamLabel(match.homeTeam), teamLabel(match.awayTeam)]
      .some((name) => searchKey(name ?? '').includes(term));
  }).sort((a, b) => {
    const left = matchDate(a.matchDate);
    const right = matchDate(b.matchDate);
    if (left === right) return nameOrder.compare(a.matchId, b.matchId);
    if (!Number.isFinite(left)) return 1;
    if (!Number.isFinite(right)) return -1;
    return dateOrder === 'asc' ? left - right : right - left;
  });

  return (
    <>
      <div className="overview-match-controls">
        <label>Buscar equipo
          <input type="search" value={query} onChange={change(setQuery)} placeholder="Nombre del equipo" />
        </label>
        <label>Competición
          <select value={competition} onChange={change(setCompetition)}>
            <option value="">Todas las competiciones</option>
            {competitions.map((name) => <option value={name} key={name}>{name}</option>)}
          </select>
        </label>
        <label>Eventos
          <select value={availability} onChange={change(setAvailability)}>
            <option value="">Todos los estados</option>
            <option value="recorded">Con eventos registrados</option>
            <option value="empty">Sin eventos registrados</option>
          </select>
        </label>
        <label>Orden por fecha
          <select value={dateOrder} onChange={change(setDateOrder)}>
            <option value="desc">Más recientes primero</option>
            <option value="asc">Más antiguos primero</option>
          </select>
        </label>
      </div>
      <p className="muted" role="status">
        {filtered.length === 0 ? '0 partidos' : `Mostrando ${Math.min(limit, filtered.length)} de ${filtered.length} ${filtered.length === 1 ? 'partido' : 'partidos'}`}
      </p>
      {filtered.length ? (
        <ul className="overview-match-list">
          {filtered.slice(0, limit).map((match) => <MatchRow key={match.matchId} match={match} />)}
        </ul>
      ) : <Notice>No hay partidos que coincidan con los filtros.</Notice>}
      {limit < filtered.length && <Button onClick={() => setLimit((count) => count + PAGE_SIZE)}>Mostrar más partidos</Button>}
    </>
  );
}

export default function MatchesSection() {
  const { data, error, retry } = useApi(listReplayMatches, []);
  return (
    <section className="overview-matches" aria-label="Catálogo de partidos y replays">
      {error ? <ErrorMessage error={error} onRetry={retry} title="No se pudieron cargar los partidos" /> : !data ? (
        <Loading>Cargando partidos…</Loading>
      ) : !data.length ? <Notice>No hay partidos reproducibles en el catálogo.</Notice> : <MatchCatalog matches={data} />}
      <p className="muted overview-source">Catálogo de <a href="https://github.com/statsbomb/open-data">StatsBomb Open Data</a>.</p>
    </section>
  );
}
