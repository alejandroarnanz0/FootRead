// Wraps an async route handler so rejected promises reach the central error
// handler in app.js. Replaces a try/catch in every route.
// Extra arguments are forwarded so it also works for router.param callbacks.
const asyncHandler = (fn) => (req, res, next, ...rest) =>
  Promise.resolve(fn(req, res, next, ...rest)).catch(next);

module.exports = asyncHandler;
