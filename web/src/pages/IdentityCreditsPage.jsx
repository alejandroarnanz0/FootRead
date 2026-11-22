import PageHeader from '../components/PageHeader.jsx';
import MediaCredit from '../components/visual/MediaCredit.jsx';
import IdentityImage from '../components/visual/IdentityImage.jsx';
import { identityAssets } from '../media/identityCatalog.js';

const labels = { player: 'Retratos de jugadores', club: 'Escudos de clubes', national: 'Escudos de selecciones' };

export default function IdentityCreditsPage() {
  return (
    <>
      <PageHeader title="Créditos de imágenes" description="Autoría, procedencia y condiciones de reutilización del catálogo visual de Footboard." />
      {Object.entries(labels).map(([type, label]) => (
        <section className="card identity-credits" key={type} aria-labelledby={`credits-${type}`}>
          <h2 id={`credits-${type}`}>{label}</h2>
          <ul>
            {identityAssets.filter((asset) => asset.type === type).map((asset) => (
              <li key={asset.id} className="identity-inline">
                <IdentityImage asset={asset} name={asset.name} decorative
                  className={type === 'player' ? 'identity-avatar' : 'identity-crest'} />
                <div><strong>{asset.name}</strong><MediaCredit asset={asset} /></div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
