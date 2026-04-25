// Patch 3 — Confetti contido.
//
// Antes: criava um canvas fixed no body, width/height = viewport inteiro,
// 150 partículas espalhadas via `x: Math.random() * width` — o que fazia as
// partículas literalmente aparecerem nas abas do Chrome, nas bordas da tela,
// fora do card da mesa. O jogador via confete em todo lugar menos onde ele
// esperava ver (na mesa).
//
// Depois: a API de `fire` aceita um elemento-contêiner e um ponto de origem.
// O canvas é criado DENTRO do contêiner (position: absolute, inset: 0) e as
// partículas nascem em arco curto a partir do origin, irradiando com
// gravidade leve. O burst termina em ~1.4s com fade-out nas últimas 300ms.
//
// Retrocompatível: chamar `fire()` sem argumentos mantém o comportamento
// antigo (fallback para body) — mas o projeto agora usa a variante com
// container fornecida pelo shell.

import { useCallback, useRef } from 'react';

type FireOptions = {
  // Elemento-contêiner onde o canvas será anexado. Deve ser um
  // `position: relative` para que o canvas `absolute inset-0` o cubra
  // exatamente. Se omitido, cai em `document.body` (comportamento
  // anterior — não recomendado).
  container?: HTMLElement | null;
  // Ponto de origem do burst, em % relativos ao contêiner. Default: centro.
  originX?: number; // 0..100
  originY?: number; // 0..100
  // Número total de partículas. Default: 70 (antes era 150 globais).
  count?: number;
  // Paleta de cores. Default: paleta "comemoração" dourada/verde.
  colors?: string[];
  // Intensidade do spread (raio máximo em px). Default: 240.
  spread?: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  spin: number;
  alpha: number;
};

const DEFAULT_COLORS = [
  '#f2d488', // gold
  '#c9a84c', // dark gold
  '#fef3c7', // pale gold
  '#86efac', // green
  '#22c55e', // vivid green
  '#ffffff', // white
];

const DURATION_MS = 1400;
const FADE_WINDOW_MS = 300;
const GRAVITY = 0.22;
const DRAG = 0.988;

export function useConfetti() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const fire = useCallback((options: FireOptions = {}) => {
    const {
      container = null,
      originX = 50,
      originY = 40,
      count = 70,
      colors = DEFAULT_COLORS,
      spread = 240,
    } = options;

    const host = container ?? document.body;
    const hostRect = host.getBoundingClientRect();

    const canvas = document.createElement('canvas');
    canvas.style.position = container ? 'absolute' : 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    // Mantém abaixo de modais críticos (z-50+) mas acima dos slots.
    canvas.style.zIndex = '40';

    const dpr = window.devicePixelRatio || 1;
    const width = hostRect.width || window.innerWidth;
    const height = hostRect.height || window.innerHeight;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));

    host.appendChild(canvas);
    canvasRef.current = canvas;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      canvas.remove();
      return;
    }

    ctx.scale(dpr, dpr);

    const particles: Particle[] = [];
    const cx = (originX / 100) * width;
    const cy = (originY / 100) * height;

    for (let i = 0; i < count; i++) {
      // Ângulo em arco largo pra cima (-135° a -45°, i.e. leque superior).
      // Faz o burst explodir pra cima e pros lados, não pra baixo.
      const angle = (-Math.PI * 3) / 4 + Math.random() * (Math.PI / 2);
      const speed = 3 + Math.random() * 5;

      particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 3 + Math.random() * 4,
        color: colors[i % colors.length]!,
        rotation: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.3,
        alpha: 1,
      });
    }

    let animationId: number;
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;

      if (elapsed > DURATION_MS) {
        cancelAnimationFrame(animationId);
        canvas.remove();
        if (canvasRef.current === canvas) {
          canvasRef.current = null;
        }
        return;
      }

      // Fade-out nas últimas 300ms.
      const fadeFactor =
        elapsed > DURATION_MS - FADE_WINDOW_MS
          ? Math.max(0, (DURATION_MS - elapsed) / FADE_WINDOW_MS)
          : 1;

      ctx.clearRect(0, 0, width, height);

      for (const p of particles) {
        p.vx *= DRAG;
        p.vy = p.vy * DRAG + GRAVITY;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.spin;
        p.alpha = fadeFactor;

        // Clamp de segurança — evita partículas renderizadas fora do
        // canvas consumirem CPU em excesso. Spread enforces max radius.
        if (
          Math.abs(p.x - cx) > spread ||
          Math.abs(p.y - cy) > spread * 1.4 ||
          p.y > height + 40
        ) {
          continue;
        }

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        // Retângulo pequeno — confete estilizado, não quadrado chapado.
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
        ctx.restore();
      }

      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);
  }, []);

  return { fire };
}
