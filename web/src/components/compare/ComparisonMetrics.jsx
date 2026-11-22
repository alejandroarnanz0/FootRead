export default function ComparisonMetrics({ players, rows, titleId }) {
  return (
    <table className="compare-metrics" aria-labelledby={titleId}>
      <thead>
        <tr>
          <th scope="col">{players[0].name}</th>
          <th scope="col">Métrica</th>
          <th scope="col">{players[1].name}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ label, values, format, bars, signed }) => {
          const max = bars ? Math.max(0, ...values.filter(Number.isFinite)) : 0;
          const renderValue = (value) => {
            const known = Number.isFinite(value);
            const sign = signed && (value > 0 ? 'positive' : value < 0 ? 'negative' : null);
            return (
              <td>
                <strong className="compare-metric-value" data-sign={sign || undefined} data-missing={!known}>
                  {known ? format(value) : 'No disponible'}
                </strong>
                {bars && (
                  <span className="compare-track" aria-hidden="true" data-missing={!known}>
                    {max > 0 && known && <i style={{ width: `${value / max * 100}%` }} />}
                  </span>
                )}
              </td>
            );
          };
          return (
            <tr key={label}>
              {renderValue(values[0])}
              <th scope="row">{label}</th>
              {renderValue(values[1])}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
