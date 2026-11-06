import { Link } from 'react-router-dom';
import { useApi, type Profile, type ProjectsResponse } from '../api';
import { CountUp } from '../components/CountUp';
import { Md } from '../components/Md';
import { useTitle } from '../components/SiteChrome';
import { ProjectCard } from './ProjectCard';
import { ContactForm } from './ContactForm';
import { splitProjects } from '../lib/groups';
import { Icon, type IconName } from '../components/Icon';
import { SuiteSchema } from '../components/SuiteSchema';

/** Glyphe à trait de chaque passion (à la place des emoji du profil). */
const PASSION_ICONS: Record<string, IconName> = { Photographie: 'camera', Voyages: 'plane', 'Sports mécaniques': 'flag' };

export default function Home() {
  useTitle('François Pichon — Économètre · Portfolio');
  const { data: profile } = useApi<Profile>('/profile');
  const { data: list } = useApi<ProjectsResponse>('/projects');

  const projects = list?.projects ?? [];
  const featured = projects.filter((p) => p.featured);
  const { data: dataProjects, build } = splitProjects(projects);
  const atelier = build;
  const interactiveCount = dataProjects.length;
  const reportCount = projects.reduce((n, p) => n + (p.reports?.length ?? 0), 0);

  return (
    <main className="home">
      {/* ══════════ MOI ══════════ */}
      <header className="moi" id="moi">
        <div className="wrap">
          <div className="moi-inner">
            <div className="photo-frame">
              <img src="/photo.jpg" alt="Portrait de François Pichon" width={782} height={1004} />
            </div>

            <div className="moi-text">
              <span className="badge">
                <span className="dot" aria-hidden /> {profile?.status ?? 'En recherche d’un CDI en analyse de données'}
              </span>
              <h1>
                François<em>Pichon.</em>
              </h1>
              <div className="moi-role">{profile?.headline} · {profile?.school}</div>
              {profile && <Md as="p" className="moi-desc" text={profile.intro} />}
              {profile && <p className="moi-motto">« {profile.motto} »</p>}

              <div className="moi-actions">
                <Link to="/cv" className="btn btn-primary btn-lg">
                  <Icon name="file-text" /> Mon CV
                </Link>
                <Link to="/projets" className="btn btn-lg">
                  <Icon name="folder-open" /> Mes projets
                </Link>
                <a href={profile?.contact.linkedin} target="_blank" rel="noopener noreferrer" className="btn btn-lg">
                  <Icon name="linkedin" /> LinkedIn
                </a>
                <a href={`mailto:${profile?.contact.email ?? 'francois_pichon@outlook.fr'}`} className="btn btn-lg">
                  <Icon name="mail" /> Email
                </a>
              </div>

              <div className="chips-wrap">
                <div className="chips-label">Compétences clés</div>
                <div className="chips">
                  {profile?.skills
                    .flatMap((g) => g.items.map((it) => ({ it, hot: g.highlight?.includes(it) })))
                    .slice(0, 39)
                    .map(({ it, hot }) => (
                      <span key={it} className={`chip ${hot ? 'hot' : ''}`}>
                        {it}
                      </span>
                    ))}
                  {profile?.languages.map((l) => (
                    <span key={l.name} className="chip">
                      {l.name} : {l.level}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="stat-band">
            <div className="stat">
              <div className="v">
                <CountUp value={String(interactiveCount || 15)} />
              </div>
              <div className="k">Projets d’analyse, chacun avec sa page interactive</div>
            </div>
            <div className="stat">
              <div className="v">
                <CountUp value={String(atelier.length || 8)} />
              </div>
              <div className="k">Applications IA &amp; dev, reliées par un hub d’agents</div>
            </div>
            <div className="stat">
              <div className="v">
                <CountUp value={String(reportCount || 17)} />
              </div>
              <div className="k">Rapports & présentations à télécharger</div>
            </div>
            <div className="stat">
              <div className="v">
                <CountUp value={String(profile?.skills.find((g) => g.group === 'Modélisation')?.items.length ?? 9)} />
              </div>
              <div className="k">Familles de modèles : logit, Tobit, survie, GARCH, spatial…</div>
            </div>
          </div>
        </div>
      </header>

      {/* ══════════ PROJETS À LA UNE ══════════ */}
      <section id="projets" className="sec">
        <div className="wrap">
          <div className="proj-head">
            <div>
              <h2 className="sec-title">
                Le coin <em>analyse</em>.
              </h2>
              <p className="sec-lede">
                Chaque projet a sa page, habillée à l’image de son sujet — une plateforme de streaming pour Netflix, une enseigne de restauration pour les avis Flunch, un journal financier pour la volatilité du S&amp;P 500 — avec <b>un module à manipuler</b> : simulateur de décision, courbe de survie, estimateur de prix…
              </p>
            </div>
            <Link to="/projets" className="btn">
              Voir les {interactiveCount || 15} projets data <Icon name="arrow-right" />
            </Link>
          </div>
          <div className="proj-grid">
            {featured.map((p) => (
              <ProjectCard key={p.slug} project={p} />
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ IA & DÉVELOPPEMENT ══════════ */}
      <section id="ia-dev" className="sec">
        <div className="wrap">
          <div className="proj-head">
            <div>
              <h2 className="sec-title">
                Le coin <em>atelier</em>.
              </h2>
              <p className="sec-lede">
                Au-delà de l’analyse, je construis les outils : la <b>Suite Atelier</b>, sept applications que j’ai conçues et développées — BI locale, tableur, conversion de relevés, gestion de projet, finances, CRM freelance — reliées par <b>Atelier Nexus</b>, un hub d’agents IA qui lisent, analysent et agissent avec une <b>validation humaine</b> de chaque action. Et <b>Agent Ops Lab</b>, un logiciel de transport simulé où un agent IA anticipe les retards.
              </p>
            </div>
            <Link to="/ia-dev" className="btn">
              Page IA &amp; dev <Icon name="arrow-right" />
            </Link>
          </div>
          <SuiteSchema />
          <div className="proj-grid">
            {atelier.map((p) => (
              <ProjectCard key={p.slug} project={p} />
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ PARCOURS ══════════ */}
      <section id="parcours" className="sec">
        <div className="wrap">
          <h2 className="sec-title">
            De la finance à l’<em>économétrie</em>.
          </h2>
          {profile && (
            <p className="sec-lede">
              {profile.about}
            </p>
          )}
          <div className="timeline-cols">
            <div className="tl-col">
              <h3>Expériences</h3>
              <ol className="tl">
                {profile?.experiences.map((e) => (
                  <li key={e.title} className={e.featured ? 'feat' : ''}>
                    <span className="tl-when">{e.when}</span>
                    <strong>
                      {e.title} {e.tag && <span className="feat-tag">{e.tag}</span>}
                    </strong>
                    <span className="tl-org">{e.org}</span>
                    {e.featured && (
                      <Link to="/projets/stage-ecm" className="tl-link">
                        Voir l’outil de reporting <Icon name="arrow-right" size={14} />
                      </Link>
                    )}
                  </li>
                ))}
              </ol>
            </div>
            <div className="tl-col">
              <h3>Formation</h3>
              <ol className="tl">
                {profile?.education.map((e) => (
                  <li key={e.title}>
                    <span className="tl-when">{e.when}</span>
                    <strong>{e.title}</strong>
                    <span className="tl-org">{e.org}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ PASSIONS ══════════ */}
      <section id="passions" className="sec">
        <div className="wrap">
          <h2 className="sec-title">
            Au-delà des <em>données</em>.
          </h2>
          <p className="sec-lede">
            Ce qui m’anime en dehors de l’économétrie — et qui nourrit la même curiosité et la même rigueur.
          </p>
          <div className="passions">
            {profile?.passions.map((p) => (
              <div key={p.title} className="passion">
                <span className="pa-ic" aria-hidden>
                  <Icon name={PASSION_ICONS[p.title] ?? 'sparkles'} size={18} />
                </span>
                <div className="pa-num">
                  <CountUp value={p.figure} />
                  <small>{p.unit}</small>
                </div>
                <h3>{p.title}</h3>
                <p>{p.text}</p>
                <div className="pa-meta">
                  {p.tags.map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ CONTACT ══════════ */}
      <section id="contact" className="sec">
        <div className="wrap contact-grid">
          <div>
            <h2 className="sec-title">
              Parlons <em>données</em>.
            </h2>
            <p className="sec-lede">
              Un poste en analyse de données, un projet de scoring ou de prévision, un tableau de bord, un agent IA ou une application à construire ? Écrivez-moi : le message arrive directement sur le serveur du portfolio.
            </p>
            <div className="contact-direct">
              <a href={`mailto:${profile?.contact.email}`}>
                <Icon name="mail" /> {profile?.contact.email}
              </a>
              <a href={profile?.contact.phoneHref}>
                <Icon name="phone" /> {profile?.contact.phone}
              </a>
              <a href={profile?.contact.linkedin} target="_blank" rel="noopener noreferrer">
                <Icon name="linkedin" /> LinkedIn
              </a>
            </div>
          </div>
          <ContactForm />
        </div>
      </section>
    </main>
  );
}
