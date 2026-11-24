const roles = {
  GK: ['Portero', 'POR', 'Goalkeeper'],
  LB: ['Lateral izquierdo', 'LI', 'Left-Back'],
  RB: ['Lateral derecho', 'LD', 'Right-Back'],
  CB: ['Central', 'DFC', 'Centre-Back'],
  CDM: ['Mediocentro defensivo', 'MCD', 'Defensive Midfield'],
  CM: ['Mediocentro', 'MC', 'Central Midfield'],
  CAM: ['Mediocentro ofensivo', 'MCO', 'Attacking Midfield'],
  LM: ['Medio izquierdo', 'MI', 'Left Midfield'],
  RM: ['Medio derecho', 'MD', 'Right Midfield'],
  LW: ['Extremo izquierdo', 'EI', 'Left Winger'],
  RW: ['Extremo derecho', 'ED', 'Right Winger'],
  ST: ['Delantero centro', 'DC', 'Centre-Forward'],
  CF: ['Segundo delantero', 'SD', 'Second Striker'],
  LWB: ['Carrilero izquierdo', 'CAI'],
  RWB: ['Carrilero derecho', 'CAD'],
};

const affinities = {
  LB: ['Left Midfield'], RB: ['Right Midfield'],
  LWB: ['Left-Back', 'Left Midfield'], RWB: ['Right-Back', 'Right Midfield'],
  LM: ['Left Winger', 'Left-Back'], RM: ['Right Winger', 'Right-Back'],
  LW: ['Left Midfield'], RW: ['Right Midfield'],
  CDM: ['Central Midfield'], CM: ['Defensive Midfield', 'Attacking Midfield'],
  CAM: ['Central Midfield', 'Second Striker'],
  CF: ['Attacking Midfield', 'Centre-Forward'],
  ST: ['Second Striker'],
};

export function indexFormations(catalog) {
  return Object.fromEntries(catalog.map(({ key, slots, ...formation }) => [key, {
    key, ...formation,
    slots: slots.map((slot) => {
      const [name, label] = roles[slot.role];
      const suffix = /_(L|R)$/.test(slot.id) ? slot.side === 'left' ? ' izquierdo' : ' derecho' : '';
      return { ...slot, name: name + suffix, label };
    }),
  }]));
}

export const POSITION_NAMES = {
  ...Object.fromEntries(Object.values(roles).filter((entry) => entry[2]).map(([name, , source]) => [source, name])),
};

export function suggestedPositions(role, includeRelated = true) {
  const registered = roles[role]?.[2];
  return [registered, ...(includeRelated || !registered ? affinities[role] ?? [] : [])].filter(Boolean);
}

export function roleFit(player, role) {
  if (!player?.subPosition) return 'unknown';
  if (player.subPosition === roles[role]?.[2]) return 'exact';
  return (affinities[role] ?? []).includes(player.subPosition) ? 'related' : 'outside';
}

export const FIT_LABELS = {
  exact: 'Coincide con su posición',
  related: 'Rol afín sugerido',
  outside: 'Fuera de su posición registrada',
  unknown: 'Posición registrada no disponible',
};
