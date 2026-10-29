import { Link } from 'react-router-dom';
import { useApi, type Profile, type ProjectsResponse } from '../api';
import { Reveal } from '../components/Reveal';
import { CountUp } from '../components/CountUp';
import { Md } from '../components/Md';
import { useTitle } from '../components/SiteChrome';
import { ProjectCard } from './ProjectCard';
import { ContactForm } from './ContactForm';

export default function Home() {
  useTitle('François Pichon — Économètre · Portfolio');
  const { data: profile } = useApi<Profile>('/profile');
  const { data: list } = useApi<ProjectsResponse>('/projects');

  const projects = list?.projects ?? [];
  const featured = projects.filter((p) => p.featured);
  const interactiveCount = projects.length;
  const reportCount = projects.reduce((n, p) => n + (p.reports?.length ?? 0), 0);

  return (
    <main className="home">
      {/* ══════════ MOI ══════════ */}
      <header className="moi" id="moi">
        <div className="moi-grid-bg" aria-hidden />
        <div className="wrap">
          <div className="moi-inner">
            <Reveal className="photo-frame">
              <img src="/photo.jpg" alt="Portrait de François Pichon" width={782} height={1004} />
              <span className="photo-tag">📷 François Pichon</span>
            </Reveal>

            <Reveal delay={80}>
              <span className="badge">
                <span className="pulse" /> {profile?.status ?? 'En recherche d’un CDI en analyse de données'}
              </span>
              <h1>
                François<em>Pichon.</em>
              </h1>
              <div className="moi-role">{profile?.headline} · {profile?.school}</div>
              {profile && <Md as="p" className="moi-desc" text={profile.intro} />}
              {profile && <p className="moi-motto">« {profile.motto} »</p>}

              <div className="moi-actions">
                <Link to="/cv" className="btn btn-primary">
                  📄 Mon CV
                </Link>
                <Link to="/projets" className="btn btn-ghost">
                  ◆ Mes projets
                </Link>
                <a href={profile?.contact.linkedin} target="_blank" rel="noopener noreferrer" className="btn btn-li">
                  in&nbsp; LinkedIn
                </a>
                <a href={`mailto:${profile?.contact.email ?? 'francois_pichon@outlook.fr'}`} className="btn btn-ghost">
                  ✉️ Email
                </a>
              </div>

              <div className="chips-wrap">
                <div className="chips-label">Compétences clés</div>
                <div className="chips">
                  {profile?.skills
                    .flatMap((g) => g.items.map((it) => ({ it, hot: g.highlight?.includes(it) })))
                    .slice(0, 22)
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
            </Reveal>
          </div>

          <Reveal className="stat-band" delay={120}>
            <div className="stat">
              <div className="v">
                <CountUp value={String(interactiveCount || 16)} />
              </div>
              <div className="k">Projets, chacun avec sa page interactive</div>
            </div>
            <div className="stat">
              <div className="v">
                <CountUp value={String(list?.categories.length ?? 8)} />
              </div>
              <div className="k">Domaines : santé, risque, finance, spatial…</div>
            </div>
            <div className="stat">
              <div className="v">
                <CountUp value={String(reportCount || 17)} />
              </div>
              <div className="k">Rapports & présentations à télécharger</div>
            </div>
            <div className="stat">
              <div className="v">
                <CountUp value="7" />
              </div>
              <div className="k">Simulateurs & démos branchés sur l’API</div>
            </div>
          </Reveal>
        </div>
      </header>

      {/* ══════════ PROJETS À LA UNE ══════════ */}
      <section id="projets" className="sec">
        <div className="wrap">
          <div className="proj-head">
            <div>
              <Reveal>
                <span className="eyebrow">Mes projets</span>
              </Reveal>
              <Reveal as="h2" className="sec-title">
                Le coin <em>analyse</em>.
              </Reveal>
              <Reveal as="p" className="sec-lede" delay={60}>
                Chaque projet a sa page, habillée à l’image de son sujet — une plateforme de streaming pour Netflix, une enseigne de restauration pour les avis Flunch, un terminal de marché pour la volatilité du S&amp;P 500 — avec <b>un module à manipuler</b> : simulateur de score, courbe de survie, estimateur de prix…
              </Reveal>
            </div>
            <Link to="/projets" className="btn btn-primary">
              Voir les {projects.length || 16} projets <span aria-hidden>→</span>
            </Link>
          </div>
          <div className="proj-grid">
            {featured.map((p, i) => (
              <ProjectCard key={p.slug} project={p} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ PARCOURS ══════════ */}
      <section id="parcours" className="sec">
        <div className="wrap">
          <Reveal>
            <span className="eyebrow">Parcours</span>
          </Reveal>
          <Reveal as="h2" className="sec-title">
            De la finance à l’<em>économétrie</em>.
          </Reveal>
          {profile && (
            <Reveal as="p" className="sec-lede" delay={60}>
              {profile.about}
            </Reveal>
          )}
          <div className="timeline-cols">
            <Reveal className="tl-col">
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
                        Voir l’outil de reporting →
                      </Link>
                    )}
                  </li>
                ))}
              </ol>
            </Reveal>
            <Reveal className="tl-col" delay={80}>
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
            </Reveal>
          </div>
        </div>
      </section>

      {/* ══════════ PASSIONS ══════════ */}
      <section id="passions" className="sec">
        <div className="wrap">
          <Reveal>
            <span className="eyebrow">Mes passions</span>
          </Reveal>
          <Reveal as="h2" className="sec-title">
            Au-delà des <em>données</em>.
          </Reveal>
          <Reveal as="p" className="sec-lede" delay={60}>
            Ce qui m’anime en dehors de l’économétrie — et qui nourrit la même curiosité et la même rigueur.
          </Reveal>
          <div className="passions">
            {profile?.passions.map((p, i) => (
              <Reveal key={p.title} className="passion" delay={i * 80} style={{ ['--accent' as string]: p.accent }}>
                <div className="pa-glyph" aria-hidden>
                  {p.icon}
                </div>
                <div className="pa-ic" aria-hidden>
                  {p.icon}
                </div>
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
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ CONTACT ══════════ */}
      <section id="contact" className="sec">
        <div className="wrap contact-grid">
          <div>
            <Reveal>
              <span className="eyebrow">Contact</span>
            </Reveal>
            <Reveal as="h2" className="sec-title">
              Parlons <em>données</em>.
            </Reveal>
            <Reveal as="p" className="sec-lede" delay={60}>
              Un poste en analyse de données, un projet de scoring ou de prévision, une question sur l’un de mes travaux ? Écrivez-moi : le message arrive directement sur le serveur du portfolio.
            </Reveal>
            <Reveal className="contact-direct" delay={100}>
              <a href={`mailto:${profile?.contact.email}`}>✉️ {profile?.contact.email}</a>
              <a href={profile?.contact.phoneHref}>📞 {profile?.contact.phone}</a>
              <a href={profile?.contact.linkedin} target="_blank" rel="noopener noreferrer">
                in · LinkedIn
              </a>
            </Reveal>
          </div>
          <Reveal delay={120}>
            <ContactForm />
          </Reveal>
        </div>
      </section>
    </main>
  );
}
