import { Suspense, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useApi, type ProjectResponse } from '../api';
import { PROJECT_PAGES } from '../projects/registry';
import GenericProject from '../projects/GenericProject';
import NotFound from './NotFound';

export default function ProjectRoute() {
  const { slug = '' } = useParams();
  const { data, error, loading } = useApi<ProjectResponse>(`/projects/${slug}`);

  useEffect(() => {
    if (data) document.title = `${data.title} — François Pichon`;
  }, [data]);

  // Les pages à habillage propre gardent leur rendu d'origine (barres de défilement sombres) quel que soit
  // le thème du site ; les pages de la Suite Atelier suivent le thème commun.
  const themed = Boolean(data && !data.atelierApp);
  useEffect(() => {
    if (!themed) return;
    document.documentElement.dataset.surface = 'habillage';
    return () => {
      delete document.documentElement.dataset.surface;
    };
  }, [themed]);

  if (loading || (!data && !error)) return <div className="page-loading"><span>Chargement du projet…</span></div>;
  if (error || !data) return <NotFound />;

  const Page = PROJECT_PAGES[data.slug];
  return (
    <Suspense fallback={<div className="page-loading"><span>Préparation de la page…</span></div>}>
      {Page ? <Page project={data} /> : <GenericProject project={data} />}
    </Suspense>
  );
}
