const mongoose = require('mongoose');

const slotSchema = new mongoose.Schema({
  slotId: { type: String, required: true },
  playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
}, { _id: false });

const lineupSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  formation: { type: String, required: true },
  slots: { type: [slotSchema], default: [] },
  budgetEuros: { type: Number, default: null },
  revision: { type: Number, required: true, default: 1 },
}, { timestamps: true, versionKey: false });

lineupSchema.index({ owner: 1, updatedAt: -1, _id: -1 });

module.exports = mongoose.model('Lineup', lineupSchema);
