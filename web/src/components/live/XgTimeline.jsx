import { CartesianGrid, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Notice } from '../Status.jsx';
import { formatXg } from './matchData.js';

function TimelineTooltip({ active, payload, label }) {
  if (!active || !payload?.length || !Number.isFinite(label)) return null;
  return (
    <div className="chart-tooltip live-chart-tooltip">
      <strong>Minuto {Math.floor(label)}</strong>
      {payload.map((line) => <span key={line.dataKey} className={`live-${line.dataKey}`}>{line.name}<b>{formatXg(line.value)} xG</b></span>)}
    </div>
  );
}

export default function XgTimeline({ match, summary, selection, latest }) {
  const { totals, timeline } = summary;
  const missing = totals.home.shots + totals.away.shots - totals.home.measured - totals.away.measured;
  const hasXg = totals.home.measured + totals.away.measured > 0;
  return (
    <section className="card live-panel" aria-labelledby="live-xg-title">
      <div className="live-panel-heading"><h2 id="live-xg-title">Evolución del xG</h2><span>Acumulado por equipo</span></div>
      {hasXg ? (
        <>
          <div className="live-chart-legend">
            <span className="live-home">{match.homeTeam}</span>
            <span className="live-away">{match.awayTeam}</span>
          </div>
          <div className="live-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeline} margin={{ top: 14, right: 18, bottom: 4, left: 4 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="time" type="number" domain={[0, 'dataMax + 1']} tickFormatter={(time) => `${Math.floor(time)}′`} />
                <YAxis width={40} allowDecimals />
                <Tooltip content={<TimelineTooltip />} />
                <Line type="stepAfter" dataKey="home" name={match.homeTeam} stroke="var(--live-home)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                <Line type="stepAfter" dataKey="away" name={match.awayTeam} stroke="var(--live-away)" strokeWidth={2.5} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
                {latest && <ReferenceDot key={latest.sequence} className="live-xg-new" x={latest.time} y={latest[latest.side]} r={7} fill={`var(--live-${latest.side})`} stroke="var(--surface)" strokeWidth={2} />}
                {selection && <ReferenceDot className="live-xg-selected" x={selection.time} y={selection[selection.side]} r={10} fill="none" stroke="var(--text)" strokeWidth={2} />}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : <Notice>No hay valores de xG disponibles para mostrar la evolución.</Notice>}
      {missing > 0 && <p className="live-note">xG parcial · Tiros sin xG: {missing}.</p>}
    </section>
  );
}
