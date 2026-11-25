export const games = {
  value: { title: '¿Quién vale más?', description: 'Compara dos valoraciones de mercado de la misma fecha.', icon: 'M3 19h18M6 15l4-5 4 2 5-7m-5 0h5v5' },
  age: { title: '¿Quién es más joven?', description: 'Elige al futbolista que nació más tarde.', icon: 'M4 6h16v15H4zM8 3v6m8-6v6M4 11h16m-12 5h3' },
  goals: { title: '¿Quién marcó más goles?', description: 'Compara goleadores en la misma liga y temporada.', icon: 'M3 19V5h18v14H3zm4 0v-7h10v7m-7-7v-2h4v2' },
  guess: { title: 'Adivina el futbolista', description: 'Identifica al jugador entre cuatro opciones con pistas progresivas.', icon: 'M5 5h14v11h-6l-4 4v-4H5zM10 9a2 2 0 1 1 3 2l-1 1m0 2v1' },
};

export const difficulties = { easy: 'Fácil', medium: 'Medio', hard: 'Difícil' };
export const points = { easy: 100, medium: 150, hard: 200 };
export const dateText = (value) => new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', dateStyle: 'medium' })
  .format(new Date(value));
