import { BAND_LIMITS, BANDS, formatPct, shotVerdict, VERDICTS, xgBand } from './matchData.js';

// Horizontal 0–100 % bar with the two band limits marked (10 % and 30 %).
export function XgMeter({ xg, size = 'md' }) {
  const value = Number.isFinite(xg) ? Math.min(Math.max(xg, 0), 1) : 0;
  return (
    <span className={`xg-meter xg-meter-${size}`} data-band={xgBand(xg) ?? 'none'}
      style={{ '--xg': value, '--limit-possible': BAND_LIMITS.possible, '--limit-clear': BAND_LIMITS.clear }}
      aria-hidden="true">
      <span className="xg-meter-fill" />
    </span>
  );
}

// "Gol inesperado", "Fallo previsto"...: model errors carry a warning mark.
export function VerdictChip({ event, withBand = false }) {
  const key = shotVerdict(event);
  if (!key) return <span className="verdict-chip verdict-none">Sin xG</span>;
  const verdict = VERDICTS[key];
  return (
    <span className={`verdict-chip${verdict.error ? ' verdict-error' : ''}`} data-verdict={key}>
      {verdict.error && <span className="verdict-mark" role="img" aria-label="Error del modelo">!</span>}
      {verdict.label}
      {withBand && <small>{BANDS[verdict.band].label}</small>}
    </span>
  );
}

export function XgFigure({ xg, label = 'xG' }) {
  return (
    <span className="xg-figure">
      <small>{label}</small>
      <b>{formatPct(xg)}</b>
    </span>
  );
}
