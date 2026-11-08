import { describe, expect, it } from 'vitest';
import {
  ALL_NODES,
  buildEdges,
  compileSql,
  downstream,
  extractDeps,
  lineageLeaves,
  lineageModels,
  markStale,
  MODELS,
  testSql,
  topoSort,
  traceLineage,
  upstream,
  type ModelDef,
  type NodeState,
} from '../../client/src/demos/pipeline-donnees/model';
import { buildRawSources, caLivreReference } from '../../client/src/demos/pipeline-donnees/sources';
import { generateComptoir } from '../../client/src/demos/sql-lab/data';

describe('Pipeline de données — dépendances', () => {
  it('extrait ref() et source(), sans doublon, quelle que soit la mise en forme', () => {
    const sql = `SELECT * FROM {{ ref('a') }} JOIN {{ref("b")}} ON 1 JOIN {{  ref( 'a' )  }} ON 1
      JOIN {{ source('erp', 'raw_x') }} ON 1 JOIN {{source("crm","raw_y")}} ON 1`;
    expect(extractDeps(sql)).toEqual({ refs: ['a', 'b'], sources: ['raw_x', 'raw_y'] });
    expect(extractDeps('SELECT 1')).toEqual({ refs: [], sources: [] });
  });

  it('compile les références en noms de tables', () => {
    expect(compileSql("SELECT * FROM {{ ref('stg_a') }} JOIN {{ source('erp', 'raw_b') }} USING (id)")).toBe('SELECT * FROM stg_a JOIN raw_b USING (id)');
  });

  it('le projet forme un DAG dont l’ordre respecte chaque dépendance', () => {
    const edges = buildEdges(MODELS);
    const res = topoSort(ALL_NODES, edges);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.order).toHaveLength(ALL_NODES.length);
    for (const e of edges) expect(res.order.indexOf(e.from)).toBeLessThan(res.order.indexOf(e.to));
    expect(res.order.slice(0, 4)).toEqual(['raw_commandes', 'raw_lignes', 'raw_produits', 'raw_clients']);
  });

  it('détecte un cycle et nomme les modèles concernés', () => {
    const cyclic: ModelDef[] = MODELS.map((m) =>
      m.name === 'stg_commandes' ? { ...m, sql: `${m.sql}\nJOIN {{ ref('fct_ventes') }} f ON 1` } : m,
    );
    const res = topoSort(ALL_NODES, buildEdges(cyclic));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.cycle).toEqual(expect.arrayContaining(['stg_commandes', 'int_lignes_enrichies', 'fct_ventes']));
    expect(res.cycle).not.toContain('stg_produits');
  });

  it('calcule l’aval et l’amont', () => {
    const edges = buildEdges(MODELS);
    expect(new Set(downstream('stg_commandes', edges))).toEqual(new Set(['int_lignes_enrichies', 'fct_ventes', 'dim_clients', 'mart_ca_mensuel']));
    expect(downstream('mart_ca_mensuel', edges)).toEqual([]);
    expect(new Set(upstream('dim_clients', edges))).toEqual(
      new Set(['stg_clients', 'raw_clients', 'fct_ventes', 'int_lignes_enrichies', 'stg_lignes', 'stg_commandes', 'stg_produits', 'raw_lignes', 'raw_commandes', 'raw_produits']),
    );
  });

  it('une modification marque le modèle et tout son aval « à reconstruire », rien d’autre', () => {
    const edges = buildEdges(MODELS);
    const states = Object.fromEntries(ALL_NODES.map((n) => [n, 'ok' as NodeState]));
    const next = markStale(states, 'stg_clients', edges);
    expect(Object.entries(next).filter(([, s]) => s === 'stale').map(([n]) => n).sort()).toEqual(['dim_clients', 'stg_clients']);
    expect(states.stg_clients).toBe('ok'); // pas de mutation
  });
});

describe('Pipeline de données — requêtes de test', () => {
  it('unique', () => {
    expect(testSql({ kind: 'unique', column: 'id' }, 't')).toBe('SELECT id, COUNT(*) AS occurrences\nFROM t\nWHERE id IS NOT NULL\nGROUP BY id\nHAVING COUNT(*) > 1');
  });
  it('not_null', () => {
    expect(testSql({ kind: 'not_null', column: 'd' }, 't')).toBe('SELECT *\nFROM t\nWHERE d IS NULL');
  });
  it('accepted_values, apostrophes échappées', () => {
    expect(testSql({ kind: 'accepted_values', column: 'c', values: ['a', "l'b"] }, 't')).toBe(
      "SELECT c, COUNT(*) AS occurrences\nFROM t\nWHERE c NOT IN ('a', 'l''b')\nGROUP BY c",
    );
  });
  it('relationships', () => {
    expect(testSql({ kind: 'relationships', column: 'client_id', to: 'dim', field: 'id' }, 'f')).toBe(
      'SELECT enfant.client_id\nFROM f AS enfant\nLEFT JOIN dim AS parent ON parent.id = enfant.client_id\nWHERE enfant.client_id IS NOT NULL\n  AND parent.id IS NULL',
    );
  });
  it('expression et test personnalisé', () => {
    expect(testSql({ kind: 'expression', label: 'x', expression: 'q > 0' }, 't')).toBe('SELECT *\nFROM t\nWHERE NOT (q > 0)');
    expect(testSql({ kind: 'custom', label: 'x', sql: "SELECT 1 FROM {{ ref('m') }}" }, 't')).toBe('SELECT 1 FROM m');
  });
});

describe('Pipeline de données — lignage', () => {
  it('le CA mensuel remonte aux trois colonnes brutes des lignes', () => {
    const tree = traceLineage('mart_ca_mensuel', 'ca', MODELS);
    expect(lineageLeaves(tree).sort()).toEqual(['raw_lignes.prix_paye', 'raw_lignes.quantite', 'raw_lignes.remise']);
    expect(lineageModels(tree)).toEqual(expect.arrayContaining(['mart_ca_mensuel', 'fct_ventes', 'int_lignes_enrichies', 'stg_lignes', 'raw_lignes']));
    expect(lineageModels(tree)).not.toContain('stg_clients');
  });

  it('chaque colonne déclarée pointe vers une colonne déclarée en amont ou une source', () => {
    const sources = new Set(['raw_commandes', 'raw_lignes', 'raw_produits', 'raw_clients']);
    for (const m of MODELS) {
      const deps = new Set([...extractDeps(m.sql).refs, ...extractDeps(m.sql).sources]);
      for (const parents of Object.values(m.lineage)) {
        for (const p of parents) {
          const [pm, pc] = p.split('.') as [string, string];
          expect(deps.has(pm), `${m.name} → ${p}`).toBe(true);
          if (!sources.has(pm)) expect(MODELS.find((x) => x.name === pm)!.lineage[pc], p).toBeDefined();
        }
      }
    }
  });
});

describe('Pipeline de données — sources « sales »', () => {
  const data = generateComptoir();
  const raw = buildRawSources(data);

  it('injecte les défauts annoncés', () => {
    expect(raw.doublons).toBeGreaterThan(50);
    expect(raw.raw_commandes).toHaveLength(data.commandes.length + raw.doublons);
    const dates = raw.raw_commandes.map((r) => r[2]);
    expect(dates.some((d) => /^\d{2}\/\d{2}\/\d{4}$/.test(d))).toBe(true);
    expect(dates.some((d) => /T\d{2}:\d{2}/.test(d))).toBe(true);
    expect(raw.raw_lignes.some((r) => /^\d+,\d{2}$/.test(r[4]))).toBe(true);
    expect(new Set(raw.raw_commandes.map((r) => r[3])).size).toBeGreaterThan(3);
    expect(raw.raw_clients.some((r) => r[3] !== r[3].trim() || r[3] === r[3].toUpperCase())).toBe(true);
  });

  it('est déterministe', () => {
    expect(buildRawSources(data).raw_commandes.slice(0, 50)).toEqual(raw.raw_commandes.slice(0, 50));
  });

  it('le total comptable de référence est celui des autres démos sur la même base', () => {
    expect(raw.caReference).toBe(caLivreReference(data));
    expect(raw.caReference).toBeCloseTo(520437, 0);
  });
});
