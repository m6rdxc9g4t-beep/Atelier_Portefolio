import { mulberry32, toCsv } from './model';

/**
 * Jeux d'exemple SIMULÉS (aucune donnée réelle), générés avec une graine fixe.
 * Chacun contient des défauts typiques, injectés volontairement et en proportions connues.
 */
export interface Example {
  id: string;
  label: string;
  /** Une ligne : ce que le jeu illustre. */
  hint: string;
  filename: string;
  csv: string;
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
const DAY = 86_400_000;
const isoDay = (t: number) => {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
const frDay = (t: number) => {
  const d = new Date(t);
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
};
const ascii = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

function gaussian(r: () => number) {
  const u = Math.max(1e-12, r());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

const PRENOMS = ['Camille', 'Léa', 'Manon', 'Chloé', 'Inès', 'Jade', 'Louise', 'Emma', 'Alice', 'Sarah', 'Julie', 'Clara', 'Zoé', 'Anaïs', 'Hugo', 'Lucas', 'Louis', 'Gabriel', 'Arthur', 'Jules', 'Nathan', 'Théo', 'Raphaël', 'Tom', 'Paul', 'Maxime', 'Antoine', 'Mehdi', 'Yanis', 'Nora', 'Élodie', 'Romain', 'Julien', 'Claire', 'Sophie', 'Marc', 'Céline', 'Hélène'];
const NOMS = ['Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand', 'Leroy', 'Moreau', 'Simon', 'Laurent', 'Lefebvre', 'Michel', 'Garcia', 'David', 'Bertrand', 'Roux', 'Vincent', 'Fournier', 'Morel', 'Girard', 'André', 'Mercier', 'Dupont', 'Lambert', 'Bonnet', 'François', 'Legrand', 'Garnier', 'Faure', 'Rousseau', 'Blanc', 'Muller', 'Henry', 'Perrin', 'Morin', 'Clément', 'Chevalier', 'Nguyen', 'Le Gall'];
const VILLES: [string, string][] = [
  ['Paris', '75011'], ['Paris', '75015'], ['Lyon', '69003'], ['Marseille', '13006'], ['Toulouse', '31000'], ['Nantes', '44000'], ['Bordeaux', '33000'],
  ['Lille', '59000'], ['Strasbourg', '67000'], ['Rennes', '35000'], ['Angers', '49000'], ['Arras', '62000'], ['Montpellier', '34000'], ['Grenoble', '38000'],
  ['Annecy', '74000'], ['Bourg-en-Bresse', '01000'], ['Laon', '02000'], ['Moulins', '03000'], ['Gap', '05000'], ['Nice', '06000'], ['Charleville-Mézières', '08000'], ['Foix', '09000'],
];
const DOMAINES = ['gmail.com', 'orange.fr', 'free.fr', 'outlook.fr', 'laposte.net', 'yahoo.fr', 'sfr.fr'];

/** Fichier clients d'un CRM : la panoplie complète des défauts de saisie. */
function crm(): string {
  const r = mulberry32(2024);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)]!;
  const header = ['id_client', 'prenom', 'nom', 'email', 'code_postal', 'ville', 'date_inscription', 'segment', 'ca_12_mois', 'newsletter'];
  type Person = string[];
  const rows: Person[] = [];
  const t0 = Date.UTC(2021, 0, 1);
  for (let i = 0; i < 1500; i++) {
    const prenom = pick(PRENOMS);
    const nom = pick(NOMS);
    const [ville, cp] = pick(VILLES);
    const seg = r() < 0.72 ? 'Particulier' : r() < 0.85 ? 'Professionnel' : 'Association';
    const t = t0 + Math.floor(r() * 1700) * DAY;

    let email = `${ascii(prenom)}.${ascii(nom)}${r() < 0.4 ? Math.floor(r() * 90 + 10) : ''}@${pick(DOMAINES)}`;
    const e = r();
    if (e < 0.03) email = '';
    else if (e < 0.04) email = email.replace('@', '.');
    else if (e < 0.047) email = email.replace(/\.(fr|com|net)$/, ',$1');
    else if (e < 0.053) email = email.replace(/\.[a-z]+$/, '');
    else if (e < 0.057) email = email.replace('.', ' ');

    let code = cp;
    if (cp.startsWith('0') && r() < 0.45) code = cp.slice(1);
    else if (r() < 0.006) code = cp.replace('0', 'O');

    let villeTxt = ville;
    const v = r();
    if (v < 0.025) villeTxt = `${ville} `;
    else if (v < 0.045) villeTxt = ville.toUpperCase();

    let date = isoDay(t);
    const d = r();
    if (d < 0.15) date = frDay(t);
    else if (d < 0.158) date = r() < 0.5 ? `${new Date(t).getUTCFullYear()}-02-30` : `31/04/${new Date(t).getUTCFullYear()}`;

    let segTxt = seg;
    const s = r();
    if (s < 0.04) segTxt = seg.toLowerCase();
    else if (s < 0.05) segTxt = seg.toUpperCase();
    else if (s < 0.07) segTxt = `${seg} `;

    const base = Math.exp(Math.log(seg === 'Professionnel' ? 1800 : 380) + 0.7 * gaussian(r));
    let ca = base.toFixed(2).replace('.', ',');
    const c = r();
    if (c < 0.04) ca = '';
    else if (c < 0.05) ca = 'NA';
    else if (c < 0.054) ca = (base * 100).toFixed(2).replace('.', ',');
    else if (c < 0.056) ca = (-base).toFixed(2).replace('.', ',');
    else if (c < 0.071) ca = base.toFixed(2);

    let news = r() < 0.38 ? 'oui' : 'non';
    const n = r();
    if (n < 0.05) news = news === 'oui' ? 'Oui' : 'Non';
    else if (n < 0.065) news = news.toUpperCase();
    else if (n < 0.09) news = '';

    rows.push([String(1001 + i), prenom, nom, email, code, villeTxt, date, segTxt, ca, news]);
  }
  // Quasi-doublons : la même personne ressaisie plus tard sous un nouvel identifiant.
  const out: Person[] = [...rows];
  let nextId = 1001 + rows.length;
  for (let k = 0; k < 32; k++) {
    const src = rows[Math.floor(r() * rows.length)]!;
    const copy = [...src];
    copy[0] = String(nextId++);
    copy[2] = copy[2]!.toUpperCase();
    copy[3] = copy[3]!.toUpperCase();
    copy[5] = `${copy[5]!.trim()}  `;
    out.splice(Math.floor(r() * out.length), 0, copy);
  }
  // Doublons exacts : un lot importé deux fois.
  for (let k = 0; k < 20; k++) {
    const at = Math.floor(r() * out.length);
    out.splice(at + 1, 0, [...out[at]!]);
  }
  return toCsv({ header, rows: out, delimiter: ';' });
}

/** Relevé horaire de capteurs : trous, codes d'erreur pris pour des mesures, retransmissions. */
function capteurs(): string {
  const r = mulberry32(7);
  const header = ['horodatage', 'capteur', 'temperature_c', 'humidite_pct', 'statut'];
  const rows: string[][] = [];
  const t0 = Date.UTC(2025, 2, 1);
  const sensors = ['C-01', 'C-02', 'C-03', 'C-04'];
  for (let h = 0; h < 560; h++) {
    const t = new Date(t0 + h * 3_600_000);
    const stamp = `${isoDay(t.getTime())} ${pad(t.getUTCHours())}:00`;
    sensors.forEach((s, k) => {
      const daily = Math.sin(((t.getUTCHours() - 9) / 24) * 2 * Math.PI);
      const temp = 19 + k * 0.8 + 3.2 * daily + 0.6 * gaussian(r);
      let tt = temp.toFixed(1);
      const x = r();
      if (x < 0.03) tt = 'NA';
      else if (x < 0.04) tt = '';
      else if (x < 0.0445) tt = r() < 0.5 ? '85.0' : '-40.0';
      else if (x < 0.065) tt = temp.toFixed(1).replace('.', ',');
      let hum = String(Math.round(48 - 9 * daily + 4 * gaussian(r)));
      if (r() < 0.004) hum = '999';
      let st = temp > 23.5 ? 'Alerte' : 'OK';
      const y = r();
      if (y < 0.04) st = st.toLowerCase();
      else if (y < 0.05) st = st.toUpperCase();
      rows.push([stamp, s, tt, hum, st]);
      if (r() < 0.006) rows.push([stamp, s, tt, hum, st]); // retransmission
    });
  }
  return toCsv({ header, rows, delimiter: ',' });
}

/** Ventes de magasins : montants avec symboles, enseignes mal orthographiées, un fichier importé deux fois. */
function ventes(): string {
  const r = mulberry32(512);
  const header = ['date', 'magasin', 'ref_produit', 'quantite', 'prix_unitaire', 'montant'];
  const mags = ['Lyon Part-Dieu', 'Paris Bastille', 'Nantes Centre', 'Lille Europe', 'Bordeaux Lac'];
  const rows: string[][] = [];
  const t0 = Date.UTC(2025, 0, 6);
  for (let i = 0; i < 880; i++) {
    const t = t0 + Math.floor(r() * 300) * DAY;
    const mag = mags[Math.floor(r() * mags.length)]!;
    const ref = `P-${pad(Math.floor(r() * 120) + 1, 4)}`;
    let q = 1 + Math.floor(-Math.log(Math.max(1e-9, r())) * 1.6);
    if (r() < 0.03) q = -q; // retours
    const prix = Math.round((4 + Math.exp(2.4 + 0.6 * gaussian(r))) * 100) / 100;
    let date = frDay(t);
    if (r() < 0.06) date = date.replace(/\/(\d{2})(\d{2})$/, '/$2');
    let magTxt = mag;
    const m = r();
    if (m < 0.04) magTxt = mag.toLowerCase();
    else if (m < 0.06) magTxt = mag.replace(' ', '  ');
    let qty = String(q);
    if (r() < 0.003) qty = String(q * 1000);
    if (r() < 0.01) qty = 'deux';
    const prixTxt = r() < 0.3 ? `${prix.toFixed(2).replace('.', ',')} €` : prix.toFixed(2).replace('.', ',');
    const montant = r() < 0.05 ? '' : (q * prix).toFixed(2).replace('.', ',');
    rows.push([date, magTxt, ref, qty, prixTxt, montant]);
  }
  // Le fichier de la semaine 12 importé deux fois.
  const block = rows.slice(400, 440).map((x) => [...x]);
  rows.splice(440, 0, ...block);
  return toCsv({ header, rows, delimiter: ';' });
}

export function examples(): Example[] {
  return [
    {
      id: 'crm',
      label: 'Fichier clients',
      hint: 'Export d’un CRM : 1 500 clients, e-mails et codes postaux abîmés, dates en deux formats, doublons de saisie.',
      filename: 'clients-crm-simule.csv',
      csv: crm(),
    },
    {
      id: 'capteurs',
      label: 'Capteurs',
      hint: 'Relevé horaire de 4 capteurs : mesures manquantes, codes d’erreur pris pour des valeurs, retransmissions.',
      filename: 'releve-capteurs-simule.csv',
      csv: capteurs(),
    },
    {
      id: 'ventes',
      label: 'Ventes magasins',
      hint: 'Tickets de 5 magasins : prix avec le symbole €, enseignes mal écrites, un fichier hebdomadaire importé deux fois.',
      filename: 'ventes-magasins-simule.csv',
      csv: ventes(),
    },
  ];
}
