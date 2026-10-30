import { useMemo, useState } from 'react';
import { fmt } from '@atelier/shared';
import { Reveal } from '../../components/Reveal';

interface Rule {
  prix_max_eur: number;
  regex: string;
  mots_cles: string[];
}

const EXAMPLES = [
  { title: 'Renault Clio IV 1.5 dCi 90 ch, carnet d’entretien', price: '9490' },
  { title: 'Peugeot 208 vendue pour pièces, épave', price: '800' },
  { title: 'Golf 7 TDI, très bon état, à saisir', price: '1' },
  { title: 'Citroën C3 Aircross, première main', price: '' },
];

/**
 * Applique la règle is_suspicious_price du notebook Databricks (couche silver) :
 * prix manquant, prix ≤ 500 € ou vocabulaire de vente de pièces dans le titre ou la description.
 */
export function QualityTester({ rule }: { rule: Rule }) {
  const [title, setTitle] = useState(EXAMPLES[0].title);
  const [price, setPrice] = useState(EXAMPLES[0].price);
  // même expression régulière que le notebook, appliquée au texte mis en minuscules
  const re = useMemo(() => new RegExp(rule.regex, 'u'), [rule.regex]);
  const p = price.trim() === '' ? null : Number(price.replace(/\s/g, '').replace(',', '.'));
  const match = title.toLowerCase().match(re)?.[0] ?? null;
  const reasons = [
    p === null || Number.isNaN(p) ? 'prix manquant' : null,
    p !== null && !Number.isNaN(p) && p <= rule.prix_max_eur ? `prix ≤ ${fmt(rule.prix_max_eur)} €` : null,
    match ? `mot repéré : « ${match} »` : null,
  ].filter(Boolean) as string[];
  const flagged = reasons.length > 0;

  return (
    <Reveal className={`lbc-panel lbc-tester ${flagged ? 'is-flagged' : 'is-ok'}`}>
      <div className="lbc-ad lbc-ad-mini">
        <div className="lbc-ad-img" aria-hidden>
          🚗
        </div>
        <div className="lbc-ad-body">
          <label className="lbc-field">
            <span>Titre de l’annonce</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} />
          </label>
          <label className="lbc-field">
            <span>Prix (€)</span>
            <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="vide = prix manquant" />
          </label>
        </div>
      </div>
      <div className="lbc-verdict" aria-live="polite">
        <code>is_suspicious_price = {flagged ? 1 : 0}</code>
        <strong>{flagged ? 'Annonce écartée des calculs de prix' : 'Annonce comparable'}</strong>
        {flagged && (
          <ul>
            {reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
      </div>
      <div className="lbc-examples">
        {EXAMPLES.map((ex, i) => (
          <button
            key={i}
            onClick={() => {
              setTitle(ex.title);
              setPrice(ex.price);
            }}
          >
            Exemple {i + 1}
          </button>
        ))}
      </div>
      <p className="lbc-tester-note">
        Mots surveillés : {rule.mots_cles.join(', ')}. Les annonces signalées restent dans <code>fact_listing</code> ; un filtre les exclut des prix dans Power BI.
      </p>
    </Reveal>
  );
}
