import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { getUndervalued, MAX_PLAYERS } from '../api/aggregates.js';
import FilterPanel from '../components/FilterPanel.jsx';
import PlayersTable from '../components/PlayersTable.jsx';
import ValueScatter from '../components/ValueScatter.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { ErrorMessage, Loading, Notice } from '../components/Status.jsx';
import { useApi } from '../hooks/useApi.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { useFilters, validateFilters } from '../hooks/useFilters.jsx';

export default function ExplorerPage() {
  const navigate = useNavigate();
  const { filters } = useFilters();
  const debounced = useDebouncedValue(filters);
  const problem = validateFilters(debounced);

  // Scatter and table share this one request, built from the global filters,
  // so they always show the same players.
  const { data, error, loading, retry } = useApi(
    (signal) => (problem ? Promise.resolve(null) : getUndervalued(debounced, signal)),
    [debounced, problem]
  );

  const openPlayer = useCallback((player) => navigate(`/players/${player._id}`), [navigate]);

  return (
    <div className="explorer">
      <PageHeader
        title="Explorador"
        description="Compara el valor de mercado de cada jugador con su referencia por comparables."
      />
      <FilterPanel />
      <div className="explorer-content">
        <ExplorerBody
          data={data}
          error={error}
          loading={loading}
          problem={problem}
          retry={retry}
          onSelect={openPlayer}
        />
      </div>
    </div>
  );
}

function ExplorerBody({ data, error, loading, problem, retry, onSelect }) {
  if (problem) return <Notice>{problem}</Notice>;
  if (error) return <ErrorMessage error={error} onRetry={retry} />;
  if (!data) return <Loading>Cargando jugadores…</Loading>;
  if (data.total === 0) {
    return <Notice>Ningún jugador cumple los filtros. Prueba a ampliarlos.</Notice>;
  }

  return (
    <>
      <div role="status" className="result-count">
        {loading && <><span className="spinner" aria-hidden="true" />Actualizando… </>}
        {data.total > MAX_PLAYERS
          ? `Mostrando ${MAX_PLAYERS} de ${data.total} jugadores con mayor diferencia de valor. Afina los filtros para ver el resto.`
          : `${data.total} ${data.total === 1 ? 'jugador' : 'jugadores'}`}
      </div>
      <div className="explorer-content" aria-busy={loading}>
        <section className="card" aria-labelledby="value-chart-heading">
          <h2 id="value-chart-heading" className="panel-heading">Mercado frente a referencia</h2>
          <ValueScatter players={data.data} onSelect={onSelect} />
        </section>
        <section className="card" aria-labelledby="players-heading">
          <h2 id="players-heading" className="panel-heading">Jugadores</h2>
          <PlayersTable players={data.data} />
        </section>
      </div>
    </>
  );
}
