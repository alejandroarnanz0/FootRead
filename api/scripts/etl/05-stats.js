// Builds SeasonStat by adding up appearances.csv per (player, season, league).
// Only domestic league games of the loaded leagues count: no cups, no UEFA.
// The season comes from games.csv. Shots, passes and tackles are not in
// Transfermarkt and stay empty until FBref is loaded.
const Competition = require('../../models/Competition');
const Player = require('../../models/Player');
const SeasonStat = require('../../models/SeasonStat');
const { readCsv, Loader, idMap, runStandalone } = require('./lib/common');
const n = require('./lib/normalize');

async function loadStats({ leagues, dataDir }) {
  const competitions = await Competition.find({ code: { $in: leagues } }).lean();
  const competitionIds = new Map(competitions.map((c) => [c.code, c._id]));
  const players = await idMap(Player);
  if (!players.size) throw new Error('No players loaded: run 03-players first');

  // game_id -> { season, competition code }, league games of the loaded leagues only.
  const games = new Map();
  for await (const row of readCsv(dataDir, 'games.csv')) {
    const code = n.blank(row.competition_id);
    if (row.competition_type !== 'domestic_league' || !competitionIds.has(code)) continue;
    const season = n.season(row.season);
    if (season) games.set(n.blank(row.game_id), { season, code });
  }
  console.log(`games: ${games.size} league games of ${leagues.join(', ')}`);

  const loader = new Loader('stats', SeasonStat);
  const totals = new Map();
  let appearances = 0;
  for await (const row of readCsv(dataDir, 'appearances.csv')) {
    appearances++;
    const game = games.get(n.blank(row.game_id));
    if (!game) continue; // other competitions: not a discard, just out of scope
    const player = players.get(n.blank(row.player_id));
    if (!player) {
      loader.discard('appearance of a player not loaded');
      continue;
    }
    const key = `${player}|${game.season}|${game.code}`;
    let t = totals.get(key);
    if (!t) {
      t = { player, season: game.season, code: game.code, minutes: 0, goals: 0, assists: 0 };
      totals.set(key, t);
    }
    t.minutes += n.toInt(row.minutes_played) || 0;
    t.goals += n.toInt(row.goals) || 0;
    t.assists += n.toInt(row.assists) || 0;
  }
  console.log(`appearances: ${appearances} read, aggregated into ${totals.size} player seasons`);

  for (const t of totals.values()) {
    loader.read++;
    const competition = competitionIds.get(t.code);
    await loader.upsert(
      { player: t.player, season: t.season, competition },
      {
        player: t.player,
        season: t.season,
        competition,
        minutes: t.minutes,
        goals: t.goals,
        assists: t.assists,
      }
    );
  }
  await loader.flush();
  loader.report();
}

module.exports = loadStats;
if (require.main === module) runStandalone(loadStats);
