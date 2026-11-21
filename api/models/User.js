const mongoose = require('mongoose');

// Only the bcrypt hash is stored, never the password. select: false keeps the
// hash out of every query unless explicitly asked for (login).
const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    name: { type: String, trim: true, maxlength: 80 },
    passwordHash: { type: String, required: true, select: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
