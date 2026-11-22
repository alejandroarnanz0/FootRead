import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { searchPlayers } from '../../api/players.js';
import { formatEuros, POSITION_LABELS } from '../../format.js';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import { usePagedRanking } from '../../hooks/usePagedRanking.js';
import { ErrorMessage, Loading, Notice } from '../Status.jsx';
import PlayerAvatar from '../visual/PlayerAvatar.jsx';

const optionSelector = '[data-player-option]:not(:disabled)';

function Results({ query, clubs, selected, excludedId, onSelect }) {
  const loadPage = useCallback(async (page, signal) => {
    const result = await searchPlayers(query, page, signal);
    return { players: result.data, hasMore: page < result.totalPages };
  }, [query]);
  const { players, pending, hasMore, error, loadMore, retry } = usePagedRanking(loadPage);

  function onKeyDown(event) {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key) || !event.target.matches(optionSelector)) return;
    const options = [...event.currentTarget.querySelectorAll(optionSelector)];
    const next = options[options.indexOf(event.target) + (event.key === 'ArrowDown' ? 1 : -1)];
    if (next) {
      event.preventDefault();
      next.focus();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      loadMore();
    }
  }

  function loadNearEnd({ currentTarget }) {
    if (currentTarget.scrollHeight - currentTarget.clientHeight - currentTarget.scrollTop < 60) loadMore();
  }

  return (
    <div className="compare-options" role="region" aria-label="Resultados de jugadores" tabIndex={0}
      onScroll={loadNearEnd} onWheel={(event) => { if (event.deltaY > 0 && !event.ctrlKey) loadNearEnd(event); }}
      onKeyDown={onKeyDown}>
      <ul>
        {players.map((player) => {
          const excluded = player._id === excludedId;
          return (
            <li key={player._id}>
              <button type="button" data-player-option disabled={excluded}
                aria-pressed={player._id === selected?._id} onClick={() => onSelect(player)}>
                <PlayerAvatar player={player} decorative />
                <span className="compare-option-name">
                  <strong>{player.name}</strong>
                  <small>{clubs?.get(player.club)?.name ?? 'Club no disponible'} · {POSITION_LABELS[player.position] ?? 'Posición no disponible'}</small>
                </span>
                <span>{excluded ? 'En la otra selección' : formatEuros(player.currentValue)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {error ? <ErrorMessage error={error} onRetry={retry} /> : pending ? (
        <Loading>{players.length ? 'Cargando más jugadores…' : 'Buscando jugadores…'}</Loading>
      ) : !players.length ? <Notice>No hay jugadores que coincidan.</Notice> : !hasMore ? (
        <p className="compare-options-end muted">Fin de los resultados</p>
      ) : null}
    </div>
  );
}

export default function PlayerPicker({ label, clubs, selected, excludedId, onSelect }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query.trim());
  const root = useRef(null);
  const trigger = useRef(null);
  const search = useRef(null);

  useEffect(() => {
    if (!open) return;
    search.current.focus();
    const dismiss = (event) => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);

  function close() {
    setOpen(false);
    trigger.current.focus();
  }

  function searchKeys(event) {
    if (event.nativeEvent.isComposing || !['Enter', 'ArrowDown'].includes(event.key)) return;
    const first = root.current.querySelector(optionSelector);
    if (!first) return;
    event.preventDefault();
    if (event.key === 'Enter') first.click();
    else first.focus();
  }

  return (
    <div className="compare-picker" ref={root} onBlur={(event) => {
      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }} onKeyDown={(event) => {
      if (open && event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    }}>
      <span className="compare-picker-label" id={id + '-label'}>{label}</span>
      <button type="button" ref={trigger} className="compare-trigger" aria-expanded={open}
        aria-haspopup="dialog" aria-controls={open ? id + '-options' : undefined}
        aria-labelledby={id + '-label ' + id + '-value'} onClick={() => {
          if (open) close();
          else {
            setQuery('');
            setOpen(true);
          }
        }}>
        <span id={id + '-value'}>{selected?.name ?? 'Seleccionar jugador'}</span><span aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div id={id + '-options'} className="compare-dropdown" role="dialog" aria-labelledby={id + '-label'}>
          <label className="compare-search">
            Buscar por nombre
            <input ref={search} type="search" value={query} maxLength={80} onKeyDown={searchKeys}
              onChange={(event) => setQuery(event.target.value)} placeholder="Nombre del jugador" />
          </label>
          {query.trim() !== debounced ? <Loading>Buscando jugadores…</Loading> : (
            <Results key={debounced} query={debounced} clubs={clubs} selected={selected} excludedId={excludedId}
              onSelect={(player) => { onSelect(player); close(); }} />
          )}
        </div>
      )}
    </div>
  );
}
