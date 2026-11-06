import { useEffect, useRef, useState } from 'react';

/** Largeur affichée d'un élément (ResizeObserver) : les graphiques sont dessinés en pixels réels. */
export function useWidth<T extends HTMLElement>(fallback = 600): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(Math.max(240, Math.round(el.getBoundingClientRect().width)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** Chargement JSON tolérant : `undefined` si le fichier est absent (404, ou page HTML renvoyée à la place). */
export async function loadJson(url: string, signal?: AbortSignal): Promise<unknown | undefined> {
  const res = await fetch(url, { signal, cache: 'no-cache' });
  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`réponse HTTP ${res.status}`);
  if (!(res.headers.get('content-type') ?? '').includes('json')) return undefined;
  return res.json();
}
