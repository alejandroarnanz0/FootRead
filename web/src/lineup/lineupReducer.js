import { roleFit } from './formations.js';

export const newLineup = (formation = '4-3-3') => ({
  id: null, revision: null, name: '', formation, assignments: {}, budgetEuros: null,
});

export function loadLineup(data) {
  return {
    id: data._id, revision: data.revision, name: data.name, formation: data.formation,
    budgetEuros: data.budgetEuros,
    assignments: Object.fromEntries(data.slots.map(({ slotId, playerId, player }) => [
      slotId, player ?? { _id: playerId, name: 'Jugador no disponible', unavailable: true },
    ])),
  };
}

export function lineupPayload(lineup) {
  return {
    name: lineup.name, formation: lineup.formation, budgetEuros: lineup.budgetEuros,
    revision: lineup.revision,
    slots: Object.entries(lineup.assignments).map(([slotId, player]) => ({ slotId, playerId: player._id })),
  };
}

export const assignedSlot = (assignments, playerId) =>
  Object.keys(assignments).find((id) => assignments[id]._id === playerId);

export const selectedPlayerFilter = (assignments) =>
  [...new Set(Object.values(assignments).map(({ _id }) => _id))].sort().join(',');

export function proposeFormation(lineup, formation, catalog) {
  const targets = catalog[formation].slots;
  const assignments = {};
  const pending = new Map();
  for (const old of catalog[lineup.formation].slots) {
    const player = lineup.assignments[old.id];
    if (!player) continue;
    if (targets.some(({ id, role }) => id === old.id && role === old.role)) assignments[old.id] = player;
    else pending.set(old.id, { old, player });
  }

  // Compare all candidates in each pass so two players cannot claim a slot by iteration order.
  const passes = [
    (target, { player }) => roleFit(player, target.role) === 'exact',
    (target, { old }) => target.role === old.role,
    (target, { old, player }) => target.side === old.side && roleFit(player, target.role) === 'related',
  ];
  for (const compatible of passes) {
    let assigned;
    do {
      assigned = false;
      const claims = new Map();
      for (const entry of pending.values()) {
        const candidates = targets.filter((target) => !assignments[target.id] && compatible(target, entry));
        const sameSide = candidates.filter(({ side }) => side === entry.old.side);
        const chosen = sameSide.length === 1 ? sameSide[0] : candidates.length === 1 ? candidates[0] : null;
        if (chosen) claims.set(chosen.id, [...(claims.get(chosen.id) ?? []), entry]);
      }
      for (const [id, entries] of claims) {
        if (entries.length !== 1) continue;
        const [{ old, player }] = entries;
        assignments[id] = player;
        pending.delete(old.id);
        assigned = true;
      }
    } while (assigned);
  }
  const unresolved = [...pending.values()].map(({ old, player }) => ({ slotId: old.id, player }));
  return { formation, assignments, unresolved };
}

export function lineupReducer(lineup, action, catalog) {
  switch (action.type) {
    case 'load': return action.lineup;
    case 'name': return { ...lineup, name: action.value };
    case 'budget': return { ...lineup, budgetEuros: action.value };
    case 'clear': return { ...lineup, assignments: {} };
    case 'formation': return { ...lineup, formation: action.proposal.formation, assignments: action.proposal.assignments };
    case 'remove': {
      if (!lineup.assignments[action.slotId]) return lineup;
      const assignments = { ...lineup.assignments };
      delete assignments[action.slotId];
      return { ...lineup, assignments };
    }
    case 'place': {
      const { player, slotId } = action;
      if (!player?._id || !catalog[lineup.formation].slots.some(({ id }) => id === slotId)) return lineup;
      const origin = assignedSlot(lineup.assignments, player._id);
      if (origin === slotId) return lineup;
      const previous = lineup.assignments[slotId];
      if (!origin && previous && !action.replace) return lineup;
      const assignments = { ...lineup.assignments, [slotId]: player };
      if (origin && previous) assignments[origin] = previous;
      else if (origin) delete assignments[origin];
      return { ...lineup, assignments };
    }
    default: return lineup;
  }
}
