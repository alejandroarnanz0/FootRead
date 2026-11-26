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
      <section className="card identity-credits" aria-labelledby="credits-transfermarkt">
        <h2 id="credits-transfermarkt">Resto de retratos y escudos</h2>
        <p>
          Los retratos de los jugadores y los escudos de clubes y selecciones que no aparecen arriba proceden de{' '}
          <a href="https://www.transfermarkt.es">Transfermarkt</a>, a través del dataset público de
          {' '}<a href="https://www.kaggle.com/datasets/davidcariboo/player-scores">dcaribou en Kaggle</a>
          {' '}(los escudos, a partir del identificador de Transfermarkt de cada equipo). Se muestran desde los servidores de Transfermarkt y los derechos son de sus titulares.
        </p>
      </section>
      <section className="card identity-credits" aria-labelledby="credits-wikipedia">
        <h2 id="credits-wikipedia">Descripciones de jugadores</h2>
        <p>
          Son el primer párrafo del artículo de cada jugador en{' '}
          <a href="https://es.wikipedia.org">Wikipedia</a>, enlazado en su ficha, con licencia{' '}
          <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.es">CC BY-SA 4.0</a>. El cruce con cada
          jugador se hace por su identificador de Transfermarkt en <a href="https://www.wikidata.org">Wikidata</a>.
        </p>
      </section>
    </>
  );
}
