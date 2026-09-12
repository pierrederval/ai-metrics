'use client';

import { useRef, type ReactNode } from 'react';

/**
 * The page's only client JavaScript: a pointer tilt on the hero card.
 *
 * It bails entirely under `prefers-reduced-motion`, and it does nothing on a
 * touch device because `pointermove` from a finger would fight the scroll.
 *
 * If this ever starts to grow — easing, spring physics, a second surface —
 * drop the tilt rather than grow it. A landing page that needs a motion
 * library to introduce a static grade card has lost the plot.
 */
export function CardTilt({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  const reset = () => {
    const node = ref.current;
    if (node) node.style.transform = '';
  };

  return (
    <div
      ref={ref}
      className="mk-tilt"
      onPointerMove={(event) => {
        if (event.pointerType !== 'mouse') return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const node = ref.current;
        if (!node) return;
        const box = node.getBoundingClientRect();
        const x = (event.clientX - box.left) / box.width - 0.5;
        const y = (event.clientY - box.top) / box.height - 0.5;
        node.style.transform = `perspective(900px) rotateY(${x * 9}deg) rotateX(${-y * 9}deg)`;
      }}
      onPointerLeave={reset}
      onBlur={reset}
    >
      {children}
    </div>
  );
}
