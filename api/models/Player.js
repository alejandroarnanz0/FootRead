const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  birthDate: { type: Date },
  position: { type: String, enum: ['GK', 'DF', 'MF', 'FW'], required: true },
  subPosition: { type: String, trim: true }, // one of Transfermarkt's 13 detailed positions
  foot: { type: String, enum: ['left', 'right', 'both'] },
  heightCm: { type: Number, min: 140, max: 220 },
  club: { type: mongoose.Schema.Types.ObjectId, ref: 'Club' },
  currentValue: { type: Number, min: 0 }, // euros, denormalized for fast listing
  predictedValue: { type: Number, min: 0 }, // euros, written by the offline scoring job
  contractUntil: { type: Date },
  lastSeason: { type: Number, min: 1900 }, // last season played (start year); retired players are kept for training
  externalIds: {
    transfermarkt: { type: String, trim: true },
    fbref: { type: String, trim: true },
  },
});

// Common filter fields
playerSchema.index({ position: 1 });
playerSchema.index({ currentValue: 1 });
playerSchema.index({ club: 1 });
playerSchema.index({ birthDate: 1 });
playerSchema.index({ lastSeason: 1 });

// Natural keys for ETL upserts. Partial so players missing one source's id
// don't collide on null.
playerSchema.index(
  { 'externalIds.transfermarkt': 1 },
  { unique: true, partialFilterExpression: { 'externalIds.transfermarkt': { $type: 'string' } } }
);
playerSchema.index(
  { 'externalIds.fbref': 1 },
  { unique: true, partialFilterExpression: { 'externalIds.fbref': { $type: 'string' } } }
);

module.exports = mongoose.model('Player', playerSchema);
