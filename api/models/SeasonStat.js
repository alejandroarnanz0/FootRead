const mongoose = require('mongoose');

const seasonStatSchema = new mongoose.Schema({
  player: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
  season: { type: String, required: true, trim: true, match: /^\d{4}-\d{2}$/ }, // "2023-24"
  competition: { type: mongoose.Schema.Types.ObjectId, ref: 'Competition' },
  minutes: { type: Number, min: 0 },
  goals: { type: Number, min: 0 },
  assists: { type: Number, min: 0 },
  shots: { type: Number, min: 0 },
  passesCompleted: { type: Number, min: 0 },
  tackles: { type: Number, min: 0 },
});

seasonStatSchema.index({ player: 1, season: 1, competition: 1 }, { unique: true });

module.exports = mongoose.model('SeasonStat', seasonStatSchema);
