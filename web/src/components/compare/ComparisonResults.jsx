import { formatEuros, formatResidual } from '../../format.js';
import ComparisonMetrics from './ComparisonMetrics.jsx';
import PlayerIdentity from './PlayerIdentity.jsx';
import SeasonStats from './SeasonStats.jsx';

const percent = new Intl.NumberFormat('es-ES', { style: 'percent', signDisplay: 'exceptZero', maximumFractionDigits: 1 });

function marketDifference(player) {
  const { currentValue, predictedValue } = player;
  return Number.isFinite(currentValue) && Number.isFinite(predictedValue)
    ? predictedValue - currentValue : null;
}

export default function ComparisonResults({ players, directory }) {
  const differences = players.map(marketDifference);
  const marketRows = [
    { label: 'Valor de mercado', values: players.map((player) => player.currentValue), format: formatEuros, bars: true },
    { label: 'Referencia por comparables', values: players.map((player) => player.predictedValue), format: formatEuros, bars: true },
    { label: 'Diferencia frente al mercado', values: differences, format: formatResidual, signed: true },
    {
      label: 'Diferencia relativa',
      values: differences.map((value, index) => value !== null && players[index].currentValue > 0 ? value / players[index].currentValue : null),
      format: (value) => percent.format(value),
      signed: true,
    },
  ];

  return (
    <>
      <div className="compare-identities">{players.map((player, index) => (
        <PlayerIdentity key={player._id} player={player} directory={directory} side={index + 1} />
      ))}</div>
      <section className="card compare-panel" aria-labelledby="compare-market-title">
        <header className="compare-panel-heading"><h2 id="compare-market-title">Mercado y scouting</h2></header>
        <ComparisonMetrics players={players} rows={marketRows} titleId="compare-market-title" />
        <p className="compare-context">La diferencia resta el valor de mercado de la referencia por comparables. La referencia es una heurística.</p>
      </section>
      <SeasonStats players={players} />
    </>
  );
}
