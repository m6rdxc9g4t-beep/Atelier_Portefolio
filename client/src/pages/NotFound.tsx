import { Link } from 'react-router-dom';
import { useTitle } from '../components/SiteChrome';

export default function NotFound() {
  useTitle('Page introuvable — François Pichon');
  return (
    <main className="notfound">
      <div className="wrap">
        <span className="eyebrow">Erreur 404</span>
        <h1>
          Observation <em>hors échantillon</em>.
        </h1>
        <p className="sec-lede">Cette page n’existe pas (ou plus). Les projets, eux, sont bien là.</p>
        <div className="moi-actions">
          <Link to="/" className="btn btn-primary">
            Retour à l’accueil
          </Link>
          <Link to="/projets" className="btn btn-ghost">
            Voir les projets
          </Link>
        </div>
      </div>
    </main>
  );
}
