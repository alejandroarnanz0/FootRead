import { useEffect, useId, useRef } from 'react';
import Button from '../Button.jsx';

export default function LineupDialog({ title, children, onCancel, actions }) {
  const dialog = useRef(null);
  const label = useId();
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  return <dialog className="xi-dialog card" ref={dialog} aria-labelledby={label} onCancel={(event) => {
    event.preventDefault();
    onCancel();
  }}>
    <h2 id={label}>{title}</h2>
    {children}
    <div className="xi-dialog-actions">
      <Button onClick={onCancel}>Cancelar</Button>
      {actions}
    </div>
  </dialog>;
}
