import { useLayoutEffect, useRef, useState } from "react";
import {
  CHANNELS,
  MODELS,
  type ModelId,
  type ModelResult,
  type PathStat,
} from "./model";
import { eur, eurSigned, n0, pct } from "./format";

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}
const modelLabel = (id: ModelId) => MODELS.find((m) => m.id === id)!.short;

/** Largeur réelle du conteneur : les SVG sont dessinés à l'échelle 1 (texte net, jamais agrandi), au moins `min` px. */
function useWidth(min: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(720);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(Math.round(el.clientWidth) || 720);
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width;
      if (cw) setW(Math.round(cw));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, Math.max(min, w)] as const;
}

/**
 * Barres groupées : part du mérite donnée à chaque canal par les modèles comparés,
 * et un trait vertical pour la part réellement causée (vérité de la simulation).
 */
export function AttributionBars({
  results,
  truth,
}: {
  results: ModelResult[];
  truth: number[];
}) {
  const [ref, W] = useWidth(540);
  const L = 140;
  const R = 92;
  const T = 26;
  const barH = 9;
  const gap = 2;
  const groupPad = 14;
  const groupH = results.length * (barH + gap) - gap;
  const rowH = groupH + groupPad;
  const H = T + CHANNELS.length * rowH + 8;
  const max = niceMax(Math.max(...truth, ...results.flatMap((r) => r.share)));
  const iw = W - L - R;
  const x = (v: number) => L + (v / max) * iw;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((k) => k * max);
  return (
    <div ref={ref} className="atb-chart-scroll">
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="atb-svg"
        role="img"
        aria-label="Part du mérite attribuée à chaque canal par les modèles comparés, et part réellement causée"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={x(t)}
              x2={x(t)}
              y1={T - 6}
              y2={H - 8}
              className="atb-grid"
            />
            <text x={x(t)} y={T - 12} textAnchor="middle" className="atb-axis">
              {pct(t).replace(",0", "")}
            </text>
          </g>
        ))}
        {CHANNELS.map((ch, c) => {
          const y0 = T + c * rowH;
          const tx = x(truth[c]!);
          const labelX =
            Math.max(tx, ...results.map((r) => x(r.share[c]!))) + 8;
          return (
            <g key={ch}>
              <text
                x={L - 10}
                y={y0 + groupH / 2 + 4}
                textAnchor="end"
                className="atb-label"
              >
                {ch}
              </text>
              {results.map((r, k) => {
                const v = r.share[c]!;
                return (
                  <rect
                    key={r.id}
                    x={L}
                    y={y0 + k * (barH + gap)}
                    width={Math.max(1, x(v) - L)}
                    height={barH}
                    rx={2}
                    className={`atb-bar atb-s${k + 1}`}
                  >
                    <title>{`${ch} · ${modelLabel(r.id)} : ${pct(v)} des conversions (vrai : ${pct(truth[c]!)})`}</title>
                  </rect>
                );
              })}
              <line
                x1={tx}
                x2={tx}
                y1={y0 - 3}
                y2={y0 + groupH + 3}
                className="atb-truth"
              />
              <text
                x={labelX}
                y={y0 + groupH / 2 + 4}
                className="atb-truth-label"
              >
                {truth[c]! === 0 ? "réel : 0" : `réel ${pct(truth[c]!)}`}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Écart de chaque modèle à la vérité (en points), trié du plus fidèle au plus trompeur. */
export function ErrorRanking({
  results,
  selected,
  onSelect,
}: {
  results: ModelResult[];
  selected: ModelId;
  onSelect: (id: ModelId) => void;
}) {
  const sorted = [...results].sort((a, b) => a.error - b.error);
  const max = niceMax(Math.max(...results.map((r) => r.error), 1));
  return (
    <ol className="atb-rank">
      {sorted.map((r, i) => {
        const m = MODELS.find((mm) => mm.id === r.id)!;
        return (
          <li key={r.id}>
            <button
              type="button"
              className="atb-rank-row"
              aria-pressed={r.id === selected}
              onClick={() => onSelect(r.id)}
            >
              <span className="atb-rank-pos">{i + 1}</span>
              <span className="atb-rank-name">
                {m.label}
                <span className="atb-rank-family">
                  {m.family === "Données"
                    ? "piloté par les données"
                    : "règle fixe"}
                </span>
              </span>
              <span className="atb-rank-track" aria-hidden="true">
                <span
                  className="atb-rank-fill"
                  style={{ width: `${(100 * r.error) / max}%` }}
                />
              </span>
              <span className="atb-rank-val">
                {r.error.toLocaleString("fr-FR", {
                  maximumFractionDigits: 1,
                  minimumFractionDigits: 1,
                })}{" "}
                pts
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** Barres divergentes : euros déplacés vers (+) ou depuis (−) chaque canal si l'on suivait le modèle plutôt que la vérité. */
export function ReallocationBars({
  rows,
}: {
  rows: { channel: number; byModel: number; byTruth: number; gap: number }[];
}) {
  const [ref, W0] = useWidth(540);
  const W = Math.min(W0, 900);
  const L = 140;
  const R = 16;
  const rowH = 30;
  const T = 8;
  const H = T + rows.length * rowH + 8;
  const max = niceMax(Math.max(...rows.map((r) => Math.abs(r.gap)), 1));
  const mid = L + (W - L - R) / 2;
  const half = (W - L - R) / 2 - 70;
  return (
    <div ref={ref} className="atb-chart-scroll">
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="atb-svg"
        role="img"
        aria-label="Budget déplacé vers chaque canal payant si l'on suivait le modèle, par rapport à la vérité"
      >
        <line
          x1={mid}
          x2={mid}
          y1={T - 4}
          y2={H - 4}
          className="atb-axisline"
        />
        {rows.map((r, i) => {
          const y = T + i * rowH;
          const w = (Math.abs(r.gap) / max) * half;
          const pos = r.gap >= 0;
          const bx = pos ? mid : mid - w;
          return (
            <g key={r.channel}>
              <text
                x={L - 10}
                y={y + 18}
                textAnchor="end"
                className="atb-label"
              >
                {CHANNELS[r.channel]}
              </text>
              <rect
                x={bx}
                y={y + 7}
                width={Math.max(1, w)}
                height={rowH - 14}
                rx={2}
                className={pos ? "atb-over" : "atb-under"}
              >
                <title>{`${CHANNELS[r.channel]} : ${eur(r.byModel)} selon le modèle, ${eur(r.byTruth)} selon l'effet réel`}</title>
              </rect>
              <text
                x={pos ? bx + w + 6 : bx - 6}
                y={y + 18}
                textAnchor={pos ? "start" : "end"}
                className="atb-val"
              >
                {eurSigned(r.gap)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Chemins les plus fréquents : enchaînement des canaux, volume et taux de conversion. */
export function PathList({ paths }: { paths: PathStat[] }) {
  const maxRate = Math.max(...paths.map((p) => p.rate), 0.01);
  return (
    <ol className="atb-paths">
      {paths.map((p) => (
        <li key={p.path.join(">")}>
          <span className="atb-path">
            {p.path.map((c, i) => (
              <span key={i} className="atb-step">
                {i > 0 && (
                  <span className="atb-arrow" aria-label="puis">
                    →
                  </span>
                )}
                <span className="atb-chip">{CHANNELS[c]}</span>
              </span>
            ))}
          </span>
          <span className="atb-path-n">{n0(p.count)} parcours</span>
          <span className="atb-path-rate">
            <span className="atb-path-track" aria-hidden="true">
              <span
                className="atb-path-fill"
                style={{ width: `${(100 * p.rate) / maxRate}%` }}
              />
            </span>
            {pct(p.rate)}
          </span>
        </li>
      ))}
    </ol>
  );
}
