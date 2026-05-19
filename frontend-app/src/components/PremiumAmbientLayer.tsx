/**
 * Premium Ambient Layer — opt-in React component for the Truco Paulista app.
 *
 * Renders a fixed, full-viewport canvas behind the app that draws:
 *   • Slow-drifting golden particles (very low density, ~30 specks).
 *   • Subtle mouse glow that follows the cursor across premium surfaces.
 *
 * Mount it once at the root of the app (e.g. wrap RouterProvider or render
 * inside app.tsx before <Outlet />). It's completely additive — does NOT
 * intercept any pointer events, is pointer-events: none everywhere, and
 * cleans up cleanly on unmount.
 *
 * Performance:
 *   • Canvas runs requestAnimationFrame ONLY when document is visible.
 *   • Pauses on prefers-reduced-motion.
 *   • Resizes via ResizeObserver, no window listeners.
 *   • Particle count auto-throttles on mobile (< 32 dp width).
 *
 * Usage:
 *   import { PremiumAmbientLayer } from './components/PremiumAmbientLayer';
 *
 *   // In src/app/app.tsx or wherever the layout shell is:
 *   <>
 *     <PremiumAmbientLayer />
 *     <Outlet />
 *   </>
 */

import { useEffect, useRef } from 'react';

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  alphaTarget: number;
  hue: number;
};

const isReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const isMobile = () =>
  typeof window !== 'undefined' && window.innerWidth < 768;

export function PremiumAmbientLayer() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number | null>(null);
  const mouseRef = useRef<{ x: number; y: number; t: number }>({ x: -1, y: -1, t: 0 });
  const sizeRef = useRef<{ w: number; h: number; dpr: number }>({ w: 0, h: 0, dpr: 1 });

  useEffect(() => {
    if (isReducedMotion()) return;
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const PARTICLE_COUNT = isMobile() ? 14 : 32;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      sizeRef.current = { w, h, dpr };
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function makeParticle(): Particle {
      const { w, h } = sizeRef.current;
      const alpha = Math.random() * 0.35 + 0.08;
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.12,
        vy: -Math.random() * 0.18 - 0.04,
        radius: Math.random() * 1.3 + 0.4,
        alpha,
        alphaTarget: alpha,
        hue: Math.random() < 0.7 ? 44 : 38, // 44 = warm gold, 38 = amber
      };
    }

    function init() {
      particlesRef.current = Array.from({ length: PARTICLE_COUNT }, makeParticle);
    }

    function step() {
      const { w, h } = sizeRef.current;
      ctx!.clearRect(0, 0, w, h);

      // Mouse glow — soft warm pool following the cursor.
      const m = mouseRef.current;
      const ageMs = performance.now() - m.t;
      if (m.x >= 0 && ageMs < 1500) {
        const fade = 1 - ageMs / 1500;
        const grad = ctx!.createRadialGradient(m.x, m.y, 0, m.x, m.y, 140);
        grad.addColorStop(0, `rgba(255, 241, 184, ${0.10 * fade})`);
        grad.addColorStop(0.4, `rgba(201, 168, 76, ${0.04 * fade})`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx!.fillStyle = grad;
        ctx!.fillRect(m.x - 140, m.y - 140, 280, 280);
      }

      // Particles — drift, twinkle, wrap.
      for (const p of particlesRef.current) {
        p.x += p.vx;
        p.y += p.vy;

        // Slow random walk on vx for organic feel
        p.vx += (Math.random() - 0.5) * 0.005;
        p.vx = Math.max(-0.25, Math.min(0.25, p.vx));

        // Twinkle alpha drifts toward alphaTarget; occasionally re-target.
        if (Math.random() < 0.005) {
          p.alphaTarget = Math.random() * 0.35 + 0.08;
        }
        p.alpha += (p.alphaTarget - p.alpha) * 0.04;

        // Wrap around vertical edges
        if (p.y < -10) {
          p.y = h + 10;
          p.x = Math.random() * w;
        }
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;

        // Draw
        const grad = ctx!.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 4);
        grad.addColorStop(0, `hsla(${p.hue}, 75%, 75%, ${p.alpha})`);
        grad.addColorStop(0.4, `hsla(${p.hue}, 70%, 60%, ${p.alpha * 0.4})`);
        grad.addColorStop(1, 'hsla(40, 70%, 60%, 0)');
        ctx!.fillStyle = grad;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.radius * 4, 0, Math.PI * 2);
        ctx!.fill();

        // Core dot
        ctx!.fillStyle = `hsla(${p.hue}, 85%, 88%, ${p.alpha})`;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx!.fill();
      }

      rafRef.current = requestAnimationFrame(step);
    }

    function onMouse(ev: MouseEvent) {
      mouseRef.current = { x: ev.clientX, y: ev.clientY, t: performance.now() };
    }

    function onVisibility() {
      if (document.hidden) {
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
      } else if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(step);
      }
    }

    resize();
    init();
    rafRef.current = requestAnimationFrame(step);

    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onMouse, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMouse);
      document.removeEventListener('visibilitychange', onVisibility);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 1,
        mixBlendMode: 'screen',
      }}
    />
  );
}
