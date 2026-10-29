import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';

/** Barre de navigation du portfolio (accueil, projets, CV, contact). */
export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => setOpen(false), [pathname]);

  return (
    <nav className={`site-nav ${scrolled ? 'scrolled' : ''} ${open ? 'open' : ''}`} aria-label="Navigation principale">
      <div className="wrap site-nav-in">
        <Link to="/" className="logo">
          <span className="logo-mark">F</span>
          <span className="logo-name">
            François Pichon<small>Économètre · data analyst</small>
          </span>
        </Link>
        <div className="site-links" id="site-links">
          <NavLink to="/" end>
            Moi
          </NavLink>
          <NavLink to="/projets">Projets</NavLink>
          <Link to="/#parcours">Parcours</Link>
          <Link to="/#contact">Contact</Link>
          <NavLink to="/cv" className="nav-cta">
            📄 Mon CV
          </NavLink>
        </div>
        <button className="burger" aria-label="Menu" aria-expanded={open} aria-controls="site-links" onClick={() => setOpen((o) => !o)}>
          {open ? '✕' : '☰'}
        </button>
      </div>
    </nav>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap site-footer-in">
        <div className="sf-left">
          <span className="status-dot" /> François Pichon · Portfolio · M2 Économétrie appliquée
        </div>
        <div className="sf-links">
          <Link to="/">Moi</Link>
          <Link to="/projets">Projets</Link>
          <Link to="/cv">CV</Link>
          <a href="https://www.linkedin.com/in/fran%C3%A7ois-pichon-697329204/" target="_blank" rel="noopener noreferrer">
            LinkedIn
          </a>
          <a href="mailto:francois_pichon@outlook.fr">Email</a>
        </div>
      </div>
    </footer>
  );
}

/** Remonte en haut de page à chaque changement de route (et gère les ancres #section). */
export function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const t = setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }), 60);
      return () => clearTimeout(t);
    }
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname, hash]);
  return null;
}

export function useTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}
