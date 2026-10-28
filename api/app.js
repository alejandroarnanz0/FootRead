const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const logger = require('morgan');
const mongoose = require('mongoose');

const httpError = require('./utils/httpError');

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

// Middlewares
if (process.env.NODE_ENV !== 'test') app.use(logger('dev'));
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});
app.use('/api/competitions', require('./routes/competitions'));
app.use('/api/clubs', require('./routes/clubs'));
app.use('/api/players', require('./routes/players'));
app.use('/api/aggregates', require('./routes/aggregates'));
app.use('/api/predictions', require('./routes/predictions'));

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
