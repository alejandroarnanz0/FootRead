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

// Both axes share one log domain, so the diagonal sits at 45 degrees and
// "above the line" means the model values the player above the market.
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
        Real {formatEuros(p.currentValue)} · Predicho {formatEuros(p.predictedValue)}
      </span>
      <span className="tooltip-hint">Clic para abrir la ficha</span>
    </div>
  );
}

// Visible 9px dot with a surface ring, inside a transparent 24px hit area.
const dotShape = (kind, onSelect) =>
  function Dot({ cx, cy, payload }) {
    return (
      <g className={`dot dot-${kind}`} onClick={() => onSelect(payload)}>
        <circle className="dot-hit" cx={cx} cy={cy} r={12} />
        <circle className="dot-mark" cx={cx} cy={cy} r={4.5} />
      </g>
    );
  };

export default function ValueScatter({ players, onSelect }) {
  const under = players.filter((p) => p.residual > 0);
  const over = players.filter((p) => p.residual <= 0);
  const [lo, hi] = sharedDomain(players);
  const ticks = TICKS.filter((t) => t >= lo && t <= hi);

  return (
    <figure className="scatter">
      <ul className="legend" aria-label="Leyenda">
        <li>
          <span className="swatch swatch-under" aria-hidden="true" />
          Infravalorados: el modelo los tasa por encima del mercado ({under.length})
        </li>
        <li>
          <span className="swatch swatch-over" aria-hidden="true" />
          Sobrevalorados o en precio ({over.length})
        </li>
      </ul>

      <ResponsiveContainer width="100%" height={440}>
        <ScatterChart margin={{ top: 8, right: 16, bottom: 36, left: 8 }}>
          <CartesianGrid />
          <XAxis
            type="number"
            dataKey="currentValue"
            name="Valor real"
            scale="log"
            domain={[lo, hi]}
            ticks={ticks}
            allowDataOverflow
            tickFormatter={formatEuros}
            label={{ value: 'Valor real de mercado', position: 'insideBottom', offset: -24 }}
          />
          <YAxis
            type="number"
            dataKey="predictedValue"
            name="Valor predicho"
            scale="log"
            domain={[lo, hi]}
            ticks={ticks}
            allowDataOverflow
            width={76}
            tickFormatter={formatEuros}
            label={{ value: 'Valor predicho por el modelo', angle: -90, position: 'insideLeft', offset: 4, dy: 90 }}
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
        </ScatterChart>
      </ResponsiveContainer>

      <figcaption>
        Escala logarítmica en ambos ejes. La diagonal marca dónde mercado y modelo coinciden: cuanto más
        por encima de ella, más infravalorado está el jugador.
      </figcaption>
    </figure>
  );
}
