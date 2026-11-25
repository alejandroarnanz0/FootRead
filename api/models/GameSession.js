const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
  revision: { type: Number, required: true },
  state: { type: mongoose.Schema.Types.Mixed, required: true },
  finishedAt: Date,
  cancelledAt: Date,
  expiresAt: Date,
}, { timestamps: true, versionKey: false });

schema.index({ owner: 1, finishedAt: -1 });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('GameSession', schema);
