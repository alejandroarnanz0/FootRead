export function parseBudget(text, unit) {
  const number = text.trim().replace(',', '.');
  const limit = unit === 'millions' ? /^(\d+)(?:\.(\d{1,6}))?$/ : /^(\d+)$/;
  const parts = limit.exec(number);
  if (!parts) return null;
  const euros = unit === 'millions' ? parts[1] + (parts[2] ?? '').padEnd(6, '0') : parts[1];
  const value = Number(euros);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function summarizeBudget(assignments, limit) {
  let known = 0;
  let unknown = 0;
  let total = 0n;
  const encountered = new Set();
  for (const player of Object.values(assignments)) {
    if (!player?._id || encountered.has(player._id)) continue;
    encountered.add(player._id);
    if (Number.isSafeInteger(player.currentValue) && player.currentValue > 0) {
      total += BigInt(player.currentValue);
      known++;
    } else unknown++;
  }
  const subtotal = total <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(total) : total;
  if (limit === null) return { known, unknown, subtotal, state: 'off' };
  if (!Number.isSafeInteger(limit) || limit <= 0) return { known, unknown, subtotal, state: 'invalid' };
  const delta = BigInt(limit) - total;
  const state = delta < 0n ? 'over' : unknown ? 'partial' : known ? 'within' : 'empty';
  return {
    known, unknown, subtotal, state,
    delta: delta >= -BigInt(Number.MAX_SAFE_INTEGER) ? Number(delta) : delta,
    progress: delta < 0n ? 100 : Number(total) / limit * 100,
  };
}
