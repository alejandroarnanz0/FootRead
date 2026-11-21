const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const logger = require('morgan');
const mongoose = require('mongoose');

const httpError = require('./utils/httpError');
const { requireAuth } = require('./middleware/auth');

const app = express();

// Atlas connection
if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is not set');
  process.exit(1);
}
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET is not set (at least 32 characters)');
  process.exit(1);
}

// Middlewares
if (process.env.NODE_ENV !== 'test') app.use(logger('dev'));
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

// Routes
// `db` lets scripts check which database this API writes to (they must refuse
// to write unless it ends in _test).
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', db: mongoose.connection.name || null });
});
app.use('/api/auth', require('./routes/auth'));
// Everything below needs a JWT, reads included (401 otherwise). Only
// /api/health and /api/auth stay public.
app.use('/api', requireAuth);
app.use('/api/competitions', require('./routes/competitions'));
app.use('/api/clubs', require('./routes/clubs'));
app.use('/api/players', require('./routes/players'));
app.use('/api/aggregates', require('./routes/aggregates'));
app.use('/api/predictions', require('./routes/predictions'));
app.use('/api/matches', require('./routes/matches'));

// Unknown route -> 404
app.use((req, res, next) => {
  next(httpError(404, 'Not found'));
});

// Central error handler. Mongoose errors caused by the client are 4xx, not 500.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  let status = err.status || 500;
  let message = err.message;

  if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    message = Object.values(err.errors).map((e) => e.message).join('; ');
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    message = `Invalid ${err.path}: ${err.value}`;
  } else if (err.code === 11000) {
    status = 409;
    message = 'Duplicate key';
  }

  if (status >= 500) {
    console.error(err);
    if (process.env.NODE_ENV === 'production') message = 'Internal server error';
  }

  res.status(status).json({ error: message });
});

module.exports = app;
