const teams = new Map([['France', 'Francia']]);
const competitions = new Map([
  ['FIFA World Cup', 'Copa Mundial de la FIFA'],
  ['Champions League', 'Liga de Campeones'],
  ['UEFA Champions League', 'Liga de Campeones'],
  ['La Liga', 'LaLiga'],
]);

export const teamLabel = (name) => teams.get(name) ?? name;
export const competitionLabel = (name) => competitions.get(name) ?? name;
