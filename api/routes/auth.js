const express = require('express');
const bcrypt = require('bcryptjs');

const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const httpError = require('../utils/httpError');
const { signToken, requireAuth } = require('../middleware/auth');

const router = express.Router();

const BCRYPT_ROUNDS = 10;
const MIN_PASSWORD = 8;

const publicUser = (u) => ({ _id: u._id, email: u.email, name: u.name });

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { email, password, name } = req.body || {};
    if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
      throw httpError(400, `Password must be at least ${MIN_PASSWORD} characters`);
    }
    if (typeof email !== 'string') throw httpError(400, 'Email is required');
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    // Duplicate email -> 11000 -> 409 in the central handler.
    const user = await User.create({ email, name, passwordHash });
    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  })
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      throw httpError(400, 'Email and password are required');
    }
    const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+passwordHash');
    // Same answer for unknown email and wrong password: do not reveal which.
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw httpError(401, 'Invalid email or password');
    }
    res.json({ token: signToken(user), user: publicUser(user) });
  })
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id).lean();
    if (!user) throw httpError(401, 'User no longer exists');
    res.json(publicUser(user));
  })
);

module.exports = router;
