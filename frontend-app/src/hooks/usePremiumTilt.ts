/**
 * usePremiumTilt — opt-in React hook that adds smooth 3D tilt to any
 * element when the mouse moves over it. Pure CSS transform; no library.
 *
 * Usage:
 *   const tiltRef = usePremiumTilt({ maxDeg: 6, scale: 1.02 });
 *   return <div ref={tiltRef} className="surface-card-premium">...</div>;
 *
 * Performance:
 *   • Listeners attached only on pointerenter, removed on pointerleave.
 *   • Single requestAnimationFrame loop while hovering.
 *   • No-op on touch devices and prefers-reduced-motion.
 */

import { useEffect, useRef } from 'react';

type Options = {
  maxDeg?: number;
  scale?: number;
  perspective?: number;
  glare?: boolean;
};

export function usePremiumTilt<T extends HTMLElement = HTMLDivElement>(
  options: Options = {},
) {
  const ref = useRef<T | null>(null);
  const {
    maxDeg = 5,
    scale = 1.02,
    perspective = 1100,
    glare = true,
  } = options;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (typeof window === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    if (window.matchMedia?.('(hover: none)').matches) return;

    let rafId: number | null = null;
    let target = { rx: 0, ry: 0, gx: 50, gy: 50 };
    let current = { rx: 0, ry: 0, gx: 50, gy: 50 };
    let hovering = false;

    // Apply baseline styles
    const previousTransformStyle = el.style.transformStyle;
    const previousTransition = el.style.transition;
    const previousWillChange = el.style.willChange;
    el.style.transformStyle = 'preserve-3d';
    el.style.willChange = 'transform';

    // Optional glare overlay
    let glareEl: HTMLDivElement | null = null;
    if (glare) {
      glareEl = document.createElement('div');
      glareEl.setAttribute('aria-hidden', 'true');
      glareEl.style.cssText = `
        position: absolute;
        inset: 0;
        border-radius: inherit;
        pointer-events: none;
        background: radial-gradient(circle at 50% 50%, rgba(255,241,184,0.18), transparent 50%);
        opacity: 0;
        transition: opacity 0.25s ease;
        mix-blend-mode: overlay;
        z-index: 3;
      `;
      el.appendChild(glareEl);
    }

    function tick() {
      // Lerp toward target
      current.rx += (target.rx - current.rx) * 0.16;
      current.ry += (target.ry - current.ry) * 0.16;
      current.gx += (target.gx - current.gx) * 0.16;
      current.gy += (target.gy - current.gy) * 0.16;

      if (!el) return;

      const transform = hovering
        ? `perspective(${perspective}px) rotateX(${current.rx}deg) rotateY(${current.ry}deg) scale(${scale})`
        : `perspective(${perspective}px) rotateX(${current.rx}deg) rotateY(${current.ry}deg) scale(1)`;
      el.style.transform = transform;

      if (glareEl) {
        glareEl.style.background = `radial-gradient(circle at ${current.gx}% ${current.gy}%, rgba(255,241,184,0.22), transparent 55%)`;
      }

      const settled =
        !hovering &&
        Math.abs(current.rx) < 0.05 &&
        Math.abs(current.ry) < 0.05;

      if (settled) {
        rafId = null;
        if (!el) return;
        el.style.transform = '';
      } else {
        rafId = requestAnimationFrame(tick);
      }
    }

    function onMove(ev: PointerEvent) {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const px = (ev.clientX - rect.left) / rect.width;  // 0..1
      const py = (ev.clientY - rect.top) / rect.height;  // 0..1
      target.ry = (px - 0.5) * 2 * maxDeg;
      target.rx = -(py - 0.5) * 2 * maxDeg;
      target.gx = px * 100;
      target.gy = py * 100;

      if (rafId === null) rafId = requestAnimationFrame(tick);
    }

    function onEnter() {
      hovering = true;
      if (glareEl) glareEl.style.opacity = '1';
      if (rafId === null) rafId = requestAnimationFrame(tick);
    }

    function onLeave() {
      hovering = false;
      target.rx = 0;
      target.ry = 0;
      target.gx = 50;
      target.gy = 50;
      if (glareEl) glareEl.style.opacity = '0';
      if (rafId === null) rafId = requestAnimationFrame(tick);
    }

    el.addEventListener('pointerenter', onEnter);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);

    return () => {
      el.removeEventListener('pointerenter', onEnter);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      if (rafId !== null) cancelAnimationFrame(rafId);
      el.style.transformStyle = previousTransformStyle;
      el.style.transition = previousTransition;
      el.style.willChange = previousWillChange;
      el.style.transform = '';
      if (glareEl) el.removeChild(glareEl);
    };
  }, [maxDeg, scale, perspective, glare]);

  return ref;
}
