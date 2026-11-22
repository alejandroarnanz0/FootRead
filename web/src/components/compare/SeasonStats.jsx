import { useMemo, useState } from 'react';
import { getComparisonStats } from '../../api/comparison.js';
import { useApi } from '../../hooks/useApi.js';
import { ErrorMessage, Loading, Notice } from '../Status.jsx';
import ComparisonMetrics from './ComparisonMetrics.jsx';

const count = new Intl.NumberFormat('es-ES');
const rate = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const validCount = (value) => Number.isFinite(value) && value >= 0 ? value : null;
const per90 = (value, minutes) => value !== null && minutes > 0 ? (value / minutes) * 90 : null;
const metrics = [['minutes', 'Minutos'], ['goals', 'Goles'], ['assists', 'Asistencias']];

function commonSeasons([first, second]) {
  const seasons = [...new Set(first.map((row) => row.season))].filter((season) =>
    second.some((row) => row.season === season)).sort().reverse();
  return seasons.map((season) => {
    const left = first.filter((row) => row.season === season);
    const right = second.filter((row) => row.season === season);
    const shared = left.find((row) => row.competition?.code &&
      right.some((candidate) => candidate.competition?.code === row.competition.code));
    return {
      season,
      rows: shared ? [shared, right.find((row) => row.competition?.code === shared.competition.code)] : [left[0], right[0]],
    };
  });
}

function LeagueContext({ players, rows }) {
  const [left, right] = rows.map(({ competition }) => competition);
  if (left?.code && left.code === right?.code) {
    return <p className="compare-leagues"><strong>{left.name}</strong> · Misma liga</p>;
  }
  return (
    <div className="compare-leagues">
      <strong>{left?.code && right?.code ? 'Ligas diferentes' : 'Comparación por temporada'}</strong>
      <ul>
        {players.map((player, index) => (
          <li key={player._id}>{player.name} <span>· {rows[index].competition?.name ?? 'Liga no disponible'}</span></li>
        ))}
      </ul>
    </div>
  );
}

export default function SeasonStats({ players }) {
  const [left, right] = players;
  const [selectedSeason, setSelectedSeason] = useState(null);
  const { data, error, retry } = useApi((signal) => getComparisonStats(left._id, right._id, signal), [left._id, right._id]);
  const scopes = useMemo(() => data ? commonSeasons(data) : [], [data]);
  const active = scopes.find(({ season }) => season === selectedSeason) ?? scopes[0];
  const minutes = active?.rows.map((row) => validCount(row.minutes));
  const rows = active ? [
    ...metrics.map(([key, label]) => ({
      label, values: active.rows.map((row) => validCount(row[key])), format: (value) => count.format(value), bars: true,
    })),
    ...[['goals', 'Goles por 90'], ['assists', 'Asistencias por 90']].map(([key, label]) => ({
      label, values: active.rows.map((row, index) => per90(validCount(row[key]), minutes[index])),
      format: (value) => rate.format(value), bars: true,
    })),
  ] : [];

  return (
    <section className="card compare-panel" aria-labelledby="compare-stats-title">
      <header className="compare-panel-heading">
        <h2 id="compare-stats-title">Rendimiento en liga</h2>
        {active && (
          <label className="compare-season">Temporada
            <select value={active.season} onChange={(event) => setSelectedSeason(event.target.value)}>
              {scopes.map(({ season }) => <option key={season}>{season}</option>)}
            </select>
          </label>
        )}
      </header>
      {error ? <ErrorMessage error={error} onRetry={retry} /> : !data ? (
        <Loading>Cargando estadísticas…</Loading>
      ) : !active ? (
        <Notice>No disponible. Los dos jugadores no tienen registros de liga en una misma temporada.</Notice>
      ) : (
        <>
          <LeagueContext players={players} rows={active.rows} />
          <ComparisonMetrics players={players} rows={rows} titleId="compare-stats-title" />
          <p className="compare-context">Las cifras por 90 minutos requieren minutos jugados y un registro de goles o asistencias.</p>
        </>
      )}
    </section>
  );
}
