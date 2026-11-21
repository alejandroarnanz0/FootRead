import PageHeader from '../components/PageHeader.jsx';
import { Notice } from '../components/Status.jsx';

export default function ComparePage() {
  return (
    <div className="page">
      <PageHeader title="Comparador" />
      <Notice>En construcción. Podrás comparar las métricas de dos o tres jugadores.</Notice>
    </div>
  );
}
