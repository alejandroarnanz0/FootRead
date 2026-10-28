import { createContext, useCallback, useContext, useMemo, useReducer } from 'react';

// The one filter state of the app. Every view reads it from here; no component
// keeps its own copy.
export const EMPTY_FILTERS = {
  position: [], // ['FW', 'MF']
  minAge: null,
  maxAge: null,
  competition: '', // competition code, e.g. 'ES1'
  maxValue: null, // euros
};

// Returns a message when the filters cannot be sent as they are, or null.
export function validateFilters(filters) {
  if (filters.minAge !== null && filters.maxAge !== null && filters.minAge > filters.maxAge) {
    return 'La edad mínima no puede ser mayor que la máxima.';
  }
  return null;
}

const FiltersContext = createContext(null);

function reducer(state, action) {
  switch (action.type) {
    case 'set':
      return { ...state, [action.field]: action.value };
    case 'togglePosition': {
      const has = state.position.includes(action.value);
      return {
        ...state,
        position: has ? state.position.filter((p) => p !== action.value) : [...state.position, action.value],
      };
    }
    case 'reset':
      return EMPTY_FILTERS;
    default:
      throw new Error(`Unknown filters action: ${action.type}`);
  }
}

export function FiltersProvider({ children }) {
  const [filters, dispatch] = useReducer(reducer, EMPTY_FILTERS);

  const setFilter = useCallback((field, value) => dispatch({ type: 'set', field, value }), []);
  const togglePosition = useCallback((value) => dispatch({ type: 'togglePosition', value }), []);
  const resetFilters = useCallback(() => dispatch({ type: 'reset' }), []);

  const value = useMemo(
    () => ({ filters, setFilter, togglePosition, resetFilters }),
    [filters, setFilter, togglePosition, resetFilters]
  );
  return <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>;
}

export function useFilters() {
  const context = useContext(FiltersContext);
  if (!context) throw new Error('useFilters must be used inside <FiltersProvider>');
  return context;
}
