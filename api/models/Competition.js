const mongoose = require('mongoose');

const competitionSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, trim: true }, // "ES1"
  name: { type: String, required: true, trim: true },
  country: { type: String, trim: true },
  tier: { type: Number, min: 1 }, // 1 = top division
});

module.exports = mongoose.model('Competition', competitionSchema);
