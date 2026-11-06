import { useEffect, useState } from 'react';
import { PRESETS, ewmaArl, falseAlarmEvery, type MonitorId, type PresetId } from './model';

export interface PresetStats {
  /** Minutes simulées entre deux fausses alertes, tous indicateurs confondus. */
  falseEvery: number;
  perMonitor: Record<MonitorId, number>;
  /** ARL (minutes) pour une baisse persistante de δ écarts-types : δ = 0,5, 1, 2. */
  delay: Record<0.5 | 1 | 2, number>;
}

let cache: Record<PresetId, PresetStats> | null = null;

/** Délais moyens (ARL) des trois réglages, par chaîne de Markov ; calculés une fois, après le premier affichage. */
export function computePresetStats(): Record<PresetId, PresetStats> {
  if (cache) return cache;
  const out = {} as Record<PresetId, PresetStats>;
  for (const id of Object.keys(PRESETS) as PresetId[]) {
    const { lambda, L } = PRESETS[id];
    const fa = falseAlarmEvery(L, lambda);
    out[id] = {
      falseEvery: fa.overall,
      perMonitor: fa.perMonitor,
      delay: { 0.5: ewmaArl(lambda, L, -0.5, 12), 1: ewmaArl(lambda, L, -1, 12), 2: ewmaArl(lambda, L, -2, 12) },
    };
  }
  cache = out;
  return out;
}

export function usePresetStats() {
  const [stats, setStats] = useState(cache);
  useEffect(() => {
    if (stats) return;
    const id = window.setTimeout(() => setStats(computePresetStats()), 60);
    return () => window.clearTimeout(id);
  }, [stats]);
  return stats;
}
