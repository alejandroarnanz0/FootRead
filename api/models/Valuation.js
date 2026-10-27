const mongoose = require('mongoose');

const valuationSchema = new mongoose.Schema({
  player: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
  date: { type: Date, required: true },
  value: { type: Number, required: true, min: 0 }, // euros
});

valuationSchema.index({ player: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Valuation', valuationSchema);
