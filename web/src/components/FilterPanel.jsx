import { listCompetitions } from '../api/competitions.js';
import { useApi } from '../hooks/useApi.js';
import { useFilters, validateFilters } from '../hooks/useFilters.jsx';
import { POSITION_LABELS } from '../format.js';
import { ErrorMessage } from './Status.jsx';

const toNumber = (text) => (text === '' ? null : Number(text));
const show = (value) => (value === null ? '' : value);

export default function FilterPanel() {
  const { filters, setFilter, togglePosition, resetFilters } = useFilters();
  const competitions = useApi((signal) => listCompetitions(signal), []);
  const problem = validateFilters(filters);

  return (
    <aside className="filters card" aria-label="Filtros">
      <div className="filters-head">
        <h2>Filtros</h2>
        <button type="button" className="link-button" onClick={resetFilters}>
          Limpiar
        </button>
      </div>

      <fieldset>
        <legend>Posición</legend>
        {Object.entries(POSITION_LABELS).map(([code, label]) => (
          <label key={code} className="check">
            <input
              type="checkbox"
              checked={filters.position.includes(code)}
              onChange={() => togglePosition(code)}
            />
            {label}
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>Edad</legend>
        <div className="range">
          <label>
            <span>Mín.</span>
            <input
              type="number"
              min="15"
              max="45"
              value={show(filters.minAge)}
              onChange={(e) => setFilter('minAge', toNumber(e.target.value))}
            />
          </label>
          <label>
            <span>Máx.</span>
            <input
              type="number"
              min="15"
              max="45"
              value={show(filters.maxAge)}
              onChange={(e) => setFilter('maxAge', toNumber(e.target.value))}
            />
          </label>
        </div>
        {problem && <p className="field-error">{problem}</p>}
      </fieldset>

      <label className="field">
        <span>Competición</span>
        {competitions.error ? (
          <ErrorMessage
            title="No se han podido cargar las competiciones"
            error={competitions.error}
            onRetry={competitions.retry}
          />
        ) : (
          <select
            value={filters.competition}
            disabled={!competitions.data}
            onChange={(e) => setFilter('competition', e.target.value)}
          >
            <option value="">{competitions.data ? 'Todas' : 'Cargando…'}</option>
            {competitions.data &&
              competitions.data.data.map((c) => (
                <option key={c._id} value={c.code}>
                  {c.name}
                </option>
              ))}
          </select>
        )}
      </label>

      <label className="field">
        <span>Valor de mercado máximo (M€)</span>
        <input
          type="number"
          min="0"
          step="0.5"
          placeholder="Sin límite"
          value={filters.maxValue === null ? '' : filters.maxValue / 1e6}
          onChange={(e) => {
            const millions = toNumber(e.target.value);
            setFilter('maxValue', millions === null ? null : Math.round(millions * 1e6));
          }}
        />
      </label>
    </aside>
  );
}
