// The heuristic's population: active players with a market value and league
// minutes in the reference season (CLAUDE.md 11.1). Shared by the scoring
// script (run.js) and the API (GET /api/players/:id/comparables).
const Competition = require('../../models/Competition');
const Club = require('../../models/Club');
const Player = require('../../models/Player');
const SeasonStat = require('../../models/SeasonStat');

const SEASON = '2025-26';
const MIN_LAST_SEASON = 2025;
const REFERENCE_DATE = new Date(Date.UTC(2026, 0, 1)); // middle of 2025-26
const YEAR_MS = 365.25 * 24 * 3600 * 1000;

async function loadPopulation() {
  const competitions = await Competition.find({}, { code: 1 }).lean();
  const codeById = new Map(competitions.map((c) => [String(c._id), c.code]));
  const clubs = await Club.find({}, { competition: 1 }).lean();
  const leagueByClub = new Map(clubs.map((c) => [String(c._id), codeById.get(String(c.competition))]));

  // Season totals across competitions (a mid-season transfer has two rows).
  const stats = await SeasonStat.aggregate([
    { $match: { season: SEASON } },
    {
      $group: {
        _id: '$player',
        minutes: { $sum: '$minutes' },
        goals: { $sum: '$goals' },
        assists: { $sum: '$assists' },
      },
    },
  ]);
  const statsByPlayer = new Map(stats.map((s) => [String(s._id), s]));

  const players = await Player.find(
    { lastSeason: { $gte: MIN_LAST_SEASON }, currentValue: { $gt: 0 }, birthDate: { $type: 'date' } },
    { name: 1, position: 1, subPosition: 1, birthDate: 1, club: 1, currentValue: 1 }
  ).lean();

  const population = [];
  for (const p of players) {
    const s = statsByPlayer.get(String(p._id));
    const league = leagueByClub.get(String(p.club));
    if (!s || s.minutes <= 0 || !league) continue;
    population.push({
      id: String(p._id),
      name: p.name,
      position: p.position,
      subPosition: p.subPosition,
      age: Math.floor((REFERENCE_DATE - p.birthDate) / YEAR_MS),
      minutes: s.minutes,
      goals: s.goals,
      assists: s.assists,
      league,
      club: String(p.club),
      value: p.currentValue,
    });
  }
  return population;
}

module.exports = { loadPopulation, SEASON, MIN_LAST_SEASON, REFERENCE_DATE };
