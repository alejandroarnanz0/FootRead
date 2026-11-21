const mongoose = require('mongoose');

// One event of a replayed match, received through the API (CLAUDE.md 14.3).
const matchEventSchema = new mongoose.Schema({
  matchId: { type: String, required: true, trim: true },
  // StatsBomb's own `index`, as is: the JSON already comes ordered by it.
  sequence: { type: Number, required: true, min: 0 },
  period: { type: Number, required: true, min: 1, max: 5 }, // 5 = penalty shoot-out
  minute: { type: Number, required: true, min: 0 },
  second: { type: Number, min: 0 },
  type: { type: String, required: true, trim: true }, // Shot, Foul Committed, Substitution...
  team: { type: String, required: true, trim: true },
  playerName: { type: String, trim: true },
  x: { type: Number },
  y: { type: Number },
  // Shots only.
  shotOutcome: { type: String, trim: true },
  shotType: { type: String, trim: true },
  isGoal: { type: Boolean, default: false },
  xg: { type: Number, min: 0, max: 1, default: null }, // our model; null if the ML service did not answer
  xgStatsbomb: { type: Number, min: 0, max: 1 },
  // Cards (Bad Behaviour or Foul Committed) and substitutions.
  card: { type: String, trim: true }, // "Yellow Card", "Second Yellow", "Red Card"
  replacement: { type: String, trim: true }, // player coming on (playerName is the one going off)
  raw: { type: mongoose.Schema.Types.Mixed }, // the original StatsBomb event
  receivedAt: { type: Date, default: Date.now },
});

// Idempotent ingestion: sending the same event twice never duplicates it.
matchEventSchema.index({ matchId: 1, sequence: 1 }, { unique: true });

module.exports = mongoose.model('MatchEvent', matchEventSchema);
