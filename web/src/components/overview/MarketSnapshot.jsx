import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ErrorMessage, Loading, Notice } from '../Status.jsx';
import { formatEuros, POSITION_LABELS } from '../../format.js';

const formatCount = new Intl.NumberFormat('es-ES').format;
const formatPercent = new Intl.NumberFormat('es-ES', { style: 'percent', maximumFractionDigits: 1 }).format;
const metricIcons = [
  'M10 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM4 17v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2M15 5a3 3 0 0 1 0 5m2 2a3 3 0 0 1 2 3v2',
  'M6 3h8v5a4 4 0 1 1-8 0V3ZM6 5H3v2a3 3 0 0 0 3 3m8-5h3v2a3 3 0 0 1-3 3m-4 2v5m-4 0h8',
  'M3 6h14M3 10h9M3 14h14M7 4v4m8 4v4m0-8v4',
  'M15 6a4 4 0 0 0-7 3v2a4 4 0 0 0 7 3M5 9h7m-7 2h6',
];

function Kpis({ data }) {
  const coverage = data.players ? formatPercent(data.scoredPlayers / data.players) : null;
  const metrics = [
    ['Jugadores', formatCount(data.players), 'Registros de Transfermarkt'],
    ['Competiciones', formatCount(data.competitions), 'Catálogo de scouting'],
    ['Con referencia', formatCount(data.scoredPlayers), coverage ? `${coverage} de los jugadores` : 'Sin jugadores registrados'],
    ['Valor medio de mercado', formatEuros(data.averageMarketValue), `${formatCount(data.valuedPlayers)} jugadores con valor`],
  ];
  return (
    <dl className="overview-kpis">
      {metrics.map(([label, value, detail], index) => (
        <div key={label}>
          <dt><svg viewBox="0 0 20 20" aria-hidden="true"><path d={metricIcons[index]} /></svg>{label}</dt>
          <dd>{value}<small>{detail}</small></dd>
        </div>
      ))}
    </dl>
  );
}

function Positions({ data }) {
  return (
    <section className="card overview-panel" aria-labelledby="overview-positions">
      <h3 id="overview-positions">Distribución por posición</h3>
      <ul className="overview-position-list">
        {Object.entries(POSITION_LABELS).map(([position, label]) => {
          const count = data.positions[position] ?? 0;
          const share = count / data.players;
          return (
            <li key={position}>
              <span>{label}</span>
              <span className="overview-position-total"><small>{formatPercent(share)}</small><strong>{formatCount(count)}</strong></span>
              <div className="overview-meter" aria-hidden="true"><i style={{ width: `${share * 100}%` }} /></div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Ages({ data }) {
  const buckets = data.ageDistribution.map(({ min, max, count }) => ({
    label: min === 0 ? `≤${max}` : max === null ? `${min}+` : `${min}–${max}`, count,
  }));
  const known = buckets.reduce((total, bucket) => total + bucket.count, 0);
  return (
    <section className="card overview-panel" aria-labelledby="overview-ages">
      <h3 id="overview-ages">Distribución por edad</h3>
      {known ? (
        <>
          <div className="overview-age-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={buckets} margin={{ top: 12, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--grid)" />
                <XAxis dataKey="label" interval={0} tickLine={false} axisLine={false} tick={{ fill: 'var(--text-2)', fontSize: 11 }} />
                <YAxis allowDecimals={false} width={44} tickFormatter={formatCount} tickLine={false} axisLine={false} tick={{ fill: 'var(--text-2)', fontSize: 11 }} />
                <Tooltip cursor={{ fill: 'var(--hover)' }} contentStyle={{ background: 'var(--surface)', borderColor: 'var(--control-border)' }}
                  labelFormatter={(label) => `${label} años`} formatter={(value) => [formatCount(value), 'Jugadores']} />
                <Bar dataKey="count" fill="var(--accent)" maxBarSize={44} radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="overview-age-footer">
            <details>
              <summary>Ver cantidades por edad</summary>
              <dl className="overview-age-values">
                {buckets.map(({ label, count }) => <div key={label}><dt>{label} años</dt><dd>{formatCount(count)}</dd></div>)}
              </dl>
            </details>
            {known < data.players && <p className="muted">{formatCount(data.players - known)} sin edad disponible</p>}
          </div>
        </>
      ) : <Notice>No hay edades disponibles.</Notice>}
    </section>
  );
}

export default function MarketSnapshot({ request }) {
  const { data, error, retry } = request;
  if (error) return <ErrorMessage error={error} onRetry={retry} title="No se pudieron cargar las estadísticas" />;
  if (!data) return <Loading>Cargando estadísticas…</Loading>;
  return (
    <>
      <Kpis data={data} />
      {data.players ? (
        <div className="overview-columns overview-distributions">
          <Positions data={data} />
          <Ages data={data} />
        </div>
      ) : <Notice>No hay jugadores registrados.</Notice>}
    </>
  );
}
