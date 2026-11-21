const mongoose = require('mongoose');

// A StatsBomb Open Data match (path B, CLAUDE.md 6). Needed by GET /api/matches
// and by the scoreboard: the events JSON does not say who plays at home.
const matchSchema = new mongoose.Schema({
  matchId: { type: String, required: true, unique: true, trim: true }, // StatsBomb match_id
  competition: { type: String, trim: true },
  season: { type: String, trim: true },
  matchDate: { type: Date },
  homeTeam: { type: String, required: true, trim: true },
  awayTeam: { type: String, required: true, trim: true },
  // true when its events JSON is in data/: it can be replayed.
  available: { type: Boolean, default: false },
});

matchSchema.index({ available: 1, matchDate: -1 });

module.exports = mongoose.model('Match', matchSchema);
