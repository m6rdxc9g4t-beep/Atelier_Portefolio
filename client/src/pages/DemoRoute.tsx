import { Suspense } from 'react';
import { useParams } from 'react-router-dom';
import { demoBySlug } from '../demos/registry';
import { useTitle } from '../components/SiteChrome';
import NotFound from './NotFound';

/** Page d'une démo : charge son module à la demande (chaque démo est un morceau de code séparé). */
export default function DemoRoute() {
  const { slug } = useParams();
  const demo = demoBySlug(slug);
  useTitle(demo ? `${demo.title} — Démo — François Pichon` : 'Page introuvable — François Pichon');
  if (!demo) return <NotFound />;
  const Page = demo.Page;
  return (
    <Suspense fallback={<div className="page-loading"><span>Chargement de la démo…</span></div>}>
      <Page />
    </Suspense>
  );
}
