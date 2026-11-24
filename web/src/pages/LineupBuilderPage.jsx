import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { DragDropProvider, DragOverlay } from '@dnd-kit/react';
import { Link } from 'react-router-dom';
import { getComparisonDirectory } from '../api/comparison.js';
import { deleteLineup, getLineup, listFormations, listLineups, saveLineup } from '../api/lineups.js';
import { ageFrom, formatEuros, POSITION_LABELS } from '../format.js';
import { useAuth } from '../hooks/useAuth.jsx';
import { useApi } from '../hooks/useApi.js';
import { FIT_LABELS, indexFormations, POSITION_NAMES, roleFit } from '../lineup/formations.js';
import { assignedSlot, lineupPayload, lineupReducer, loadLineup, newLineup, proposeFormation } from '../lineup/lineupReducer.js';
import Button from '../components/Button.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { ErrorMessage, Loading, Notice } from '../components/Status.jsx';
import PlayerAvatar from '../components/visual/PlayerAvatar.jsx';
import LineupBudget from '../components/lineup/LineupBudget.jsx';
import LineupDialog from '../components/lineup/LineupDialog.jsx';
import LineupPitch from '../components/lineup/LineupPitch.jsx';
import LineupSearch from '../components/lineup/LineupSearch.jsx';
import FormationPicker, { FormationMiniature } from '../components/lineup/FormationPicker.jsx';
import './LineupBuilderPage.css';

const discardWarning = 'Hay cambios sin guardar. ¿Quieres abandonar este borrador?';
const copyName = (name) => name ? `Copia de ${name}`.slice(0, 80) : 'Copia del once';
const emptySignature = JSON.stringify(lineupPayload(newLineup()));

function readDraft(key) {
  try {
    return JSON.parse(sessionStorage.getItem(key)) ?? {};
  } catch {
    return {};
  }
}

function SlotDetail({ slot, player, club, onMove, onReplace, onRemove }) {
  const age = ageFrom(player.birthDate);
  return <section className="xi-detail" aria-label="Detalle del jugador">
    <div>
      <strong>{player.name}</strong>
      <p>{slot.name} · {FIT_LABELS[roleFit(player, slot.role)]}</p>
      {!player.unavailable && <p>{POSITION_NAMES[player.subPosition] ?? POSITION_LABELS[player.position] ?? 'Posición no disponible'}
        {club && ` · ${club.name}`}{Number.isFinite(age) && ` · ${age} años`} · {formatEuros(player.currentValue)}</p>}
    </div>
    <div className="xi-detail-actions">
      <Button onClick={onMove}>Mover o intercambiar</Button>
      <Button onClick={onReplace}>Sustituir</Button>
      <Button variant="quiet" onClick={onRemove}>Quitar</Button>
      {!player.unavailable && <Link className="button button-quiet" to={`/players/${player._id}`}>Ver ficha</Link>}
    </div>
  </section>;
}

function FormationReview({ formation, proposal, onChange, onRelease, onCancel, onApply }) {
  const free = formation.slots.filter(({ id }) => !proposal.assignments[id]);
  const used = new Set(Object.values(proposal.choices).filter(Boolean));
  const unplaced = proposal.unresolved.filter(({ player }) => !proposal.choices[player._id]).length;
  return <LineupDialog title={`Cambiar a ${formation.name}`} onCancel={onCancel} actions={
    <Button variant="primary" onClick={onApply}>{unplaced ? `Aplicar y retirar ${unplaced}` : 'Aplicar formación'}</Button>
  }>
    <div className="xi-formation-preview"><FormationMiniature formation={formation} />
      <p>{formation.description} Se han propuesto {Object.keys(proposal.assignments).length} destinos.</p></div>
    {Object.keys(proposal.assignments).length > 0 && <details className="xi-filters">
      <summary>Revisar destinos propuestos</summary>
      <ul className="xi-review-list">{formation.slots.filter(({ id }) => proposal.assignments[id]).map((slot) => {
        const player = proposal.assignments[slot.id];
        return <li key={slot.id}>
          <div><strong>{player.name}</strong><small>{slot.name} · {FIT_LABELS[roleFit(player, slot.role)]}</small></div>
          <Button variant="quiet" aria-label={`Recolocar a ${player.name}`} onClick={() => onRelease(slot.id)}>Recolocar</Button>
        </li>;
      })}</ul>
    </details>}
    {proposal.unresolved.map(({ player }) => <label className="field" key={player._id}><span>{player.name}</span>
      <select aria-label={player.name} value={proposal.choices[player._id] ?? ''} onChange={(e) => onChange(player._id, e.target.value)}>
        <option value="">Retirar del once</option>
        {free.map(({ id, name, role }) => <option key={id} value={id} disabled={used.has(id) && proposal.choices[player._id] !== id}>
          {name} · {FIT_LABELS[roleFit(player, role)]}</option>)}
      </select>
    </label>)}
  </LineupDialog>;
}

export default function LineupBuilderPage() {
  const formations = useApi(listFormations, []);
  const catalog = useMemo(() => formations.data && indexFormations(formations.data), [formations.data]);
  if (formations.error) return <ErrorMessage error={formations.error} onRetry={formations.retry}
    title="No se pudieron cargar las formaciones" />;
  if (!catalog) return <Loading>Cargando formaciones…</Loading>;
  return <LineupEditor catalog={catalog} />;
}

function LineupEditor({ catalog }) {
  const { user } = useAuth();
  const draftKey = `footboard.xi.draft.${user._id}`;
  const [draft] = useState(() => readDraft(draftKey));
  const [lineup, dispatch] = useReducer((state, action) => lineupReducer(state, action, catalog), draft.lineup ?? newLineup());
  const [baseline, setBaseline] = useState(draft.baseline ?? emptySignature);
  const [budgetKey, resetBudget] = useReducer((key) => key + 1, 0);
  const [active, setActive] = useState(null);
  const [moving, setMoving] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [review, setReview] = useState(null);
  const [formationPicker, setFormationPicker] = useState(false);
  const [announcement, setAnnouncement] = useState(draft.lineup ? 'Borrador recuperado.' : '');
  const [failure, setFailure] = useState(null);
  const [busy, setBusy] = useState(false);
  const searchRef = useRef(null);
  const directory = useApi(getComparisonDirectory, []);
  const saved = useApi(listLineups, []);
  const selectedFormation = catalog[lineup.formation];
  const slots = selectedFormation.slots;
  const activeSlot = slots.find(({ id }) => id === active);
  const selected = lineup.assignments[active];
  const count = Object.keys(lineup.assignments).length;
  const payload = lineupPayload(lineup);
  const dirty = JSON.stringify(payload) !== baseline;

  useEffect(() => {
    try {
      if (dirty) sessionStorage.setItem(draftKey, JSON.stringify({ lineup, baseline }));
      else sessionStorage.removeItem(draftKey);
    } catch {
      // An unavailable browser store does not prevent editing or saving.
    }
  }, [draftKey, lineup, baseline, dirty]);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event) => { event.preventDefault(); event.returnValue = ''; };
    function confirmNavigation(event) {
      const link = event.target.closest('a[href]');
      if (link && !event.defaultPrevented && event.button === 0 && !event.ctrlKey && !event.metaKey
        && !event.shiftKey && !event.altKey && link.target !== '_blank'
        && new URL(link.href).pathname !== location.pathname && !window.confirm(discardWarning)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', confirmNavigation, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', confirmNavigation, true);
    };
  }, [dirty]);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen, active]);

  function resetInteraction() {
    setActive(null);
    setMoving(null);
    setSearchOpen(false);
  }

  function chooseSlot(slot) {
    if (busy) return;
    if (moving) {
      commitPlacement(lineup.assignments[moving], slot.id);
      setMoving(null);
      return;
    }
    setActive(slot.id);
    setSearchOpen(!lineup.assignments[slot.id]);
  }

  function commitPlacement(player, slotId, replace = false) {
    if (!player || !slotId || busy) return;
    const destination = slots.find((slot) => slot.id === slotId);
    if (!destination) return;
    const origin = assignedSlot(lineup.assignments, player._id);
    const occupant = lineup.assignments[slotId];
    if (origin === slotId) {
      setAnnouncement(`${player.name} ya está en este hueco.`);
      setDialog(null);
      return;
    }
    dispatch({ type: 'place', player, slotId, replace });
    setActive(slotId);
    setSearchOpen(false);
    setDialog(null);
    setAnnouncement(origin && occupant
      ? `${player.name} y ${occupant.name} intercambiaron sus posiciones.`
      : `${player.name} está en ${destination.name}.`);
    requestAnimationFrame(() => document.querySelector(`[data-slot="${slotId}"] .xi-token-main`)?.focus());
  }

  function offerPlacement(player, slotId) {
    if (busy) return;
    const origin = assignedSlot(lineup.assignments, player._id);
    if (slotId === origin && origin) {
      setDialog({ type: 'place', player, slotId: '' });
      return;
    }
    const occupant = lineup.assignments[slotId];
    if (!slotId || (!origin && occupant)) setDialog({ type: 'place', player, slotId: slotId ?? '' });
    else commitPlacement(player, slotId);
  }

  function pickPlayer(player) {
    const firstFree = slots.find(({ id }) => !lineup.assignments[id]);
    setDialog({ type: 'place', player, slotId: active ?? firstFree?.id ?? '' });
  }

  function changeFormation(formation) {
    if (formation === lineup.formation) return;
    const proposal = proposeFormation(lineup, formation, catalog);
    if (count) setReview({ ...proposal, choices: {} });
    else dispatch({ type: 'formation', proposal });
  }

  function releaseProposal(slotId) {
    setReview((current) => {
      const { [slotId]: player, ...assignments } = current.assignments;
      return { ...current, assignments, unresolved: [...current.unresolved, { player, slotId }] };
    });
  }

  function applyFormation() {
    const assignments = { ...review.assignments };
    for (const { player } of review.unresolved) {
      if (review.choices[player._id]) assignments[review.choices[player._id]] = player;
    }
    dispatch({ type: 'formation', proposal: { formation: review.formation, assignments } });
    resetInteraction();
    setReview(null);
    setAnnouncement(`Formación ${review.formation} aplicada. ${Object.keys(assignments).length} jugadores colocados.`);
  }

  async function run(action, title) {
    setBusy(true);
    setFailure(null);
    try {
      await action();
    } catch (error) {
      setFailure({ message: error.message, title, conflict: error.response?.status === 409 });
    } finally {
      setBusy(false);
    }
  }

  function replaceDraft(next, keepDirty = false) {
    dispatch({ type: 'load', lineup: next });
    setBaseline(keepDirty ? emptySignature : JSON.stringify(lineupPayload(next)));
    resetBudget();
    resetInteraction();
    setDialog(null);
  }

  function save(event) {
    event.preventDefault();
    if (!lineup.name.trim() || lineup.budgetEuros === undefined || busy) return;
    run(async () => {
      const data = await saveLineup(lineup.id, payload);
      replaceDraft(loadLineup(data));
      saved.retry();
      setAnnouncement('Alineación guardada.');
    }, 'No se pudo guardar la alineación');
  }

  function openSaved(item, asCopy) {
    if (dirty && !window.confirm(discardWarning)) return;
    run(async () => {
      const next = loadLineup(await getLineup(item._id));
      if (asCopy) {
        // Deleted catalog entries can stay in an existing XI, but cannot be copied into a new one.
        const assignments = Object.fromEntries(Object.entries(next.assignments).filter(([, player]) => !player.unavailable));
        if (Object.keys(assignments).length !== Object.keys(next.assignments).length) {
          setDialog({ type: 'copy', lineup: { ...next, assignments, id: null, revision: null, name: copyName(next.name) } });
          return;
        }
        replaceDraft({ ...next, id: null, revision: null, name: copyName(next.name) }, true);
        setAnnouncement('Copia preparada. Guárdala con un nombre propio.');
      } else {
        replaceDraft(next);
        setAnnouncement('Alineación abierta.');
      }
    }, 'No se pudo abrir la alineación');
  }

  function removeSaved(item) {
    setDialog(null);
    run(async () => {
      await deleteLineup(item._id, item.revision);
      if (lineup.id === item._id) {
        replaceDraft(dirty ? { ...lineup, id: null, revision: null } : newLineup(), dirty);
      }
      saved.retry();
      setAnnouncement('Alineación eliminada.');
    }, 'No se pudo eliminar la alineación');
  }

  const inDialogSlot = slots.find(({ id }) => id === dialog?.slotId);
  const inDialogPlayer = lineup.assignments[dialog?.slotId];
  const inDialogOrigin = dialog?.player && assignedSlot(lineup.assignments, dialog.player._id);
  const replacing = inDialogPlayer && !inDialogOrigin;
  const cancelDialog = () => setDialog(null);

  return <div className="xi-page">
    <PageHeader title="Footboard XI" description="Construye tu alineación con jugadores del catálogo y controla su valor de mercado." />
    <DragDropProvider onDragStart={() => setDragging(true)} onDragEnd={(event) => {
      setDragging(false);
      const { source, target } = event.operation;
      if (event.canceled || !source?.data?.player) return;
      const release = event.nativeEvent;
      // Use the release point for pointer drops. The overlay can still overlap a slot after the pointer leaves.
      const slotId = release instanceof PointerEvent
        ? document.elementsFromPoint(release.clientX, release.clientY)
          .map((node) => node.closest('.xi-pitch [data-slot]')).find(Boolean)?.dataset.slot
        : target?.id;
      if (slotId && source.id !== `field:${slotId}`) offerPlacement(source.data.player, slotId);
    }}>
      <fieldset className="xi-editor" disabled={busy}>
        <legend className="xi-sr">Editor de alineaciones</legend>
        <div className="xi-grid">
          <section className="card xi-board" aria-labelledby="xi-board-title">
            <div className="xi-section-head xi-board-head">
              <div><h2 id="xi-board-title">Alineación</h2>
                <p>{count}/11 jugadores · {count === 11 ? 'Once completo' : count ? 'Once incompleto' : 'Once vacío'}</p></div>
              <Button aria-haspopup="dialog" aria-expanded={formationPicker} onClick={() => setFormationPicker(true)}>
                Formación <strong>{selectedFormation.name}</strong>
              </Button>
            </div>
            {moving ? <div className="xi-field-note"><span>Elige un destino para {lineup.assignments[moving]?.name}.</span>
              <Button variant="quiet" onClick={() => setMoving(null)}>Cancelar movimiento</Button></div>
              : <p className="xi-field-note">Arrastra desde el buscador o elige un hueco del campo.</p>}
            <LineupPitch slots={slots} assignments={lineup.assignments} clubs={directory.data?.clubs}
              active={active} dragging={dragging} moving={Boolean(moving)} onSlot={chooseSlot} />
            <div className="xi-field-actions">
              <Button className="button button-secondary xi-mobile-only" onClick={() => setSearchOpen(true)}>Buscar jugadores</Button>
              <Button variant="quiet" disabled={!count || busy} onClick={() => setDialog({ type: 'clear' })}>Limpiar campo</Button>
            </div>
            {selected && <SlotDetail slot={activeSlot} player={selected} club={directory.data?.clubs.get(selected.club)}
              onMove={() => { setMoving(active); setSearchOpen(false); }}
              onReplace={() => { setSearchOpen(true); searchRef.current?.focus(); }}
              onRemove={() => {
                dispatch({ type: 'remove', slotId: active });
                setAnnouncement(`${selected.name} salió del once.`);
                resetInteraction();
                requestAnimationFrame(() => document.querySelector(`[data-slot="${active}"] button`)?.focus());
              }} />}
          </section>
          <div className="xi-side">
            <LineupBudget key={budgetKey} assignments={lineup.assignments} limit={lineup.budgetEuros}
              onLimit={(value) => dispatch({ type: 'budget', value })} />
            <LineupSearch directory={directory.data} directoryError={directory.error} assignments={lineup.assignments}
              activeSlot={activeSlot} open={searchOpen} onClose={() => setSearchOpen(false)} searchRef={searchRef} onPick={pickPlayer} />
          </div>
        </div>
        <section className="card xi-library" aria-labelledby="xi-library-title">
          <div className="xi-section-head"><div><h2 id="xi-library-title">Mis alineaciones</h2>
            <p>{dirty ? 'Cambios sin guardar' : lineup.id ? 'Alineación guardada' : 'Guarda tu once para continuar más tarde.'}</p></div>
            <Button onClick={() => {
              if (!dirty || window.confirm(discardWarning)) { setFailure(null); replaceDraft(newLineup()); }
            }}>Nueva alineación</Button>
          </div>
          <form onSubmit={save} className="xi-save">
            <label className="field"><span>Nombre de la alineación</span><input type="text" required maxLength={80} value={lineup.name}
              onChange={(e) => dispatch({ type: 'name', value: e.target.value })} placeholder="Mi once ideal" /></label>
            <Button type="submit" variant="primary" disabled={!lineup.name.trim() || lineup.budgetEuros === undefined || busy}>
              {lineup.id ? 'Guardar cambios' : 'Guardar alineación'}
            </Button>
          </form>
          {failure && <><ErrorMessage error={failure} title={failure.title} />
            {failure.conflict && <p>Abre la versión actual desde la lista o guarda tus cambios como una alineación nueva.</p>}
            {failure.conflict && lineup.id && <Button onClick={() => {
              if (Object.values(lineup.assignments).some((player) => player.unavailable)) {
                setFailure({ title: 'No se puede copiar el borrador', message: 'Quita o sustituye los jugadores que ya no están disponibles.' });
                return;
              }
              replaceDraft({ ...lineup, id: null, revision: null, name: copyName(lineup.name) }, true);
              setFailure(null);
            }}>Guardar como copia</Button>}
          </>}
          {saved.error ? <ErrorMessage error={saved.error} onRetry={saved.retry} />
            : saved.loading && !saved.data ? <Loading /> : saved.data?.length ? <ul className="xi-saved-list">
              {saved.data.map((item) => <li key={item._id}>
                <div><strong>{item.name}</strong><small>{item.formation} · {new Intl.DateTimeFormat('es-ES').format(new Date(item.updatedAt))}</small></div>
                <div className="xi-detail-actions">
                  <Button onClick={() => openSaved(item, false)}>Abrir</Button>
                  <Button onClick={() => openSaved(item, true)}>Duplicar</Button>
                  <Button variant="quiet" onClick={() => setDialog({ type: 'delete', item })}>Eliminar</Button>
                </div>
              </li>)}
            </ul> : <Notice>Aún no tienes alineaciones guardadas.</Notice>}
        </section>
      </fieldset>
      <DragOverlay dropAnimation={null}>{(source) => source?.data?.player && <div className="xi-overlay card">
        <PlayerAvatar player={source.data.player} decorative /><strong>{source.data.player.name}</strong>
      </div>}</DragOverlay>
    </DragDropProvider>
    <p className="xi-sr" aria-live="polite">{announcement}</p>
    {formationPicker && <FormationPicker formations={Object.values(catalog)} selected={lineup.formation}
      onClose={() => setFormationPicker(false)} onSelect={(formation) => {
        setFormationPicker(false);
        changeFormation(formation);
      }} />}
    {review && <FormationReview formation={catalog[review.formation]} proposal={review} onRelease={releaseProposal}
      onCancel={() => setReview(null)} onApply={applyFormation}
      onChange={(id, value) => setReview((old) => ({ ...old, choices: { ...old.choices, [id]: value } }))} />}
    {dialog?.type === 'place' && <LineupDialog title={replacing ? 'Confirmar sustitución' : 'Colocar jugador'} onCancel={cancelDialog} actions={
      <Button variant="primary" disabled={!inDialogSlot} onClick={() => commitPlacement(dialog.player, inDialogSlot.id, true)}>
        {replacing ? 'Confirmar sustitución' : 'Confirmar jugador'}
      </Button>
    }>
      <p><strong>{dialog.player.name}</strong>{replacing && ` sustituirá a ${inDialogPlayer.name}.`}
        {inDialogPlayer && inDialogOrigin && inDialogOrigin !== dialog.slotId && ` intercambiará el hueco con ${inDialogPlayer.name}.`}</p>
      <label className="field"><span>Hueco del campo</span><select aria-label="Hueco del campo" value={dialog.slotId} onChange={(e) => setDialog({ ...dialog, slotId: e.target.value })}>
        <option value="">Elige un hueco</option>{slots.map((slot) => <option key={slot.id} value={slot.id}>{slot.name}</option>)}
      </select></label>
      {inDialogSlot && <p>{FIT_LABELS[roleFit(dialog.player, inDialogSlot.role)]}</p>}
    </LineupDialog>}
    {dialog?.type === 'clear' && <LineupDialog title="Limpiar el campo" onCancel={cancelDialog} actions={
      <Button variant="primary" onClick={() => {
        dispatch({ type: 'clear' }); resetInteraction(); cancelDialog(); setAnnouncement('Campo vacío.');
      }}>Quitar todos</Button>
    }><p>Se quitarán los jugadores del borrador. La versión guardada seguirá disponible.</p></LineupDialog>}
    {dialog?.type === 'delete' && <LineupDialog title="Eliminar alineación" onCancel={cancelDialog} actions={
      <Button variant="primary" onClick={() => removeSaved(dialog.item)}>Eliminar definitivamente</Button>
    }><p>Se eliminará «{dialog.item.name}».</p></LineupDialog>}
    {dialog?.type === 'copy' && <LineupDialog title="Duplicar alineación" onCancel={cancelDialog} actions={
      <Button variant="primary" onClick={() => {
        replaceDraft(dialog.lineup, true); setAnnouncement('Copia preparada sin las fichas que ya no existen.');
      }}>Preparar copia</Button>
    }><p>Algunos jugadores ya no están disponibles. Sus huecos quedarán vacíos en la copia.</p></LineupDialog>}
  </div>;
}
