const mongoose = require('mongoose');

// One shot of the StatsBomb shots dataset (path A, CLAUDE.md 6). Serves the
// dashboard; the xG model trains from the frozen file, not from here.
const shotSchema = new mongoose.Schema({
  // Natural key built by the ETL: the dataset has no shot id (see shots.js).
  shotKey: { type: String, required: true, unique: true },
  matchId: { type: String, required: true },
  competition: { type: String, required: true, trim: true },
  season: { type: String, required: true, trim: true },
  matchDate: { type: Date },
  team: { type: String, trim: true },
  playerName: { type: String, trim: true },
  x: { type: Number, required: true, min: 0, max: 121 }, // 120 x 80 pitch
  y: { type: Number, required: true, min: 0, max: 80 },
  // Computed by ml/BaselineModel/features.py and exported in shots.csv. Never
  // recomputed in Node: one formula, the same one the model uses.
  distanceToGoal: { type: Number, required: true, min: 0 }, // yards to the goal centre
  angleToGoal: { type: Number, required: true, min: 0, max: 180 }, // degrees of goal visible
  underPressure: { type: Boolean, default: false },
  outcome: { type: String, trim: true },
  bodyPart: { type: String, trim: true },
  technique: { type: String, trim: true },
  shotType: { type: String, trim: true },
  playPattern: { type: String, trim: true },
  xgStatsbomb: { type: Number, min: 0, max: 1 },
  isGoal: { type: Boolean, required: true },
  split: { type: String, enum: ['train', 'validation', 'test'] }, // ours, grouped by match
});

shotSchema.index({ matchId: 1 });
shotSchema.index({ competition: 1, season: 1 });
shotSchema.index({ split: 1 });

module.exports = mongoose.model('Shot', shotSchema);
