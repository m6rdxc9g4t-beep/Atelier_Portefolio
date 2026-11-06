import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../../components/Icon';

/* ───────────── Champs ───────────── */

/** Champ numérique libre (virgule ou point), avec suffixe, aide et message d'erreur relié au champ. */
export function NumField({
  label,
  value,
  onChange,
  suffix,
  hint,
  error,
  inputMode = 'decimal',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  hint?: ReactNode;
  error?: string | null;
  inputMode?: 'decimal' | 'numeric';
}) {
  const id = useId();
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className="lab-field">
      <label htmlFor={id}>{label}</label>
      <div className="lab-input">
        <input
          id={id}
          type="text"
          inputMode={inputMode}
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy}
        />
        {suffix && <span className="lab-suffix" aria-hidden="true">{suffix}</span>}
      </div>
      {error ? (
        <p id={`${id}-err`} className="lab-field-err">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="lab-field-hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Contrôle segmenté (boutons à `aria-pressed`) avec libellé visible. */
export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  hideLabel = false,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  hideLabel?: boolean;
}) {
  const id = useId();
  return (
    <div className="lab-field">
      <span id={id} className={hideLabel ? 'lab-sr' : 'lab-label'}>
        {label}
      </span>
      <div className="lab-seg" role="group" aria-labelledby={id}>
        {options.map((o) => (
          <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Curseur avec valeur affichée. */
export function RangeField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  format,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  hint?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="lab-field">
      <div className="lab-range-head">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{format(value)}</output>
      </div>
      <input
        id={id}
        type="range"
        className="lab-range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={format(value)}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ['--lab-fill' as string]: `${((value - min) / (max - min)) * 100}%` }}
      />
      {hint && <p className="lab-field-hint">{hint}</p>}
    </div>
  );
}

/** Encadré d'erreur de saisie (aucun résultat calculé sur des valeurs impossibles). */
export function InputError({ children }: { children: ReactNode }) {
  return (
    <div className="lab-alert" role="alert">
      <Icon name="circle-alert" size={16} />
      <div>{children}</div>
    </div>
  );
}

/** Lecture chiffrée : libellé, valeur, précision. */
export function Readout({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="lab-readout">
      <span className="lab-readout-k">{label}</span>
      <span className="lab-readout-v">{value}</span>
      {sub && <span className="lab-readout-s">{sub}</span>}
    </div>
  );
}

/* ───────────── Graphiques ───────────── */

/** Largeur d'un conteneur, suivie par ResizeObserver (graphiques dessinés au pixel près). */
export function useWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth((prev) => (Math.abs(w - prev) > 0.5 ? Math.round(w) : prev));
    });
    ro.observe(el);
    setWidth(Math.round(el.getBoundingClientRect().width) || fallback);
    return () => ro.disconnect();
  }, [fallback]);
  return [ref, width] as const;
}

export interface Lin {
  (v: number): number;
  invert: (p: number) => number;
}

export function lin(d0: number, d1: number, r0: number, r1: number): Lin {
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  const f = ((v: number) => r0 + (v - d0) * k) as Lin;
  f.invert = (p: number) => (k === 0 ? d0 : d0 + (p - r0) / k);
  return f;
}

/** Graduations « rondes » (1, 2, 5 × 10ⁿ). */
export function ticks(min: number, max: number, count = 5): number[] {
  if (!(max > min)) return [min];
  const step0 = (max - min) / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(step0));
  const norm = step0 / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}

/** Info-bulle HTML positionnée dans le cadre du graphique. */
export function Tip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const right = x > width * 0.62;
  return (
    <div
      className="lab-tip"
      style={{ left: right ? undefined : x + 12, right: right ? width - x + 12 : undefined, top: Math.max(0, y - 12) }}
      role="presentation"
    >
      {children}
    </div>
  );
}

/** Légende (au moins deux séries) : pastille ou trait + libellé, texte en encre neutre. */
export function Legend({ items }: { items: { label: string; className: string; dashed?: boolean }[] }) {
  return (
    <ul className="lab-legend">
      {items.map((it) => (
        <li key={it.label}>
          <svg width="18" height="10" aria-hidden="true">
            <line x1="1" x2="17" y1="5" y2="5" className={it.className} strokeDasharray={it.dashed ? '4 3' : undefined} />
          </svg>
          {it.label}
        </li>
      ))}
    </ul>
  );
}
