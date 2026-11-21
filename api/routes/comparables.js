// GET /api/players/:playerId/comparables
// The players the value heuristic (CLAUDE.md 11.1) used to compute this
// player's reference value. Read only: recomputes the groups in memory from
// the database, never writes. Cached for a few minutes (the population only
// changes when `npm run value` runs again).
const express = require('express');

const Club = require('../models/Club');
const asyncHandler = require('../utils/asyncHandler');
const { comparablesOf } = require('../scripts/value/comparables');
const { loadPopulation, SEASON } = require('../scripts/value/population');

const router = express.Router({ mergeParams: true });

const CACHE_MS = 10 * 60 * 1000;
const MAX_LISTED = 20;
let cache = { at: 0, population: null };

async function population() {
  if (!cache.population || Date.now() - cache.at > CACHE_MS) {
    cache = { at: Date.now(), population: await loadPopulation() };
  }
  return cache.population;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const id = String(req.player._id);
    const result = comparablesOf(await population(), id);
    if (!result.found) {
      return res.json({
        playerId: id,
        inPopulation: false,
        reason: `Only active players with a market value and league minutes in ${SEASON} get a reference value`,
        comparables: [],
      });
    }
    // The closest in value first (how far each one is from the player's own value).
    const own = req.player.currentValue || 0;
    const listed = [...result.members]
      .sort((a, b) => Math.abs(a.value - own) - Math.abs(b.value - own))
      .slice(0, MAX_LISTED);
    const clubs = await Club.find({ _id: { $in: listed.map((m) => m.club) } }, { name: 1 }).lean();
    const clubName = new Map(clubs.map((c) => [String(c._id), c.name]));

    res.json({
      playerId: id,
      inPopulation: true,
      season: SEASON,
      referenceValue: result.predicted,
      level: result.level, // 0 = strictest group, 3 = loosest
      criteria: result.criteria,
      groupKey: result.key,
      groupSize: result.groupSize,
      comparables: listed.map((m) => ({
        _id: m.id,
        name: m.name,
        club: { _id: m.club, name: clubName.get(m.club) || null },
        league: m.league,
        position: m.position,
        subPosition: m.subPosition,
        age: m.age,
        minutes: m.minutes,
        goals: m.goals,
        assists: m.assists,
        currentValue: m.value,
      })),
    });
  })
);

module.exports = router;
