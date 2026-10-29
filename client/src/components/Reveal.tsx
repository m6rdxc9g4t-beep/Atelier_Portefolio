import { createElement, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/** Apparition en fondu au défilement (respecte prefers-reduced-motion via le CSS global). */
export function Reveal({
  children,
  as = 'div',
  delay = 0,
  className = '',
  style,
  id,
}: {
  children: ReactNode;
  as?: keyof HTMLElementTagNameMap;
  delay?: number;
  className?: string;
  style?: CSSProperties;
  id?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!('IntersectionObserver' in window)) {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return createElement(
    as,
    {
      ref,
      id,
      className: `reveal ${visible ? 'in' : ''} ${className}`.trim(),
      style: { transitionDelay: `${delay}ms`, ...style },
    },
    children,
  );
}

/** Déclenche un callback une seule fois quand l'élément devient visible. */
export function useInView<T extends HTMLElement>(threshold = 0.3) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && (setInView(true), io.disconnect()), { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [inView, threshold]);
  return { ref, inView };
}
