import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="page">
      <header className="page-head">
        <h1>Página no encontrada</h1>
      </header>
      <Link to="/">Volver al Explorador</Link>
    </div>
  );
}
