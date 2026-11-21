import PageHeader from '../components/PageHeader.jsx';
import { Notice } from '../components/Status.jsx';

export default function OverviewPage() {
  return (
    <div className="page">
      <PageHeader title="Visión general" />
      <Notice>En construcción. Aquí se mostrarán los jugadores analizados y los diez con mayor diferencia positiva.</Notice>
    </div>
  );
}
