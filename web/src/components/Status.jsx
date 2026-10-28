// Explicit loading and error states. Every view uses them: nothing fails silently.

export function Loading({ children = 'Cargando…' }) {
  return (
    <div className="status status-loading" role="status">
      <span className="spinner" aria-hidden="true" />
      {children}
    </div>
  );
}

export function ErrorMessage({ error, onRetry, title = 'No se han podido cargar los datos' }) {
  return (
    <div className="status status-error" role="alert">
      <strong>{title}</strong>
      <span>{error.message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry}>
          Reintentar
        </button>
      )}
    </div>
  );
}
