import { Link } from 'react-router-dom';
import { Formula } from '../../components/Formula';
import Dashboard from './Dashboard';
import { BASKET, CHANNELS, MEAN_CONV, PRESETS, SESSIONS_PER_DAY, type PresetId } from './model';
import { duration, euros2, int, pct } from './format';
import { usePresetStats } from './presetStats';
import { EcrIcon } from './icons';
import './ecommerce-temps-reel.css';

/** Démo « E-commerce en temps réel » : boutique simulée dans le navigateur, indicateurs, prévision et détection d'anomalies. */
export default function Demo() {
  return (
    <main className="demo-page ecommerce-temps-reel">
      <header className="wrap ecr-hero">
        <h1>Une boutique qui tourne sous vos yeux, et une surveillance qui repère ses pannes</h1>
        <p className="sec-lede">
          Sessions, commandes et paniers arrivent en continu selon un profil horaire réaliste ; chaque indicateur est comparé à ce que le
          modèle attend à cette heure-ci. Injectez une panne, puis mesurez combien de minutes la surveillance met à la repérer, et combien de
          fausses alertes ce réglage coûte.
        </p>
        <ul className="ecr-chips" aria-label="Compétences mises en œuvre">
          <li>Simulation stochastique</li>
          <li>Prévision avec bande d’incertitude</li>
          <li>Cartes de contrôle EWMA</li>
          <li>Pilotage par indicateurs</li>
        </ul>
        <p className="ecr-disclaimer">
          <EcrIcon name="box" size={14} />
          Données entièrement simulées dans votre navigateur : la boutique, ses produits et ses chiffres sont fictifs. Rien n’est envoyé.
        </p>
      </header>

      <div className="ecr-tool-wrap">
        <Dashboard />
      </div>

      <Method />

      <section className="wrap ecr-cta" aria-labelledby="ecr-cta-title">
        <h2 id="ecr-cta-title">Des tableaux de bord qui alertent au bon moment</h2>
        <p className="sec-lede">
          Profil attendu, marge d’incertitude, seuils réglés sur un taux de fausses alertes assumé : la même démarche s’applique à vos
          ventes, à vos stocks ou à vos tickets de support.
        </p>
        <div className="ecr-cta-actions">
          <Link to="/#contact" className="btn btn-primary">
            Parlons de votre besoin
          </Link>
          <Link to="/cv" className="btn">
            Voir le CV
          </Link>
        </div>
      </section>
    </main>
  );
}

function Method() {
  const stats = usePresetStats();
  const ordersPerDay = SESSIONS_PER_DAY * MEAN_CONV;
  return (
    <section className="wrap ecr-method" aria-labelledby="ecr-method-title">
      <h2 id="ecr-method-title">Méthode</h2>

      <div className="ecr-method-grid">
        <article>
          <h3>Une boutique simulée minute par minute</h3>
          <p>
            Les sessions de chaque canal c arrivent selon un processus de Poisson dont l’intensité suit un profil horaire h (creux à 4 h,
            pointe vers 21 h) et un facteur de jour w (le dimanche pèse plus que le samedi). Chaque session se convertit avec la probabilité
            de son canal :
          </p>
          <Formula tex={String.raw`S_{c,t} \sim \mathcal{P}\big(\bar\lambda\, h(t)\, w(j)\, \pi_c\big), \qquad O_{c,t} \mid S_{c,t} \sim \mathcal{B}(S_{c,t},\, p_c)`} />
          <p>
            Un panier compte <Formula display={false} tex={String.raw`L = 1 + \mathcal{P}(0{,}3)`} /> lignes, chacune un produit tiré dans
            un catalogue de 16 articles et une quantité de 1 à 3. Soit en moyenne {int(SESSIONS_PER_DAY)} sessions,{' '}
            {pct(MEAN_CONV)} de conversion, {int(ordersPerDay)} commandes et un panier moyen de {euros2(BASKET.mean)} par jour. Les
            retours arrivent pendant les heures d’entrepôt. Le générateur aléatoire a une graine : la même graine rejoue la même journée.
          </p>
        </article>

        <article>
          <h3>Ce que le modèle attend, et sa marge</h3>
          <p>
            Le CA cumulé est un processus de Poisson composé : un nombre de commandes de Poisson, chacune d’un montant aléatoire X. Ses deux
            premiers moments sont exacts, ce qui donne la bande à 95 % et la projection jusqu’à minuit, recalculée à chaque minute à
            partir du CA déjà encaissé :
          </p>
          <Formula tex={String.raw`\mathbb{E}[\mathrm{CA}_\tau] = \Lambda(\tau)\,\mathbb{E}[X], \qquad \operatorname{Var}(\mathrm{CA}_\tau) = \Lambda(\tau)\,\mathbb{E}[X^2]`} />
          <p>
            où <Formula display={false} tex={String.raw`\Lambda(\tau)`} /> est le nombre de commandes attendu jusqu’à τ. La variation
            « vs hier » est calculée à heure égale, jamais sur la journée entière.
          </p>
        </article>

        <article>
          <h3>Détecter un écart sans crier au loup</h3>
          <p>
            Pour chaque indicateur, on compare la minute observée x à la valeur attendue μ, puis on lisse l’écart par une moyenne mobile
            exponentielle, standardisée par sa variance exacte sous le modèle :
          </p>
          <Formula
            tex={String.raw`\begin{aligned} A_t &= (1-\lambda)\,A_{t-1} + \lambda\,(x_t - \mu_t) \\ V_t &= (1-\lambda)^2\,V_{t-1} + \lambda^2\, v_t \\ Z_t &= A_t / \sqrt{V_t} \end{aligned}`}
          />
          <p>
            Alerte quand Z franchit ±L (λ = 0,1, soit une fenêtre effective d’une vingtaine de minutes), fin d’alerte quand |Z| repasse sous
            1. La conversion attendue tient compte du mélange des canaux observé : un afflux de visiteurs venus des réseaux sociaux ne passe
            pas pour une panne. Commandes, conversion et panier ne sont surveillés qu’à la baisse ; les sessions, dans les deux sens.
          </p>
          <p>
            Le produit phare se vend trop rarement pour cette carte : même à zéro vente, Z ne peut pas dépasser la racine du nombre de ventes
            attendues dans la fenêtre (≈ 2 &lt; L). On teste donc le temps écoulé depuis la dernière vente :
            <Formula display={false} tex={String.raw`\;P(\text{aucune vente}) = e^{-\Lambda} < \Phi(-L)`} />. La nuit, quand le volume
            attendu est trop faible, une carte se met en veille plutôt que de sonner sur une seule commande.
          </p>
        </article>

        <article>
          <h3>Le compromis, chiffré</h3>
          <p>
            Pour un même lissage, monter la limite L espace les fausses alertes mais retarde la détection. L’ARL (durée moyenne avant
            alerte) se calcule par chaîne de Markov (Brook et Evans, 1972), vérifiée contre la table de Lucas et Saccucci (1990). Fausses
            alertes : les cinq indicateurs ensemble ; délais : pour une baisse persistante de δ écarts-types par minute.
          </p>
          <div className="ecr-table-wrap">
            <table className="ecr-table ecr-arl" aria-busy={!stats}>
              <caption className="ecr-sr">Délais moyens avant alerte selon le réglage, en minutes simulées</caption>
              <thead>
                <tr>
                  <th scope="col">Réglage</th>
                  <th scope="col">L</th>
                  <th scope="col">Entre 2 fausses alertes</th>
                  <th scope="col">Baisse 0,5 σ</th>
                  <th scope="col">1 σ</th>
                  <th scope="col">2 σ</th>
                </tr>
              </thead>
              <tbody>
                {(Object.keys(PRESETS) as PresetId[]).map((id) => {
                  const s = stats?.[id];
                  return (
                    <tr key={id}>
                      <th scope="row">{PRESETS[id].label}</th>
                      <td>{PRESETS[id].L.toFixed(1).replace('.', ',')}</td>
                      <td>{s ? duration(s.falseEvery) : '…'}</td>
                      <td>{s ? duration(s.delay[0.5]) : '…'}</td>
                      <td>{s ? duration(s.delay[1]) : '…'}</td>
                      <td>{s ? duration(s.delay[2]) : '…'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="ecr-muted ecr-small">
            Une panne de paiement à 90 % fait chuter les commandes d’environ 1 σ par minute en journée : elle est repérée en une dizaine de
            minutes. Le même écart à 4 h du matin, avec dix fois moins de commandes, prend bien plus longtemps.
          </p>
        </article>
      </div>

      <div className="ecr-limits">
        <h3>Limites</h3>
        <ul>
          <li>
            Ici, le modèle attendu est exactement celui qui génère les données. Sur une vraie boutique, il faut l’estimer sur l’historique
            (saisonnalité, jours fériés, promotions) et prévoir une surdispersion, par exemple avec une loi binomiale négative.
          </li>
          <li>
            Les seuils supposent un Z à peu près normal ; avec peu d’événements, la loi est asymétrique, d’où la mise en veille quand le
            volume attendu est trop faible.
          </li>
          <li>
            Cinq indicateurs surveillés en parallèle multiplient les fausses alertes : le taux affiché est celui de l’ensemble, en supposant
            les indicateurs indépendants (commandes et conversion ne le sont pas tout à fait).
          </li>
          <li>
            Canaux et taux de conversion ({CHANNELS.map((c) => `${c.label.toLowerCase()} ${pct(c.conv, 1)}`).join(', ')}) sont des
            hypothèses de simulation, pas des références de marché.
          </li>
        </ul>
      </div>
    </section>
  );
}
