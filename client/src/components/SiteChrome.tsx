import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useThemePref, type ThemePref } from '../lib/theme';
import { AppTile, Icon, type IconName } from './Icon';

/** Sections de l'accueil suivies par le menu, dans l'ordre de la page. */
const HOME_SECTIONS = ['moi', 'projets', 'ia-dev', 'parcours', 'passions', 'contact'] as const;
type HomeSection = (typeof HOME_SECTIONS)[number];

/** Section de l'accueil actuellement à l'écran (celle qui passe sous le premier tiers de la fenêtre). */
function useHomeSection(enabled: boolean): HomeSection {
  const [current, setCurrent] = useState<HomeSection>('moi');
  useEffect(() => {
    if (!enabled) return;
    const onScroll = () => {
      const line = window.innerHeight * 0.33;
      let found: HomeSection = 'moi';
      for (const id of HOME_SECTIONS) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) found = id;
      }
      // En bas de page, la dernière section (contact) est active même si elle est courte.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) found = 'contact';
      setCurrent(found);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    const t = setInterval(onScroll, 800); // le contenu se charge après coup (API) : on recale
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      clearInterval(t);
    };
  }, [enabled]);
  return current;
}

const THEMES: { id: ThemePref; label: string; icon: IconName }[] = [
  { id: 'system', label: 'Thème du système', icon: 'monitor' },
  { id: 'light', label: 'Thème clair', icon: 'sun' },
  { id: 'dark', label: 'Thème sombre', icon: 'moon' },
];

/** Choix du thème (Système / Clair / Sombre), commun à la Suite Atelier. */
export function ThemeSwitch({ className = '' }: { className?: string }) {
  const [pref, setPref] = useThemePref();
  return (
    <div className={`theme-switch ${className}`.trim()} role="group" aria-label="Thème">
      {THEMES.map((t) => (
        <button key={t.id} type="button" aria-pressed={pref === t.id} aria-label={t.label} title={t.label} onClick={() => setPref(t.id)}>
          <Icon name={t.icon} size={14} />
        </button>
      ))}
    </div>
  );
}

/** Barre de navigation du portfolio : Moi, Projets (data), IA & dev, Parcours, Contact, CV. */
export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  const onHome = pathname === '/';
  const section = useHomeSection(onHome);
  // Sur l'accueil, l'entrée active suit la section affichée ; ailleurs, elle suit la page.
  const active = {
    moi: onHome && (section === 'moi' || section === 'passions'),
    projets: pathname.startsWith('/projets') || (onHome && section === 'projets'),
    iaDev: pathname === '/ia-dev' || (onHome && section === 'ia-dev'),
    demos: pathname.startsWith('/demos'),
    parcours: onHome && section === 'parcours',
    contact: onHome && section === 'contact',
  };
  const cur = (on: boolean) => (on ? 'page' : undefined);

  return (
    <nav className={`site-nav ${scrolled ? 'scrolled' : ''} ${open ? 'open' : ''}`} aria-label="Navigation principale">
      <div className="wrap site-nav-in">
        <Link to="/" className="logo atelier-brand">
          <AppTile app="portfolio" />
          <span className="logo-name">
            François Pichon<small>Data analyst · IA &amp; dev</small>
          </span>
        </Link>
        <div className="site-links" id="site-links">
          <Link to="/" aria-current={cur(active.moi)}>
            Moi
          </Link>
          <Link to="/projets" aria-current={cur(active.projets)}>
            Projets
          </Link>
          <Link to="/ia-dev" aria-current={cur(active.iaDev)}>
            IA &amp; dev
          </Link>
          <Link to="/demos" aria-current={cur(active.demos)}>
            Démos
          </Link>
          <Link to="/#parcours" aria-current={active.parcours ? 'location' : undefined}>
            Parcours
          </Link>
          <Link to="/#contact" aria-current={active.contact ? 'location' : undefined}>
            Contact
          </Link>
          <ThemeSwitch className="nav-theme" />
          <NavLink to="/cv" className="btn btn-primary nav-cta">
            <Icon name="file-text" size={15} /> Mon CV
          </NavLink>
        </div>
        <button className="burger" aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'} aria-expanded={open} aria-controls="site-links" onClick={() => setOpen((o) => !o)}>
          <Icon name={open ? 'x' : 'menu'} size={18} />
        </button>
      </div>
    </nav>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap site-footer-in">
        <div className="sf-left">François Pichon · Portfolio · M2 Économétrie appliquée</div>
        <div className="sf-links">
          <Link to="/">Moi</Link>
          <Link to="/projets">Projets</Link>
          <Link to="/ia-dev">IA &amp; dev</Link>
          <Link to="/demos">Démos</Link>
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
