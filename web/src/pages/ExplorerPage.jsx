import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { getUndervalued, MAX_PLAYERS } from '../api/aggregates.js';
import FilterPanel from '../components/FilterPanel.jsx';
import PlayersTable from '../components/PlayersTable.jsx';
import ValueScatter from '../components/ValueScatter.jsx';
import { ErrorMessage, Loading } from '../components/Status.jsx';
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
      <FilterPanel />

      <section className="explorer-content">
        <header className="page-head">
          <h1>Explorador</h1>
          <p className="muted">Valor real de mercado frente al valor que predice el modelo.</p>
        </header>

        <ExplorerBody
          data={data}
          error={error}
          loading={loading}
          problem={problem}
          retry={retry}
          onSelect={openPlayer}
        />
      </section>
    </div>
  );
}

function ExplorerBody({ data, error, loading, problem, retry, onSelect }) {
  if (problem) return <p className="notice">{problem}</p>;
  if (error) return <ErrorMessage error={error} onRetry={retry} />;
  if (!data) return <Loading>Cargando jugadores…</Loading>;
  if (data.total === 0) {
    return <p className="notice">Ningún jugador cumple los filtros. Prueba a ampliarlos.</p>;
  }

  return (
    // While new data loads, the previous render stays at reduced opacity.
    <div className={loading ? 'refreshing' : undefined} aria-busy={loading}>
      <p className="result-count">
        {loading && <span className="spinner" aria-hidden="true" />}
        {data.total > MAX_PLAYERS
          ? `Mostrando ${MAX_PLAYERS} de ${data.total} jugadores (los de mayor residuo). Afina los filtros para ver el resto.`
          : `${data.total} jugadores`}
      </p>
      <div className="card">
        <ValueScatter players={data.data} onSelect={onSelect} />
      </div>
      <div className="card">
        <PlayersTable players={data.data} />
      </div>
    </div>
  );
}
