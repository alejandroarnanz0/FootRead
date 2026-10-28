import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { ageFrom, formatEuros, formatResidual } from '../format.js';

const collator = new Intl.Collator('es');

const COLUMNS = [
  { key: 'name', label: 'Jugador', value: (p) => p.name },
  { key: 'position', label: 'Pos.', value: (p) => p.position },
  { key: 'age', label: 'Edad', value: (p) => ageFrom(p.birthDate), numeric: true },
  { key: 'club', label: 'Club', value: (p) => (p.club ? p.club.name : '') },
  { key: 'currentValue', label: 'Valor real', value: (p) => p.currentValue, numeric: true, format: formatEuros },
  { key: 'predictedValue', label: 'Valor predicho', value: (p) => p.predictedValue, numeric: true, format: formatEuros },
  { key: 'residual', label: 'Residuo', value: (p) => p.residual, numeric: true, format: formatResidual },
];

function compare(a, b) {
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  return typeof a === 'string' ? collator.compare(a, b) : a - b;
}

// Sorting is table state, not a filter: it reorders the rows already loaded
// and does not touch the global filters.
export default function PlayersTable({ players }) {
  const [sort, setSort] = useState({ key: 'residual', dir: 'desc' });

  const rows = useMemo(() => {
    const column = COLUMNS.find((c) => c.key === sort.key);
    const sorted = [...players].sort((a, b) => compare(column.value(a), column.value(b)));
    return sort.dir === 'desc' ? sorted.reverse() : sorted;
  }, [players, sort]);

  const toggle = (key) =>
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }
    );

  return (
    <div className="table-wrap">
      <table className="players-table">
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                className={c.numeric ? 'num' : undefined}
                aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                <button type="button" onClick={() => toggle(c.key)}>
                  {c.label}
                  <span className="sort-mark" aria-hidden="true">
                    {sort.key === c.key ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
                  </span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p._id}>
              {COLUMNS.map((c) => {
                const value = c.value(p);
                if (c.key === 'name') {
                  return (
                    <td key={c.key}>
                      <Link to={`/players/${p._id}`}>{p.name}</Link>
                    </td>
                  );
                }
                if (c.key === 'residual') {
                  return (
                    <td key={c.key} className="num">
                      <span className={`swatch ${value > 0 ? 'swatch-under' : 'swatch-over'}`} aria-hidden="true" />
                      {c.format(value)}
                    </td>
                  );
                }
                return (
                  <td key={c.key} className={c.numeric ? 'num' : undefined}>
                    {c.format ? c.format(value) : (value ?? '—')}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
