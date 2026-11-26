const express = require('express');
const Lineup = require('../models/Lineup');
const catalog = require('../models/lineupCatalog');
const Player = require('../models/Player');
const asyncHandler = require('../utils/asyncHandler');
const httpError = require('../utils/httpError');

const router = express.Router();
const formations = new Map(catalog.map(({ key, slots }) => [key, new Set(slots.map(({ id }) => id))]));
const playerFields = 'name birthDate club position subPosition currentValue imageUrl externalIds.transfermarkt';
const isId = (value) => typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value);
const positiveInteger = (value) => Number.isSafeInteger(value) && value > 0;

function validate(body) {
  const { name, formation, slots, budgetEuros = null } = body ?? {};
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) {
    throw httpError(400, 'El nombre debe tener entre 1 y 80 caracteres.');
  }
  const allowedSlots = formations.get(formation);
  if (!allowedSlots) throw httpError(400, 'Formación no válida.');
  if (!Array.isArray(slots) || slots.length > 11) throw httpError(400, 'Indica hasta 11 jugadores.');
  if (budgetEuros !== null && !positiveInteger(budgetEuros)) throw httpError(400, 'Presupuesto no válido.');

  const slotIds = new Set();
  const playerIds = new Set();
  const assignments = slots.map((slot) => {
    const { slotId, playerId } = slot ?? {};
    if (!allowedSlots.has(slotId) || slotIds.has(slotId)) throw httpError(400, 'Hueco inválido o repetido.');
    if (!isId(playerId)) throw httpError(400, 'Identificador de jugador no válido.');
    const canonicalId = playerId.toLowerCase();
    if (playerIds.has(canonicalId)) throw httpError(400, 'El jugador ya está en el once.');
    slotIds.add(slotId);
    playerIds.add(canonicalId);
    return { slotId, playerId: canonicalId };
  });
  return { name: name.trim(), formation, slots: assignments, budgetEuros };
}

const playerIds = (slots) => slots.map(({ playerId }) => String(playerId));
async function resolvePlayers(slots) {
  const players = await Player.find({ _id: { $in: playerIds(slots) } }).select(playerFields).lean();
  return new Map(players.map((player) => [String(player._id), player]));
}

function checkPlayers(slots, players, previous = []) {
  const existing = new Set(playerIds(previous));
  if (playerIds(slots).some((id) => !players.has(id) && !existing.has(id))) {
    throw httpError(400, 'Algún jugador ya no está en el catálogo.');
  }
}

function serialize(lineup, players) {
  const { _id, name, formation, budgetEuros, revision, createdAt, updatedAt, slots } = lineup;
  return {
    _id, name, formation, budgetEuros, revision, createdAt, updatedAt,
    slots: slots.map(({ slotId, playerId }) => ({
      slotId, playerId, player: players.get(String(playerId)) ?? null,
    })),
  };
}

router.param('lineupId', asyncHandler(async (req, res, next, id) => {
  if (!isId(id)) throw httpError(400, 'Identificador de alineación no válido.');
  req.lineupScope = { _id: id, owner: req.user.id };
  req.lineup = await Lineup.findOne(req.lineupScope).lean();
  if (!req.lineup) throw httpError(404, 'Alineación no encontrada.');
  next();
}));

function revisionFilter(req) {
  const revision = req.body?.revision;
  if (!positiveInteger(revision)) throw httpError(400, 'Revisión no válida.');
  if (revision !== req.lineup.revision) throw httpError(409, 'La alineación cambió desde que la abriste.');
  return { ...req.lineupScope, revision };
}

router.route('/')
  .get(asyncHandler(async (req, res) => {
    const data = await Lineup.find({ owner: req.user.id })
      .select('name formation revision updatedAt').sort({ updatedAt: -1, _id: -1 }).lean();
    res.json({ data });
  }))
  .post(asyncHandler(async (req, res) => {
    const lineup = validate(req.body);
    const players = await resolvePlayers(lineup.slots);
    checkPlayers(lineup.slots, players);
    const created = await Lineup.create({ ...lineup, owner: req.user.id });
    res.status(201).json(serialize(created, players));
  }));

router.get('/formations', (req, res) => res.json({ data: catalog }));

router.route('/:lineupId')
  .get(asyncHandler(async (req, res) => {
    res.json(serialize(req.lineup, await resolvePlayers(req.lineup.slots)));
  }))
  .patch(asyncHandler(async (req, res) => {
    const filter = revisionFilter(req);
    const lineup = validate(req.body);
    const players = await resolvePlayers(lineup.slots);
    checkPlayers(lineup.slots, players, req.lineup.slots);
    const updated = await Lineup.findOneAndUpdate(filter, {
      $set: lineup,
      $inc: { revision: 1 },
    }, { new: true, runValidators: true }).lean();
    if (!updated) throw httpError(409, 'La alineación cambió desde que la abriste.');
    res.json(serialize(updated, players));
  }))
  .delete(asyncHandler(async (req, res) => {
    const result = await Lineup.deleteOne(revisionFilter(req));
    if (!result.deletedCount) throw httpError(409, 'La alineación cambió desde que la abriste.');
    res.status(204).end();
  }));

module.exports = router;
