import { useEffect, useRef, useState } from 'react';

/** Largura real do elemento, para desenhar gráficos SVG em pixels (texto não encolhe). */
export function useElementWidth<T extends HTMLElement>(initial = 600) {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth || initial);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth((prev) => (Math.abs(w - prev) > 1 ? w : prev));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [initial]);
  return { ref, width };
}
