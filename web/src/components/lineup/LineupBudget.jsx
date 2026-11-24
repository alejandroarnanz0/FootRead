import { useState } from 'react';
import { parseBudget, summarizeBudget } from '../../lineup/budget.js';

const currency = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const euros = (value) => currency.format(value);

function inputAmount(value, unit) {
  if (!value) return '';
  if (unit === 'euros') return String(value);
  const digits = String(value).padStart(7, '0');
  const fraction = digits.slice(-6).replace(/0+$/, '');
  return String(Number(digits.slice(0, -6))) + (fraction ? `,${fraction}` : '');
}

export default function LineupBudget({ assignments, limit, onLimit }) {
  const [unit, setUnit] = useState('euros');
  const [text, setText] = useState(() => inputAmount(limit, 'euros'));
  const summary = summarizeBudget(assignments, limit);
  const { known, unknown, subtotal, state, delta, progress } = summary;
  const enabled = limit !== null;
  return <section className="card xi-budget" aria-labelledby="xi-budget-title">
    <div className="xi-section-head">
      <div><h2 id="xi-budget-title">Valor del once</h2>
        <strong className="xi-total">{known || !unknown ? euros(subtotal) : 'Sin valor conocido'}</strong></div>
      <label className="xi-switch"><input type="checkbox" checked={enabled} onChange={(e) => {
        onLimit(e.target.checked ? parseBudget(text, unit) ?? undefined : null);
      }} />Activar presupuesto</label>
    </div>
    <p className="xi-coverage">{known} con valoración{unknown ? ` · ${unknown} sin valoración` : ''}
      {unknown && known ? ' · Subtotal parcial' : ''}</p>
    {enabled && <div className="xi-budget-config">
      <div className="xi-budget-fields">
        <label className="field"><span>Límite</span><input type="text" inputMode={unit === 'euros' ? 'numeric' : 'decimal'}
          aria-invalid={state === 'invalid'} aria-describedby={state === 'invalid' ? 'xi-budget-state' : undefined}
          value={text} onChange={(e) => {
            setText(e.target.value);
            onLimit(parseBudget(e.target.value, unit) ?? undefined);
          }} /></label>
        <label className="field"><span>Unidad</span><select value={unit} onChange={(e) => {
          setUnit(e.target.value);
          setText(inputAmount(limit, e.target.value));
        }}><option value="euros">Euros (€)</option><option value="millions">Millones (M€)</option></select></label>
      </div>
      <div id="xi-budget-state" className="xi-budget-state" data-budget-state={state} role="status">
        {state === 'within' && <><strong><span aria-hidden="true">✓</span> Dentro del presupuesto</strong><span>{euros(delta)} disponibles</span></>}
        {state === 'over' && <><strong><span aria-hidden="true">!</span> Presupuesto superado</strong><span>{unknown ? 'Exceso de al menos ' : 'Exceso de '}{euros(-delta)}</span></>}
        {state === 'partial' && <><strong>Presupuesto indeterminado</strong><span>Hay jugadores sin valor registrado.</span></>}
        {state === 'empty' && <span>Añade jugadores para calcular el consumo.</span>}
        {state === 'invalid' && <span>Introduce un importe positivo con precisión de un euro.</span>}
        {(state === 'within' || state === 'over') && <>
          <progress aria-label="Consumo del presupuesto" max="100" value={progress} />
          {known + unknown < 11 && <small>Sobre los jugadores colocados.</small>}
        </>}
      </div>
    </div>}
  </section>;
}
