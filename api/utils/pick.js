// Returns a new object with only the listed fields that are present in obj.
// POST and PUT use it so unknown body fields are ignored.
const pick = (obj, fields) => {
  const result = {};
  if (obj === null || typeof obj !== 'object') return result;
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(obj, field)) {
      result[field] = obj[field];
    }
  }
  return result;
};

module.exports = pick;
