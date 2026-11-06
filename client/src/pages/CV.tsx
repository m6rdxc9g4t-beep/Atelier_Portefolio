import { Link } from 'react-router-dom';
import { useApi, type Profile } from '../api';
import { useTitle } from '../components/SiteChrome';
import { Icon, type IconName } from '../components/Icon';

const INTEREST_ICONS: Record<string, IconName> = { Photographie: 'camera', Voyages: 'plane', 'Sports mécaniques': 'flag' };

/** CV en ligne, imprimable (feuille de style print dédiée). */
export default function CV() {
  useTitle('CV — François Pichon');
  const { data: p } = useApi<Profile>('/profile');
  if (!p) return <div className="page-loading"><span>Chargement du CV…</span></div>;

  return (
    <main className="cv-page">
      <div className="cv-topnav">
        <Link className="btn btn-ghost back" to="/">
          <Icon name="arrow-left" /> Retour au site
        </Link>
        <div className="cv-actions">
          <Link className="btn" to="/projets">
            Projets data
          </Link>
          <Link className="btn" to="/ia-dev">
            IA &amp; dev
          </Link>
          <button className="btn" onClick={() => window.print()}>
            <Icon name="printer" /> Imprimer
          </button>
          {p.cvFreelance && (
            <a className="btn" href={p.cvFreelance} target="_blank" rel="noopener noreferrer">
              <Icon name="download" /> CV freelance (PDF)
            </a>
          )}
          <a className="btn btn-primary" href={p.cv} target="_blank" rel="noopener noreferrer">
            <Icon name="download" /> CV en PDF
          </a>
        </div>
      </div>

      <article className="cv">
        <header className="cv-head">
          <div className="cv-head-in">
            <span className="badge">
              <span className="dot" aria-hidden /> {p.status}
            </span>
            <h1>{p.name}</h1>
            <div className="role">
              {p.headline} · {p.school}
            </div>
            <div className="contact">
              <a href={`mailto:${p.contact.email}`}>
                <Icon name="mail" className="ci" /> {p.contact.email}
              </a>
              <a href={p.contact.phoneHref}>
                <Icon name="phone" className="ci" /> {p.contact.phone}
              </a>
              <a href={p.contact.linkedin} target="_blank" rel="noopener noreferrer">
                <Icon name="linkedin" className="ci" /> linkedin.com/in/françois-pichon
              </a>
              {p.contact.github && (
                <a href={p.contact.github} target="_blank" rel="noopener noreferrer">
                  <Icon name="github" className="ci" /> github.com/{p.contact.github.split('/').pop()}
                </a>
              )}
            </div>
          </div>
        </header>

        <div className="cv-body">
          <div className="cv-main">
            <section className="cv-sec">
              <h2 className="cv-title">À propos</h2>
              <p className="about">{p.about}</p>
            </section>

            <section className="cv-sec">
              <h2 className="cv-title">Expériences professionnelles</h2>
              <ol className="tl">
                {p.experiences.map((e) => (
                  <li key={e.title} className={e.featured ? 'feat' : ''}>
                    <span className="tl-when">{e.when}</span>
                    <strong>
                      {e.title} {e.tag && <span className="feat-tag">{e.tag}</span>}
                    </strong>
                    <span className="tl-org">{e.org}</span>
                    <ul>
                      {e.points.map((pt) => (
                        <li key={pt}>{pt}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            </section>

            <section className="cv-sec">
              <h2 className="cv-title">Formation</h2>
              <ol className="tl">
                {p.education.map((e) => (
                  <li key={e.title}>
                    <span className="tl-when">{e.when}</span>
                    <strong>{e.title}</strong>
                    <span className="tl-org">{e.org}</span>
                  </li>
                ))}
              </ol>
            </section>

            <section className="cv-sec">
              <h2 className="cv-title">Réalisations clés</h2>
              {p.highlights.map((h) => (
                <div key={h.level} className="real-group">
                  <div className="real-lbl">{h.level}</div>
                  <ul className="real-list">
                    {h.items.map((it) => (
                      <li key={it}>{it}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          </div>

          <aside className="cv-side">
            <section className="cv-sec">
              <h2 className="cv-title">Compétences</h2>
              {p.skills.map((g) => (
                <div key={g.group} className="skill-block">
                  <div className="real-lbl">
                    {g.group} {g.certified && <span className="certified">· certifié</span>}
                  </div>
                  <div className="chips">
                    {g.items.map((it) => (
                      <span key={it} className={`chip ${g.highlight?.includes(it) ? 'hot' : ''}`}>
                        {it}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </section>
            <section className="cv-sec">
              <h2 className="cv-title">Langues</h2>
              {p.languages.map((l) => (
                <div key={l.name} className="lang-row">
                  <b>{l.name}</b> <span className="lvl">{l.level}</span>
                </div>
              ))}
            </section>
            <section className="cv-sec">
              <h2 className="cv-title">Savoir-être</h2>
              <div className="qualities">
                {p.qualities.map((q) => (
                  <span key={q} className="q">
                    {q}
                  </span>
                ))}
              </div>
            </section>
            <section className="cv-sec">
              <h2 className="cv-title">Centres d’intérêt</h2>
              {p.passions.map((x) => (
                <div key={x.title} className="interest">
                  <Icon name={INTEREST_ICONS[x.title] ?? 'sparkles'} className="ii" />
                  <span className="it">
                    <b>{x.title}</b>
                    {x.figure} {x.unit} — {x.tags.slice(0, 3).join(', ')}
                  </span>
                </div>
              ))}
            </section>
          </aside>
        </div>
      </article>
    </main>
  );
}
