import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { formatEuros, formatResidual, POSITION_LABELS } from '../format.js';

// 1-3-10 steps: enough ticks to read a log scale without crowding it.
const TICKS = [1e4, 3e4, 1e5, 3e5, 1e6, 3e6, 1e7, 3e7, 1e8, 3e8];

// Both axes share one log domain. Above the line, the reference exceeds market value.
function sharedDomain(players) {
  const values = players.flatMap((p) => [p.currentValue, p.predictedValue]);
  return [Math.min(...values) / 1.5, Math.max(...values) * 1.5];
}

function PlayerTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <strong className="tooltip-value">{formatResidual(p.residual)}</strong>
      <span className="tooltip-name">{p.name}</span>
      <span className="tooltip-meta">
        {POSITION_LABELS[p.position]} · {p.club ? p.club.name : 'Sin club'}
      </span>
      <span className="tooltip-meta">
        Mercado {formatEuros(p.currentValue)} · Referencia {formatEuros(p.predictedValue)}
      </span>
      <span className="tooltip-hint">Clic para abrir la ficha</span>
    </div>
  );
}

// Distinct shapes share the same 24px hit area.
const dotShape = (kind, onSelect) =>
  function Dot({ cx, cy, payload }) {
    return (
      <g className={`dot dot-${kind}`} onClick={() => onSelect(payload)}>
        <circle className="dot-hit" cx={cx} cy={cy} r={12} />
        {kind === 'under' && <circle className="dot-mark" cx={cx} cy={cy} r={4.5} />}
        {kind === 'over' && <rect className="dot-mark" x={cx - 4.5} y={cy - 4.5} width={9} height={9} />}
        {kind === 'neutral' && <path className="dot-mark" d={`M ${cx} ${cy - 6} l 6 6 -6 6 -6 -6 Z`} />}
      </g>
    );
  };

export default function ValueScatter({ players, onSelect }) {
  const under = players.filter((p) => p.residual > 0);
  const over = players.filter((p) => p.residual < 0);
  const neutral = players.filter((p) => p.residual === 0);
  const [lo, hi] = sharedDomain(players);
  const ticks = TICKS.filter((t) => t >= lo && t <= hi);

  return (
    <figure className="scatter">
      <ul className="legend" aria-label="Leyenda">
        <li>
          <span className="swatch swatch-under" aria-hidden="true" />
          Por debajo de su referencia ({under.length})
        </li>
        <li>
          <span className="swatch swatch-over" aria-hidden="true" />
          Por encima de su referencia ({over.length})
        </li>
        <li>
          <span className="swatch swatch-neutral" aria-hidden="true" />
          En su referencia ({neutral.length})
        </li>
      </ul>

      <p className="chart-axis-title">Referencia por comparables ↑</p>
      <ResponsiveContainer width="100%" height="100%" className="chart-frame">
        <ScatterChart margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid />
          <XAxis
            type="number"
            dataKey="currentValue"
            name="Valor de mercado"
            scale="log"
            domain={[lo, hi]}
            ticks={ticks}
            allowDataOverflow
            tickFormatter={formatEuros}
            minTickGap={16}
          />
          <YAxis
            type="number"
            dataKey="predictedValue"
            name="Referencia por comparables"
            scale="log"
            domain={[lo, hi]}
            ticks={ticks}
            allowDataOverflow
            width={60}
            tickFormatter={formatEuros}
          />
          <ReferenceLine
            className="diagonal"
            segment={[
              { x: lo, y: lo },
              { x: hi, y: hi },
            ]}
            ifOverflow="hidden"
          />
          <Tooltip cursor={false} content={<PlayerTooltip />} isAnimationActive={false} />
          <Scatter name="Infravalorados" data={under} shape={dotShape('under', onSelect)} isAnimationActive={false} />
          <Scatter name="Sobrevalorados" data={over} shape={dotShape('over', onSelect)} isAnimationActive={false} />
          <Scatter name="En su referencia" data={neutral} shape={dotShape('neutral', onSelect)} isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
      <p className="chart-axis-title chart-axis-title-x">Valor de mercado →</p>

      <figcaption>
        Ambos ejes usan escala logarítmica. Sobre la diagonal, la referencia supera al valor de mercado.
        También puedes abrir cada ficha desde la tabla.
      </figcaption>
    </figure>
  );
}
