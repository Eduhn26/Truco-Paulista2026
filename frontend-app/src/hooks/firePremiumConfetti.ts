/**
 * Premium Confetti — gold-and-emerald celebratory burst.
 *
 * This is an imperative singleton: import `firePremiumConfetti()` anywhere
 * and call it to burst confetti from the center of the screen (or a custom
 * origin). No DOM modifications until first call.
 *
 * Designed to feel theatrical, not arcade-y: low particle count, long
 * physics tail, golden-walnut palette matching the rest of the design system.
 *
 * Usage:
 *   import { firePremiumConfetti } from './hooks/firePremiumConfetti';
 *
 *   // On match win:
 *   firePremiumConfetti();
 *
 *   // Custom origin (e.g. center of the won score panel):
 *   firePremiumConfetti({ originX: 0.5, originY: 0.3, scale: 1.4 });
 *
 * Performance:
 *   • Single shared <canvas> created on first call, reused thereafter.
 *   • requestAnimationFrame loop runs only while particles are alive.
 *   • Auto-stops when particles fall offscreen.
 *   • Respects prefers-reduced-motion (becomes a no-op).
 */

type ConfettiParticle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  size: number;
  color: string;
  shape: 'rect' | 'ribbon' | 'star';
  ttl: number;
  age: number;
};

type ConfettiOptions = {
  originX?: number;
  originY?: number;
  scale?: number;
  count?: number;
};

const PALETTE = [
  '#fff1b8',
  '#f2d488',
  '#e8c76a',
  '#c9a84c',
  '#8a6a28',
  '#34d399',
  '#fef3c7',
  '#fde68a',
];

const FALLBACK_CONFETTI_COLOR = '#c9a84c';

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let particles: ConfettiParticle[] = [];
let rafId: number | null = null;
let dpr = 1;

function ensureCanvas() {
  if (canvas) return canvas;

  canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.position = 'fixed';
  canvas.style.inset = '0';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '9999';
  canvas.style.mixBlendMode = 'screen';

  document.body.appendChild(canvas);

  ctx = canvas.getContext('2d');

  resize();
  window.addEventListener('resize', resize);

  return canvas;
}

function resize() {
  if (!canvas || !ctx) return;

  dpr = Math.min(window.devicePixelRatio ?? 1, 2);

  const w = window.innerWidth;
  const h = window.innerHeight;

  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function pickShape(): ConfettiParticle['shape'] {
  const r = Math.random();

  if (r < 0.55) return 'ribbon';
  if (r < 0.85) return 'rect';

  return 'star';
}

function pickColor() {
  return PALETTE[Math.floor(Math.random() * PALETTE.length)] ?? FALLBACK_CONFETTI_COLOR;
}

function spawn(options: ConfettiOptions) {
  const { originX = 0.5, originY = 0.45, scale = 1, count = 60 } = options;

  const w = window.innerWidth;
  const h = window.innerHeight;
  const cx = w * originX;
  const cy = h * originY;

  for (let i = 0; i < count; i += 1) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
    const speed = (Math.random() * 7 + 6) * scale;
    const ttl = 2400 + Math.random() * 1600;

    particles.push({
      x: cx + (Math.random() - 0.5) * 30,
      y: cy + (Math.random() - 0.5) * 10,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.4,
      size: (Math.random() * 5 + 4) * scale,
      color: pickColor(),
      shape: pickShape(),
      ttl,
      age: 0,
    });
  }
}

function step(prevTs: number) {
  if (!ctx || !canvas) return;

  const now = performance.now();
  const dt = Math.min(48, now - prevTs);

  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

  const alive: ConfettiParticle[] = [];

  for (const p of particles) {
    p.age += dt;

    if (p.age > p.ttl) continue;

    p.vy += 0.32 * (dt / 16.6);
    p.vx *= 0.992;
    p.x += p.vx * (dt / 16.6);
    p.y += p.vy * (dt / 16.6);
    p.rot += p.vrot * (dt / 16.6);

    if (p.y > window.innerHeight + 40) continue;

    const lifeFrac = p.age / p.ttl;
    const fadeIn = Math.min(1, p.age / 120);
    const fadeOut = lifeFrac > 0.75 ? 1 - (lifeFrac - 0.75) / 0.25 : 1;
    const alpha = fadeIn * fadeOut;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 8;

    if (p.shape === 'ribbon') {
      const wob = Math.sin(p.age / 80) * 0.7;

      ctx.fillRect(-p.size * 0.5, -p.size * 0.15 + wob, p.size, p.size * 0.3);
    } else if (p.shape === 'rect') {
      ctx.fillRect(-p.size * 0.5, -p.size * 0.5, p.size, p.size);
    } else {
      ctx.beginPath();

      for (let i = 0; i < 8; i += 1) {
        const r = i % 2 === 0 ? p.size * 0.55 : p.size * 0.22;
        const a = (i / 8) * Math.PI * 2;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
    alive.push(p);
  }

  particles = alive;

  if (particles.length > 0) {
    rafId = requestAnimationFrame(() => step(now));
  } else {
    rafId = null;
  }
}

export function firePremiumConfetti(options: ConfettiOptions = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  ensureCanvas();
  spawn(options);

  if (rafId === null) {
    rafId = requestAnimationFrame(() => step(performance.now()));
  }
}

export function fireVictoryCelebration() {
  if (typeof window === 'undefined') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  firePremiumConfetti({ originX: 0.5, originY: 0.45, count: 70, scale: 1.1 });

  setTimeout(() => {
    firePremiumConfetti({ originX: 0.25, originY: 0.55, count: 40, scale: 0.9 });
  }, 280);

  setTimeout(() => {
    firePremiumConfetti({ originX: 0.75, originY: 0.55, count: 40, scale: 0.9 });
  }, 520);

  setTimeout(() => {
    firePremiumConfetti({ originX: 0.5, originY: 0.4, count: 50, scale: 1 });
  }, 820);
}
