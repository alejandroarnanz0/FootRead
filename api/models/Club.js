const mongoose = require('mongoose');

const clubSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  competition: { type: mongoose.Schema.Types.ObjectId, ref: 'Competition', required: true },
  country: { type: String, trim: true },
  externalIds: {
    transfermarkt: { type: String, trim: true },
    fbref: { type: String, trim: true },
  },
});

clubSchema.index({ competition: 1 });

// Natural keys for ETL upserts. Partial so clubs missing one source's id
// don't collide on null.
clubSchema.index(
  { 'externalIds.transfermarkt': 1 },
  { unique: true, partialFilterExpression: { 'externalIds.transfermarkt': { $type: 'string' } } }
);
clubSchema.index(
  { 'externalIds.fbref': 1 },
  { unique: true, partialFilterExpression: { 'externalIds.fbref': { $type: 'string' } } }
);

module.exports = mongoose.model('Club', clubSchema);
