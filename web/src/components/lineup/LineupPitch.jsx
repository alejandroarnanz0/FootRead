import { useDraggable, useDroppable } from '@dnd-kit/react';
import PlayerAvatar from '../visual/PlayerAvatar.jsx';
import { ClubCrest } from '../visual/TeamBadge.jsx';
import { formatEuros } from '../../format.js';
import { FIT_LABELS, roleFit } from '../../lineup/formations.js';

export function DragHandle({ handleRef, name }) {
  return <button type="button" className="xi-grip" ref={handleRef} aria-label={`Arrastrar a ${name}`} title="Arrastrar">
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M5 4h.01M11 4h.01M5 8h.01M11 8h.01M5 12h.01M11 12h.01" />
    </svg>
  </button>;
}

function PlacedPlayer({ player, club, slot, onSelect, current }) {
  const { ref, handleRef, isDragging } = useDraggable({
    id: `field:${slot.id}`, data: { player }, disabled: player.unavailable,
  });
  const fit = roleFit(player, slot.role);
  return <div ref={ref} className="xi-token" data-dragging={isDragging || undefined}>
    <button type="button" className="xi-token-main" onClick={onSelect} aria-pressed={current}
      aria-label={`${slot.name}: ${player.name}. ${FIT_LABELS[fit]}`} title={player.name}>
      <span className="xi-token-portrait"><PlayerAvatar player={player} decorative />
        {club && <ClubCrest club={club} decorative />}</span>
      <strong>{player.name}</strong>
      <small>{slot.label} · {formatEuros(player.currentValue)}</small>
    </button>
    {!player.unavailable && <DragHandle handleRef={handleRef} name={player.name} />}
  </div>;
}

function PitchSlot({ slot, player, club, active, moving, onSelect }) {
  const { ref, isDropTarget } = useDroppable({ id: slot.id });
  return <li ref={ref} data-slot={slot.id} data-target={isDropTarget || undefined}
    className="xi-slot" style={{ '--x': `${slot.x}%`, '--y': `${slot.y}%`,
      '--slot-width': slot.lineSize === 5 ? '17.5%' : '20%' }}>
    {player ? <PlacedPlayer player={player} club={club} slot={slot} current={active} onSelect={onSelect} />
      : <button type="button" className="xi-empty-slot" aria-pressed={active} onClick={onSelect}
        aria-label={`${moving ? 'Mover a' : 'Elegir'} ${slot.name}, libre`}>
        <span aria-hidden="true">+</span>{slot.label}
      </button>}
  </li>;
}

export default function LineupPitch({ slots, assignments, clubs, active, dragging, moving, onSlot }) {
  return <div className="xi-pitch" data-dragging={dragging || undefined}
    style={{ '--xi-row-count': slots.at(-1).line + 1 }}>
    <svg className="xi-markings" viewBox="0 0 68 100" preserveAspectRatio="none" aria-hidden="true">
      <path d="M3 3H65V97H3ZM3 50H65M17 3V17H51V3M17 97V83H51V97M25 3V8H43V3M25 97V92H43V97" />
      <path d="M27 17Q34 24 41 17M27 83Q34 76 41 83M29 3V1H39V3M29 97V99H39V97" />
      <circle cx="34" cy="50" r=".4" />
      <circle cx="34" cy="12" r=".4" /><circle cx="34" cy="88" r=".4" />
    </svg>
    <span className="xi-center-circle" aria-hidden="true" />
    <ol aria-label="Posiciones del campo">
      {slots.map((slot) => {
        const player = assignments[slot.id];
        return <PitchSlot key={slot.id} slot={slot} player={player} club={clubs?.get(player?.club)}
          active={active === slot.id} moving={moving} onSelect={() => onSlot(slot)} />;
      })}
    </ol>
  </div>;
}
