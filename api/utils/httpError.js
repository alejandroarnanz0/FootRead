// Builds an Error carrying an HTTP status so the central handler can answer
// uniformly: throw httpError(404, 'Player not found').
const httpError = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

module.exports = httpError;
