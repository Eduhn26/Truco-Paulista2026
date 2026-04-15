import { useCallback, useRef } from 'react';

export function useConfetti() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const fire = useCallback(() => {
    // Simple canvas confetti
    const canvas = document.createElement('canvas');
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '9999';
    document.body.appendChild(canvas);
    canvasRef.current = canvas;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    const particles: Array<{
      x: number;
      y: number;
      size: number;
      speedX: number;
      speedY: number;
      color: string;
    }> = [];

    for (let i = 0; i < 150; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height - height,
        size: Math.random() * 6 + 2,
        speedX: (Math.random() - 0.5) * 3,
        speedY: Math.random() * 5 + 2,
        color: `hsl(${Math.random() * 60 + 40}, 100%, 60%)`,
      });
    }

    let animationId: number;
    let startTime = performance.now();

    const animate = (now: number) => {
      if (now - startTime > 3000) {
        cancelAnimationFrame(animationId);
        canvas.remove();
        return;
      }

      ctx.clearRect(0, 0, width, height);
      for (const p of particles) {
        p.x += p.speedX;
        p.y += p.speedY;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }
      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);
  }, []);

  return { fire };
}