// Turns the global filter state into the API's query-string filters,
// leaving out the empty ones.
export function toQuery(filters) {
  const query = {};
  if (filters.position.length) query.position = filters.position.join(',');
  if (filters.minAge !== null) query.minAge = filters.minAge;
  if (filters.maxAge !== null) query.maxAge = filters.maxAge;
  if (filters.competition) query.competition = filters.competition;
  if (filters.maxValue !== null) query.maxValue = filters.maxValue;
  return query;
}
