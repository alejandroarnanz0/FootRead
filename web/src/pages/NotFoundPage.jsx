import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader.jsx';

export default function NotFoundPage() {
  return (
    <div className="page">
      <PageHeader title="Página no encontrada" />
      <Link to="/">Volver al Explorador</Link>
    </div>
  );
}
