const euros = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });

// 74500000 -> "74,5 M€", 475000 -> "475 K€"
export function formatEuros(value) {
  if (value === null || value === undefined) return '—';
  const sign = value < 0 ? '−' : '';
  const abs = Math.abs(value);
  if (abs >= 1e6) return `${sign}${euros.format(abs / 1e6)} M€`;
  if (abs >= 1e3) return `${sign}${euros.format(abs / 1e3)} K€`;
  return `${sign}${euros.format(abs)} €`;
}

// Same, with an explicit + for positive residuals.
export function formatResidual(value) {
  return value > 0 ? `+${formatEuros(value)}` : formatEuros(value);
}

export function ageFrom(birthDate, now = new Date()) {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  let age = now.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export const POSITION_LABELS = { GK: 'Portero', DF: 'Defensa', MF: 'Centrocampista', FW: 'Delantero' };
