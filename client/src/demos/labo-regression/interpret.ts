import type { Diagnostics, Fit, Spec } from './model';
import { fmtCoef, fmtNum, fmtP } from './model';

export type Level = 'ok' | 'warn' | 'alert';
export interface Verdict {
  level: Level;
  label: string;
  text: string;
  todo: string;
}

const pct = (v: number) => `${fmtNum(v * 100, 1)} %`;

export function bpVerdict(d: Diagnostics): Verdict {
  const { stat, df, p } = d.bp;
  if (!Number.isFinite(p)) return { level: 'ok', label: 'Sans objet', text: 'Il faut au moins un régresseur pour tester la variance des résidus.', todo: '' };
  const gap = d.seGap && Math.abs(d.seGap.ratio - 1) > 0.05 ? ` L’écart le plus net concerne « ${d.seGap.name} » : son erreur-type robuste vaut ${fmtNum(d.seGap.ratio, 2)} fois la classique.` : '';
  if (p < 0.05)
    return {
      level: 'alert',
      label: 'Hétéroscédasticité',
      text: `Breusch-Pagan = ${fmtNum(stat, 1)} (χ² à ${df} ddl, p ${fmtP(p).startsWith('<') ? '' : '= '}${fmtP(p)}) : la dispersion des résidus dépend des régresseurs.${gap}`,
      todo: 'Les coefficients restent sans biais, mais leurs erreurs-types classiques sont fausses : lisez les erreurs-types robustes (HC1). Une transformation logarithmique de Y réduit souvent le problème.',
    };
  return {
    level: 'ok',
    label: 'Variance stable',
    text: `Breusch-Pagan = ${fmtNum(stat, 1)} (p = ${fmtP(p)}) : rien n’indique que la dispersion des résidus varie avec les régresseurs.${gap}`,
    todo: 'Erreurs-types classiques et robustes se valent ici ; les robustes restent un choix prudent par défaut.',
  };
}

export function jbVerdict(d: Diagnostics, n: number): Verdict {
  const { stat, p, skew, kurt } = d.jb;
  const shape = `asymétrie ${fmtNum(skew, 2)}, aplatissement ${fmtNum(kurt, 2)} (3 pour une loi normale)`;
  if (p < 0.05)
    return {
      level: n >= 100 ? 'warn' : 'alert',
      label: 'Résidus non normaux',
      text: `Jarque-Bera = ${fmtNum(stat, 1)} (p ${fmtP(p).startsWith('<') ? '' : '= '}${fmtP(p)}) ; ${shape}.`,
      todo:
        n >= 100
          ? `Avec ${n.toLocaleString('fr-FR')} observations, les tests sur les coefficients restent approximativement valides (théorème central limite). Regardez surtout les queues du QQ-plot : une asymétrie à droite appelle souvent un logarithme de Y.`
          : 'Sur un petit échantillon, les tests t et F supposent des résidus normaux : interprétez les p-valeurs avec prudence, ou transformez Y.',
    };
  return { level: 'ok', label: 'Résidus normaux', text: `Jarque-Bera = ${fmtNum(stat, 1)} (p = ${fmtP(p)}) ; ${shape}.`, todo: 'Les points du QQ-plot suivent la diagonale : l’hypothèse de normalité tient.' };
}

/** Deux termes liés par construction (x et x², ou x et une interaction qui le contient) : colinéarité structurelle. */
function structural(a: string, b: string): boolean {
  const base = (s: string) => s.replace(/²$/, '');
  return base(a) === base(b) || a.split(' × ').includes(base(b)) || b.split(' × ').includes(base(a));
}

export function vifVerdict(d: Diagnostics): Verdict {
  const high = d.vif.filter((v) => v.vif > 10);
  const mid = d.vif.filter((v) => v.vif > 5 && v.vif <= 10);
  if (high.length === 0 && mid.length === 0)
    return { level: 'ok', label: 'Pas de colinéarité', text: `Tous les VIF sont sous 5 (le plus élevé : ${fmtNum(Math.max(1, ...d.vif.map((v) => v.vif)), 1)}).`, todo: 'Chaque effet est estimé avec la précision que permettent les données.' };
  const flagged = high.length ? high : mid;
  const names = flagged.map((v) => `« ${v.name} » (${Number.isFinite(v.vif) ? fmtNum(v.vif, 1) : '∞'})`).join(', ');
  const allStructural = flagged.every((v) => flagged.some((w) => w !== v && structural(v.name, w.name)));
  if (allStructural)
    return {
      level: 'ok',
      label: 'Colinéarité structurelle',
      text: `VIF élevés pour ${names} : une variable et son carré (ou son interaction) varient forcément ensemble.`,
      todo: 'Ce n’est pas un défaut : le profil complet reste bien estimé. Centrer la variable avant de l’élever au carré ferait baisser ces VIF sans changer les prédictions.',
    };
  return {
    level: high.length ? 'alert' : 'warn',
    label: high.length ? 'Multicolinéarité forte' : 'Multicolinéarité modérée',
    text: `VIF de ${names} : la variance de ces coefficients est multipliée d’autant par rapport à des régresseurs indépendants.`,
    todo: 'Les effets séparés sont imprécis, voire de signe trompeur, même si le modèle prédit bien. Regroupez les variables liées (une somme, un indice), gardez-en une, ou testez-les ensemble (test F) si seul leur effet conjoint compte.',
  };
}

export function cookVerdict(d: Diagnostics, n: number, labelOf: (i: number) => string): Verdict {
  const k = d.influential.length;
  const big = d.cooks.filter((c) => c > 1).length;
  const top = d.influential.slice(0, 3).map((i) => `${labelOf(i)} (D = ${fmtCoef(d.cooks[i]!)})`).join(', ');
  if (big > 0)
    return {
      level: 'alert',
      label: 'Point très influent',
      text: `${big} observation${big > 1 ? 's ont' : ' a'} une distance de Cook supérieure à 1 : à elle${big > 1 ? 's' : ''} seule${big > 1 ? 's' : ''}, elle${big > 1 ? 's' : ''} déplace${big > 1 ? 'nt' : ''} les coefficients. Les plus fortes : ${top}.`,
      todo: 'Vérifiez ces lignes (erreur de saisie, unité, cas hors champ). Réestimez sans elles : si les conclusions changent, elles ne reposent que sur quelques points.',
    };
  if (k / n > 0.08)
    return {
      level: 'warn',
      label: 'Influence diffuse',
      text: `${k} observations (${pct(k / n)}) dépassent le seuil 4/n, sans qu’aucune ne dépasse 1. Les plus fortes : ${top}.`,
      todo: 'Beaucoup de points modérément influents signalent souvent une forme mal spécifiée (relation non linéaire, variance non constante) plutôt que des erreurs isolées.',
    };
  return {
    level: 'ok',
    label: k ? 'Influence normale' : 'Aucun point influent',
    text: k ? `${k} observation${k > 1 ? 's' : ''} dépasse${k > 1 ? 'nt' : ''} le seuil 4/n, aucune ne dépasse 1${top ? ` (${top})` : ''}.` : 'Aucune observation ne dépasse le seuil 4/n.',
    todo: 'Aucun point isolé ne pilote l’estimation.',
  };
}

/** Phrase de lecture d'un coefficient selon les transformations de Y et de X. */
export function readCoef(name: string, beta: number, spec: Spec, yLabel: string): string | null {
  if (name === 'Constante' || name.endsWith('²') || name.includes(' × ') || name.includes('[')) return null;
  const logX = name.startsWith('log(');
  const x = logX ? name.slice(4, -1) : name;
  const sqTerm = spec.xs.some((c) => c.col === x && c.sq);
  if (sqTerm) return `« ${name} » entre aussi au carré : son effet dépend de son niveau (dérivée β₁ + 2β₂·x).`;
  const b = fmtCoef(beta);
  if (spec.logY && logX) return `Élasticité : +1 % de ${x} va de pair avec ${beta >= 0 ? '+' : ''}${fmtCoef(beta)} % de ${spec.y}, les autres variables étant fixées.`;
  if (spec.logY) {
    const effect = (Math.exp(beta) - 1) * 100;
    return `Une unité de plus de ${x} va de pair avec ${effect >= 0 ? '+' : ''}${fmtNum(effect, 1)} % de ${spec.y} (e^β − 1), les autres variables étant fixées.`;
  }
  if (logX) return `+1 % de ${x} va de pair avec ${beta >= 0 ? '+' : ''}${fmtCoef(beta / 100)} de ${yLabel} (β/100), les autres variables étant fixées.`;
  return `Une unité de plus de ${x} va de pair avec ${beta >= 0 ? '+' : ''}${b} de ${yLabel}, les autres variables étant fixées.`;
}

export const fitSummary = (fit: Fit) => `N = ${fit.n.toLocaleString('fr-FR')}, R² = ${fmtNum(fit.r2, 3)}`;
