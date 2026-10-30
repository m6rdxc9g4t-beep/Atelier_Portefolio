import { useMemo, useRef, useState } from 'react';
import { fmt, gridWeights, moranExpected, moranI, mulberry32, spatialLag } from '@atelier/shared';
import { LineChart } from '../../components/charts';
import { api } from '../../api';
import './moran-lab.css';

const R = 10;
const C = 10;

type Pattern = 'centre' | 'poles' | 'aleatoire' | 'damier';

function make(pattern: Pattern, seed = 3): number[] {
  const rand = mulberry32(seed);
  return Array.from({ length: R * C }, (_, i) => {
    const r = Math.floor(i / C);
    const c = i % C;
    switch (pattern) {
      case 'centre': {
        const d = Math.hypot(r - 4.5, c - 4.5);
        return Math.max(0, 1 - d / 7) + (rand() - 0.5) * 0.15;
      }
      case 'poles': {
        const d1 = Math.hypot(r - 2, c - 2);
        const d2 = Math.hypot(r - 7, c - 7.5);
        return Math.max(0, 1 - Math.min(d1, d2) / 4.5) + (rand() - 0.5) * 0.15;
      }
      case 'damier':
        return (r + c) % 2;
      default:
        return rand();
    }
  });
}

const PATTERNS: [Pattern, string][] = [
  ['centre', 'Centre-ville cher'],
  ['poles', 'Deux pôles'],
  ['aleatoire', 'Prix aléatoires'],
  ['damier', 'Damier'],
];

/** Laboratoire de l'I de Moran : chaque case est un quartier, sa couleur son prix au m². */
export function MoranLab() {
  const [values, setValues] = useState(() => make('centre'));
  const [pattern, setPattern] = useState<Pattern | 'perso'>('centre');
  const [contiguity, setContiguity] = useState<'rook' | 'queen'>('queen');
  const [brush, setBrush] = useState<1 | 0>(1);
  const [test, setTest] = useState<string | null>(null);
  const painting = useRef(false);

  const W = useMemo(() => gridWeights(R, C, contiguity), [contiguity]);
  const I = useMemo(() => moranI(values, W), [values, W]);
  const lag = useMemo(() => spatialLag(values, W), [values, W]);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length) || 1;
  const z = values.map((v) => (v - mean) / sd);
  const lagMean = lag.reduce((a, b) => a + b, 0) / lag.length;
  const wz = lag.map((v) => (v - lagMean) / sd);

  const paint = (i: number) => {
    setPattern('perso');
    setTest(null);
    setValues((v) => v.map((x, j) => (j === i ? brush : x)));
  };

  const runTest = async () => {
    setTest('Test en cours…');
    try {
      const r = await api<{ I: number; pValue: number; expected: number }>('/models/moran', {
        method: 'POST',
        json: { rows: R, cols: C, values, contiguity, permutations: 499 },
      });
      setTest(`I = ${fmt(r.I, 3)} · E[I] = ${fmt(r.expected, 3)} · p-value (499 permutations) = ${fmt(r.pValue, 3)} ${r.pValue < 0.05 ? '→ autocorrélation significative' : '→ non significatif'}`);
    } catch {
      setTest('API indisponible.');
    }
  };

  const verdict = I > 0.3 ? 'forte autocorrélation positive : les quartiers chers se touchent' : I > 0.05 ? 'autocorrélation positive modérée' : I < -0.05 ? 'autocorrélation négative : les voisins se ressemblent moins que par hasard' : 'pas de structure spatiale nette';

  return (
    <div className="mlab">
      <div className="mlab-left">
        <div className="mlab-tools">
          {PATTERNS.map(([id, label]) => (
            <button
              key={id}
              className={pattern === id ? 'is-on' : ''}
              onClick={() => {
                setPattern(id);
                setTest(null);
                setValues(make(id, Math.floor(Math.random() * 1000)));
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div
          className="mlab-grid"
          onPointerLeave={() => (painting.current = false)}
          onPointerUp={() => (painting.current = false)}
          role="grid"
          aria-label="Carte des prix : cliquez pour peindre"
        >
          {values.map((v, i) => (
            <button
              key={i}
              className="mlab-cell"
              style={{ ['--v' as string]: Math.max(0, Math.min(1, v)) }}
              aria-label={`Quartier ${i + 1}, prix relatif ${fmt(v, 2)}`}
              onPointerDown={(e) => {
                e.preventDefault();
                painting.current = true;
                paint(i);
              }}
              onPointerEnter={() => painting.current && paint(i)}
            />
          ))}
        </div>
        <div className="mlab-brush">
          Pinceau :
          <button className={brush === 1 ? 'is-on' : ''} onClick={() => setBrush(1)}>
            <i className="hi" /> prix élevé
          </button>
          <button className={brush === 0 ? 'is-on' : ''} onClick={() => setBrush(0)}>
            <i className="lo" /> prix bas
          </button>
          <span className="mlab-sep" />
          Voisinage :
          <button className={contiguity === 'queen' ? 'is-on' : ''} onClick={() => setContiguity('queen')}>
            reine (8)
          </button>
          <button className={contiguity === 'rook' ? 'is-on' : ''} onClick={() => setContiguity('rook')}>
            tour (4)
          </button>
        </div>
      </div>

      <div className="mlab-right">
        <div className="mlab-i">
          <span>I de Moran</span>
          <strong>{fmt(I, 3, 3)}</strong>
          <small>espérance sans structure : {fmt(moranExpected(R * C), 3)}</small>
        </div>
        <div className="mlab-meter" aria-hidden>
          <i style={{ left: `${((Math.max(-1, Math.min(1, I)) + 1) / 2) * 100}%` }} />
          <span>−1</span>
          <span>0</span>
          <span>+1</span>
        </div>
        <p className="mlab-verdict">{verdict}</p>
        <div className="mlab-scatter-t">Diagramme de Moran : valeur standardisée vs moyenne des voisins</div>
        <LineChart
          ariaLabel="Diagramme de Moran"
          series={[{ id: 'fit', points: [[-3, -3 * I], [3, 3 * I]], color: 'var(--ed-brick)', width: 2 }]}
          markers={z.map((zi, i) => ({ x: Math.max(-3, Math.min(3, zi)), y: Math.max(-3, Math.min(3, wz[i])), r: 3, color: 'var(--ed-accent)' }))}
          xDomain={[-3, 3]}
          yDomain={[-3, 3]}
          xTicks={[-2, 0, 2]}
          yTicks={[-2, 0, 2]}
          height={250}
          width={380}
          margin={{ top: 10, right: 10, bottom: 34, left: 36 }}
          xLabel="z (prix)"
          yLabel="Wz (voisins)"
        />
        <button className="mlab-test" onClick={runTest}>
          Tester la significativité (API, permutations)
        </button>
        {test && <p className="mlab-test-res">{test}</p>}
      </div>
    </div>
  );
}
