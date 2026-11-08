import { describe, expect, it } from 'vitest';
import Papa from 'papaparse';
import {
  cleanTable,
  DEFAULT_CLEAN,
  detectDelimiter,
  inferType,
  isPostalCode,
  outlierRule,
  parseDate,
  parseNumber,
  profileTable,
  quantileSorted,
  tableFromRows,
  toCsv,
  type Table,
} from '../../client/src/demos/qualite-donnees/model';
import { examples } from '../../client/src/demos/qualite-donnees/examples';

function read(csv: string) {
  const delimiter = detectDelimiter(csv);
  const parsed = Papa.parse<string[]>(csv, { delimiter, skipEmptyLines: 'greedy' });
  return tableFromRows(parsed.data, delimiter);
}

describe('lecture des valeurs', () => {
  it('lit les nombres à la française et à l’anglaise', () => {
    expect(parseNumber('1 250,50 €')).toMatchObject({ value: 1250.5, dec: ',', decorated: true });
    expect(parseNumber('1,250.50')).toMatchObject({ value: 1250.5, dec: '.' });
    expect(parseNumber('21,4')).toMatchObject({ value: 21.4, dec: ',' });
    expect(parseNumber('-40.0')).toMatchObject({ value: -40, dec: '.' });
    expect(parseNumber('12')).toMatchObject({ value: 12, dec: null, decorated: false });
    expect(parseNumber('deux')).toBeNull();
    expect(parseNumber('2024-01-03')).toBeNull();
  });

  it('reconnaît les formats de date et repère les jours impossibles', () => {
    expect(parseDate('2024-03-07')).toEqual({ iso: '2024-03-07', fmt: 'AAAA-MM-JJ', valid: true });
    expect(parseDate('07/03/2024')).toEqual({ iso: '2024-03-07', fmt: 'JJ/MM/AAAA', valid: true });
    expect(parseDate('03/27/2024')).toMatchObject({ iso: '2024-03-27', fmt: 'MM/JJ/AAAA' });
    expect(parseDate('2025-03-01 07:00')).toMatchObject({ iso: '2025-03-01 07:00', fmt: 'AAAA-MM-JJ hh:mm', valid: true });
    expect(parseDate('31/04/2024')?.valid).toBe(false);
    expect(parseDate('2024-02-30')?.valid).toBe(false);
    expect(parseDate('2024-02-29')?.valid).toBe(true);
    expect(parseDate('Lyon')).toBeNull();
  });

  it('valide les codes postaux français', () => {
    expect(isPostalCode('75011')).toBe(true);
    expect(isPostalCode('01000')).toBe(true);
    expect(isPostalCode('97400')).toBe(true);
    expect(isPostalCode('1000')).toBe(false);
    expect(isPostalCode('00100')).toBe(false);
    expect(isPostalCode('75O11')).toBe(false);
  });

  it('infère le type d’une colonne', () => {
    expect(inferType(['a@b.fr', 'c@d.com', 'x'], 'email').type).toBe('email');
    expect(inferType(['75011', '1000', '69003'], 'code_postal').type).toBe('postal');
    expect(inferType(['1', '2', '3'], 'n').type).toBe('integer');
    expect(inferType(['1,5', '2', '3'], 'n').type).toBe('decimal');
    expect(inferType(['oui', 'non', 'Oui'], 'actif').type).toBe('boolean');
    const cats = Array.from({ length: 40 }, (_, i) => ['Lyon', 'Paris', 'Nantes'][i % 3]!);
    expect(inferType(cats, 'ville').type).toBe('category');
  });
});

describe('statistiques robustes', () => {
  it('calcule les quantiles comme R (type 7)', () => {
    expect(quantileSorted([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantileSorted([1, 2, 3, 4, 5], 0.25)).toBe(2);
  });

  it('pose les bornes médiane ± 3,5 MAD / 0,6745', () => {
    const xs = [10, 11, 12, 13, 14, 15, 16, 17, 18, 500].sort((a, b) => a - b);
    const rule = outlierRule(xs);
    expect(rule.method).toBe('mad');
    // médiane 14,5 ; MAD 2,5 → demi-largeur 3,5 × 2,5 / 0,6745
    expect(rule.hi).toBeCloseTo(14.5 + (3.5 * 2.5) / 0.6745, 6);
    expect(500 > rule.hi).toBe(true);
    expect(18 < rule.hi).toBe(true);
  });

  it('se rabat sur l’IQR quand le MAD est nul, et renonce si tout est constant', () => {
    expect(outlierRule([0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 50].sort((a, b) => a - b)).method).toBe('mad');
    expect(outlierRule([5, 5, 5, 5, 5, 5, 5, 5, 5]).method).toBe('none');
  });
});

describe('profil d’une table', () => {
  const t: Table = {
    delimiter: ';',
    header: ['id', 'nom', 'ville', 'date', 'montant'],
    rows: [
      ['1', 'Martin', 'Lyon', '2024-01-02', '10,5'],
      ['2', 'Durand', 'Paris', '2024-01-03', '12'],
      ['3', 'Petit', 'lyon', '04/01/2024', '11'],
      ['3', 'Petit', 'lyon', '04/01/2024', '11'],
      ['4', 'MARTIN', 'Lyon ', '02/01/2024', '10.5'],
      ['5', 'Leroy', 'Paris', '2024-01-05', ''],
      ['6', 'Moreau', 'Nantes', '2024-01-06', '9'],
      ['7', 'Simon', 'Nantes', '2024-01-07', '13'],
      ['8', 'Roux', 'Paris', '2024-01-08', '12,5'],
      ['9', 'Faure', 'Lyon', '2024-01-09', '11,5'],
      ['10', 'Blanc', 'Paris', '2024-01-10', '1200'],
    ],
  };
  const p = profileTable(t);

  it('repère doublons exacts et quasi-doublons sans tenir compte de l’identifiant', () => {
    expect(p.exactDuplicates).toEqual([3]);
    expect(p.nearDuplicates).toEqual([4]);
    expect(p.duplicateOf.get(4)).toBe(0);
    expect(p.columns[0]!.idLike).toBe(true);
  });

  it('compte manquants, formats de date, variantes et aberrations', () => {
    const [, , ville, date, montant] = p.columns;
    expect(montant!.missing).toBe(1);
    expect(montant!.type).toBe('decimal');
    expect(montant!.outliers).toBe(1);
    expect(montant!.numeric!.decimals).toEqual({ '.': 1, ',': 3 });
    expect(date!.type).toBe('date');
    expect(date!.dates!.formats.map((f) => f.count)).toEqual([8, 3]);
    expect(ville!.type).toBe('category');
    expect(ville!.straySpaces).toBe(1);
    expect(ville!.variants?.[0]?.forms.map((f) => f.value)).toEqual(['Lyon', 'lyon']);
    expect(p.issues.map((i) => i.id)).toEqual(expect.arrayContaining(['dup-exact', 'dup-near', 'out-4', 'dec-4', 'fmt-3', 'var-2', 'sp-2', 'na-4']));
  });

  it('calcule le score pondéré des quatre dimensions', () => {
    expect(p.scores.completude).toBeCloseTo(100 * (10 / 11), 6);
    expect(p.scores.unicite).toBeCloseTo(100 * (1 - 2 / 11), 6);
    const w = 0.3 * p.scores.completude + 0.3 * p.scores.validite + 0.2 * p.scores.unicite + 0.2 * p.scores.coherence;
    expect(p.score).toBeCloseTo(w, 6);
  });

  it('nettoie : espaces, casse, dates ISO, séparateur décimal, doublons exacts', () => {
    const c = cleanTable(t, p, DEFAULT_CLEAN);
    expect(c.removedRows).toBe(1);
    expect(c.table.rows).toHaveLength(10);
    const row4 = c.table.rows[3]!;
    expect(row4).toEqual(['4', 'MARTIN', 'Lyon', '2024-01-02', '10,5']);
    expect(c.table.rows[2]![2]).toBe('Lyon');
    expect(c.table.rows.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r[3]!))).toBe(true);
    const again = profileTable(c.table);
    expect(again.score).toBeGreaterThan(p.score);
    expect(again.exactDuplicates).toHaveLength(0);
  });
});

describe('structure et CSV', () => {
  it('complète les lignes trop courtes et renomme les en-têtes vides ou répétés', () => {
    const { table, structure } = tableFromRows(
      [
        ['a', '', 'a'],
        ['1', '2'],
        ['3', '4', '5', '6'],
      ],
      ',',
    );
    expect(table.header).toEqual(['a', 'colonne_2', 'a_2']);
    expect(table.rows).toEqual([
      ['1', '2', ''],
      ['3', '4', '5'],
    ]);
    expect(structure.ragged).toEqual([0, 1]);
  });

  it('détecte le séparateur et protège les cellules qui le contiennent', () => {
    expect(detectDelimiter('a;b;c\n1;2;3\n')).toBe(';');
    expect(detectDelimiter('a,b\n"1,5",2\n')).toBe(',');
    const csv = toCsv({ header: ['x', 'y'], rows: [['21,4', 'a "b"']], delimiter: ',' });
    expect(csv).toBe('x,y\r\n"21,4","a ""b"""');
  });
});

describe('jeux d’exemple', () => {
  const ex = examples();

  it('sont reproductibles (graine fixe)', () => {
    expect(examples()[0]!.csv).toBe(ex[0]!.csv);
  });

  it('contiennent bien les défauts annoncés', () => {
    const crm = profileTable(read(ex[0]!.csv).table);
    const col = (name: string) => crm.columns.find((c) => c.name === name)!;
    expect(crm.rows).toBeGreaterThan(1500);
    expect(col('email').type).toBe('email');
    expect(col('email').invalid).toBeGreaterThan(20);
    expect(col('code_postal').type).toBe('postal');
    expect(crm.issues.some((i) => i.id === `zero-${col('code_postal').index}`)).toBe(true);
    expect(col('date_inscription').dates!.formats.length).toBe(2);
    expect(col('segment').variants!.length).toBeGreaterThan(0);
    expect(col('ca_12_mois').outliers).toBeGreaterThan(3);
    expect(crm.exactDuplicates.length).toBe(20);
    expect(crm.nearDuplicates.length).toBeGreaterThanOrEqual(25);
    expect(crm.score).toBeLessThan(90);

    const cap = profileTable(read(ex[1]!.csv).table);
    expect(cap.columns.find((c) => c.name === 'temperature_c')!.outliers).toBeGreaterThan(5);
    expect(cap.exactDuplicates.length).toBeGreaterThan(3);

    const v = profileTable(read(ex[2]!.csv).table);
    expect(v.exactDuplicates.length).toBeGreaterThanOrEqual(40);
    expect(v.columns.find((c) => c.name === 'prix_unitaire')!.type).toBe('decimal');
  });

  it('le nettoyage améliore le score de chaque exemple', () => {
    for (const e of ex) {
      const { table } = read(e.csv);
      const p = profileTable(table);
      const c = cleanTable(table, p, DEFAULT_CLEAN);
      expect(profileTable(c.table).score).toBeGreaterThan(p.score);
    }
  });

  it('profile 20 000 lignes en moins d’une seconde et demie', () => {
    const { table } = read(ex[0]!.csv);
    const big: Table = { ...table, rows: Array.from({ length: 20_000 }, (_, i) => table.rows[i % table.rows.length]!) };
    const t0 = performance.now();
    profileTable(big);
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});
