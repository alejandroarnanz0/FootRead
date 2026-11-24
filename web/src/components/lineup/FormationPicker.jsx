import { useId, useState } from 'react';
import LineupDialog from './LineupDialog.jsx';

const groups = [3, 4, 5];
const fold = (value) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function FormationMiniature({ formation }) {
  return <svg className="xi-formation-mini" viewBox="0 0 68 88" aria-hidden="true">
    <rect x="2" y="2" width="64" height="84" rx="4" />
    <path d="M2 44H66M20 2v11h28V2M20 86V75h28v11" />
    <circle className="xi-formation-mini-center" cx="34" cy="44" r="7" />
    {formation.slots.map(({ id, x, y }) => <circle className="xi-formation-dot" key={id}
      cx={x * .64 + 2} cy={y * .84 + 2} r={2.4} />)}
  </svg>;
}

export default function FormationPicker({ formations, selected, onSelect, onClose }) {
  const [query, setQuery] = useState('');
  const descriptionId = useId();
  const matches = formations.filter(({ name, description }) =>
    fold(`${name} ${description}`).includes(fold(query.trim())));
  return <LineupDialog title="Elegir formación" onCancel={onClose}>
    <label className="field"><span>Buscar formación</span>
      <input type="search" value={query} placeholder="Ej. 4-3-3 o estrecha" onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          } else if (e.key === 'Enter' && matches.length === 1) {
            e.preventDefault();
            onSelect(matches[0].key);
          }
        }} /></label>
    <p className="xi-formation-count" role="status">{matches.length} {matches.length === 1 ? 'formación' : 'formaciones'}</p>
    <div className="xi-formation-groups">
      {groups.map((defenders) => {
        const choices = matches.filter((item) => item.defenders === defenders);
        return choices.length ? <section key={defenders} aria-labelledby={`xi-family-${defenders}`}>
          <h3 id={`xi-family-${defenders}`}>{defenders} defensas</h3>
          <ul className="xi-formation-list">
            {choices.map((formation) => {
              const id = descriptionId + formation.key.replace(/[^0-9-]/g, '');
              return <li key={formation.key}>
                <button type="button" className="xi-formation-option" data-formation={formation.key}
                  aria-label={formation.name} aria-describedby={id} aria-pressed={formation.key === selected}
                  onClick={() => onSelect(formation.key)}>
                  <FormationMiniature formation={formation} />
                  <span><strong>{formation.name}</strong><small id={id}>{formation.description}</small></span>
                  {formation.key === selected && <span className="xi-formation-selected" aria-hidden="true">✓</span>}
                </button>
              </li>;
            })}
          </ul>
        </section> : null;
      })}
      {!matches.length && <p>No hay formaciones que coincidan.</p>}
    </div>
  </LineupDialog>;
}
