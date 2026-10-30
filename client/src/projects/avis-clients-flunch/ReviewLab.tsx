import { useEffect, useState } from 'react';
import { classifyReview, FAMILY_LABELS, fmt, type Classification } from '@atelier/shared';
import { api } from '../../api';
import './review-lab.css';

const EXAMPLES = [
  'Personnel très aimable et souriant, accueil agréable, on reviendra avec les enfants !',
  'Plats froids, viande trop cuite et longue attente en caisse, vraiment décevant.',
  'Bon rapport qualité prix, légumes à volonté, salle propre et calme.',
  'Le buffet manquait de choix et la salle était bruyante et sale.',
];

/**
 * Démo : classe un avis par famille thématique (dictionnaires du projet) et par polarité.
 * Appel à POST /api/nlp/classify, avec repli local (même code) si l'API ne répond pas.
 */
export function ReviewLab() {
  const [text, setText] = useState(EXAMPLES[0]);
  const [res, setRes] = useState<Classification | null>(null);
  const [source, setSource] = useState<'api' | 'local'>('api');

  useEffect(() => {
    const t = setTimeout(async () => {
      if (text.trim().length < 2) return setRes(null);
      try {
        setRes(await api<Classification>('/nlp/classify', { method: 'POST', json: { text } }));
        setSource('api');
      } catch {
        setRes(classifyReview(text));
        setSource('local');
      }
    }, 220);
    return () => clearTimeout(t);
  }, [text]);

  const pct = res ? ((res.score + 1) / 2) * 100 : 50;

  return (
    <div className="rlab">
      <div className="rlab-input">
        <label htmlFor="rlab-text">Écrivez (ou choisissez) un avis client :</label>
        <textarea id="rlab-text" rows={4} maxLength={600} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="rlab-examples">
          {EXAMPLES.map((ex, i) => (
            <button key={i} onClick={() => setText(ex)} className={ex === text ? 'is-on' : ''}>
              Exemple {i + 1}
            </button>
          ))}
        </div>
      </div>
      <div className="rlab-out" aria-live="polite">
        {res && (
          <>
            <div className={`rlab-pol rlab-${res.polarity === 'négatif' ? 'neg' : res.polarity === 'positif' ? 'pos' : 'neu'}`}>
              <span>Polarité</span>
              <strong>{res.polarity}</strong>
              <small>score {fmt(res.score, 2, 2)}</small>
            </div>
            <div className="rlab-gauge" aria-hidden>
              <i style={{ left: `${pct}%` }} />
            </div>
            <div className="rlab-fam">
              <span>Famille dominante</span>
              <strong>{res.familyLabel}</strong>
            </div>
            <ul className="rlab-counts">
              {Object.entries(res.familyCounts).map(([k, v]) => (
                <li key={k} className={k === res.family ? 'is-top' : ''}>
                  <span>{FAMILY_LABELS[k] ?? k}</span>
                  <b>{v}</b>
                </li>
              ))}
            </ul>
            {res.hits.length > 0 && (
              <div className="rlab-hits">
                {res.hits.map((h, i) => (
                  <span key={i} className={h.weight > 0 ? 'pos' : 'neg'}>
                    {h.negated ? 'ne… ' : ''}
                    {h.word} {h.weight > 0 ? '+' : '−'}
                    {fmt(Math.abs(h.weight), 1)}
                  </span>
                ))}
              </div>
            )}
            <p className="rlab-note">
              Démo simplifiée : dictionnaires de familles du projet + petit lexique d’opinion, sans lemmatisation ({source === 'api' ? 'calculé par l’API' : 'calculé dans le navigateur'}).
            </p>
          </>
        )}
      </div>
    </div>
  );
}
