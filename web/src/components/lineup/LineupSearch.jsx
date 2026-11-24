import { useCallback, useMemo, useState } from 'react';
import { useDraggable } from '@dnd-kit/react';
import { refreshPlayerSearch, searchPlayers } from '../../api/players.js';
import { formatEuros, POSITION_LABELS } from '../../format.js';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import { usePagedRanking } from '../../hooks/usePagedRanking.js';
import { selectedPlayerFilter } from '../../lineup/lineupReducer.js';
import { FIT_LABELS, POSITION_NAMES, roleFit, suggestedPositions } from '../../lineup/formations.js';
import Button from '../Button.jsx';
import { ErrorMessage, Loading, Notice } from '../Status.jsx';
import PlayerAvatar from '../visual/PlayerAvatar.jsx';
import { ClubCrest } from '../visual/TeamBadge.jsx';
import { DragHandle } from './LineupPitch.jsx';

const numericFilters = [['minAge', 'Edad mínima'], ['maxAge', 'Edad máxima'],
  ['minValue', 'Valor mínimo (€)'], ['maxValue', 'Valor máximo (€)']];

function Result({ player, onPick, directory, target }) {
  const { ref, handleRef, isDragging } = useDraggable({ id: `search:${player._id}`, data: { player } });
  const club = directory?.clubs.get(player.club);
  const competition = directory?.competitions.get(club?.competition);
  const position = POSITION_NAMES[player.subPosition] ?? POSITION_LABELS[player.position] ?? 'Posición no disponible';
  return <li ref={ref} className="xi-result" data-dragging={isDragging || undefined}>
    <button type="button" className="xi-result-main" onClick={() => onPick(player)}>
      <PlayerAvatar player={player} decorative />
      <span className="xi-result-copy">
        <strong>{player.name}</strong>
        <small>{club && <ClubCrest club={club} decorative />}{club?.name ?? 'Club no disponible'}{competition && ` · ${competition.name}`}</small>
        <small>{position}</small>
        {target && <small className="xi-result-fit">{FIT_LABELS[roleFit(player, target.role)]}</small>}
      </span>
      <span className="xi-result-value">{formatEuros(player.currentValue)}</span>
    </button>
    <DragHandle handleRef={handleRef} name={player.name} />
  </li>;
}

function Results({ query, criteria, directory, excludeIds, target, onPick }) {
  const filters = useMemo(() => ({ ...criteria, excludeIds: excludeIds || undefined }), [criteria, excludeIds]);
  const loadPage = useCallback(async (page, signal) => {
    const data = await searchPlayers(query, page, signal, filters);
    return { players: data.data, hasMore: page < data.totalPages };
  }, [query, filters]);
  const refreshPages = useCallback((pages, signal) =>
    refreshPlayerSearch(query, pages, signal, filters), [query, filters]);
  const { players, pending, hasMore, error, loadMore, retry } =
    usePagedRanking(loadPage, { revision: excludeIds, refreshPages });
  const blocked = new Set(excludeIds.split(','));
  // Hide placements immediately while the API recalculates the current pages.
  const visible = players.filter(({ _id }) => !blocked.has(_id));
  return <>
    <ul className="xi-results" aria-label="Resultados de jugadores" onScroll={({ currentTarget }) => {
      if (currentTarget.scrollHeight - currentTarget.scrollTop - currentTarget.clientHeight < 75) loadMore();
    }}>
      {visible.map((player) => <Result key={player._id} player={player}
        onPick={onPick} directory={directory} target={target} />)}
    </ul>
    {error ? <ErrorMessage error={error} onRetry={retry} /> : pending ? <Loading>Buscando jugadores…</Loading>
      : !visible.length ? <Notice>No hay jugadores disponibles que coincidan.</Notice>
      : hasMore ? <Button onClick={loadMore}>Cargar más jugadores</Button> : null}
  </>;
}

export default function LineupSearch({ directory, directoryError, assignments, activeSlot, open, onClose, searchRef, onPick }) {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState({});
  const [scope, setScope] = useState('natural');
  const update = (key, value) => setFilters((prev) => ({ ...prev, [key]: value, ...(key === 'competition' ? { clubId: '' } : {}) }));
  const matchPositions = scope === 'all' || !activeSlot ? [] : suggestedPositions(activeSlot.role, scope === 'related');
  const subPosition = filters.subPosition || matchPositions.join(',');
  const criteria = { ...filters, subPosition };
  const key = JSON.stringify([query.trim(), criteria]);
  const debounced = useDebouncedValue(key);
  const [term, debouncedCriteria] = useMemo(() => {
    const [name, values] = JSON.parse(debounced);
    return [name, Object.fromEntries(Object.entries(values).filter(([, value]) => value !== ''))];
  }, [debounced]);
  const competition = [...(directory?.competitions.values() ?? [])].find((item) => item.code === filters.competition);
  const incompatible = filters.subPosition && matchPositions.length && !matchPositions.includes(filters.subPosition);
  const invalid = numericFilters.some(([name]) => filters[name] && (!/^\d+$/.test(filters[name]) || !Number.isSafeInteger(Number(filters[name]))))
    || (filters.minAge && filters.maxAge && Number(filters.minAge) > Number(filters.maxAge))
    || (filters.minValue && filters.maxValue && Number(filters.minValue) > Number(filters.maxValue));
  return <section className={`card xi-search${open ? ' xi-search-open' : ''}`} aria-labelledby="xi-search-title">
    <div className="xi-section-head">
      <div><h2 id="xi-search-title">Buscar jugadores</h2>
        {activeSlot && <p>Destino · {activeSlot.name}</p>}</div>
      <Button className="button button-quiet xi-mobile-only" onClick={onClose}>Cerrar</Button>
    </div>
    <label className="field"><span>Nombre del jugador</span>
      <input ref={searchRef} type="search" value={query} maxLength={80} placeholder="Ej. Lamine Yamal"
        onChange={(event) => setQuery(event.target.value)} />
    </label>
    {activeSlot && <label className="field"><span>Compatibilidad</span><select aria-label="Compatibilidad" value={scope} onChange={(e) => setScope(e.target.value)}>
      <option value="natural">Sugerencias por posición</option><option value="related">Incluir roles afines</option>
      <option value="all">Todos los roles</option>
    </select></label>}
    <details className="xi-filters"><summary>Filtros del catálogo</summary>
      <div className="xi-filter-grid">
        <label className="field"><span>Competición</span><select value={filters.competition ?? ''} onChange={(e) => update('competition', e.target.value)}>
          <option value="">Todas</option>{[...(directory?.competitions.values() ?? [])].map((item) =>
            <option key={item._id} value={item.code}>{item.name}</option>)}</select></label>
        <label className="field"><span>Club</span><select value={filters.clubId ?? ''} onChange={(e) => update('clubId', e.target.value)}>
          <option value="">Todos</option>{[...(directory?.clubs.values() ?? [])].filter((item) => !competition || item.competition === competition._id)
            .map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label>
        <label className="field"><span>Posición general</span><select value={filters.position ?? ''} onChange={(e) => update('position', e.target.value)}>
          <option value="">Todas</option>{Object.entries(POSITION_LABELS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label className="field"><span>Subposición</span><select value={filters.subPosition ?? ''} onChange={(e) => update('subPosition', e.target.value)}>
          <option value="">Todas</option>{Object.entries(POSITION_NAMES).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        {numericFilters.map(([name, label]) => <label key={name} className="field"><span>{label}</span>
          <input type="text" inputMode="numeric" value={filters[name] ?? ''} onChange={(e) => update(name, e.target.value)} /></label>)}
      </div>
      <Button variant="quiet" onClick={() => setFilters({})}>Restablecer filtros</Button>
    </details>
    {directoryError && <Notice>No se pudieron cargar los clubes y competiciones.</Notice>}
    {invalid ? <Notice>Introduce intervalos de edad y valor válidos.</Notice>
      : incompatible ? <Notice>La subposición elegida no coincide con las sugerencias. Cambia el filtro táctico para buscar libremente.</Notice>
      : key !== debounced ? <Loading>Buscando jugadores…</Loading>
      : <Results key={debounced} query={term} criteria={debouncedCriteria}
        directory={directory} excludeIds={selectedPlayerFilter(assignments)} target={activeSlot} onPick={onPick} />}
  </section>;
}
