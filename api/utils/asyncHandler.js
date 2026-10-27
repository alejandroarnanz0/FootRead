// Wraps an async route handler so rejected promises reach the central error
// handler in app.js. Replaces a try/catch in every route.
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;
