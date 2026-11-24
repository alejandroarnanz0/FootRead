const definitions = require('./lineupFormations.json');

const lane = {
  LB: 'left', LWB: 'left', LM: 'left', LW: 'left',
  RB: 'right', RWB: 'right', RM: 'right', RW: 'right',
};
const spacing = {
  1: [50], 2: [35, 65], 3: [23, 50, 77], 4: [14, 38, 62, 86], 5: [11, 30.5, 50, 69.5, 89],
};

const formations = Object.entries(definitions).map(([key, { variant, description, lines }]) => {
  const rows = [['GK'], ...lines];
  const slots = rows.flatMap((row, line) => {
    const wide = Boolean(lane[row[0]] && lane[row.at(-1)]);
    const xPositions = wide && row.length === 2 ? [17, 83]
      : wide && row.length === 3 ? [16, 50, 84] : spacing[row.length];
    return row.map((spec, index) => {
      const [id, override] = spec.split(':');
      const role = override ?? id.split('_')[0];
      const side = lane[role] ?? (id.endsWith('_L') ? 'left' : id.endsWith('_R') ? 'right' : 'center');
      return { id, role, side, line, lineSize: row.length, x: xPositions[index], y: 90 - line * 80 / (rows.length - 1) };
    });
  });
  return { key, name: variant ? `${key} · ${variant}` : key, description, defenders: Number(key[0]), slots };
});

module.exports = formations;
