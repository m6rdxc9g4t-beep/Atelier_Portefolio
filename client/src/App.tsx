import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ScrollManager, SiteFooter, SiteNav } from './components/SiteChrome';
import Home from './pages/Home';
import NotFound from './pages/NotFound';

const Projects = lazy(() => import('./pages/Projects'));
const CV = lazy(() => import('./pages/CV'));
const ProjectRoute = lazy(() => import('./pages/ProjectRoute'));

function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="site">
      <SiteNav />
      {children}
      <SiteFooter />
    </div>
  );
}

const loading = <div className="page-loading"><span>Chargement…</span></div>;

export default function App() {
  return (
    <BrowserRouter>
      <ScrollManager />
      <Suspense fallback={loading}>
        <Routes>
          <Route path="/" element={<SiteLayout><Home /></SiteLayout>} />
          <Route path="/projets" element={<SiteLayout><Projects /></SiteLayout>} />
          <Route path="/cv" element={<SiteLayout><CV /></SiteLayout>} />
          {/* Les pages projets ont leur propre habillage (pas de barre du portfolio). */}
          <Route path="/projets/:slug" element={<ProjectRoute />} />
          <Route path="*" element={<SiteLayout><NotFound /></SiteLayout>} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
