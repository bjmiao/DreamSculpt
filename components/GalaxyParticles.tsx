import React, { useRef, useEffect } from 'react';

const PARTICLE_COUNT = 180;
const COLORS = [
  'rgba(255,255,255,0.9)',
  'rgba(255,255,255,0.6)',
  'rgba(230,230,255,0.7)',
  'rgba(255,240,255,0.5)',
];

type Particle = {
  x: number;
  y: number;
  z: number;
  size: number;
  speedX: number;
  speedY: number;
  speedZ: number;
  color: string;
  phase: number;
  twinkleSpeed: number;
};

export const GalaxyParticles: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    const particles: Particle[] = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      z: Math.random() * 1.5,
      size: 0.5 + Math.random() * 2,
      speedX: (Math.random() - 0.5) * 0.08,
      speedY: (Math.random() - 0.5) * 0.06 - 0.02,
      speedZ: (Math.random() - 0.5) * 0.02,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      phase: Math.random() * Math.PI * 2,
      twinkleSpeed: 0.02 + Math.random() * 0.03,
    }));

    let animationId: number;
    const timeStart = Date.now() / 1000;

    const draw = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const t = Date.now() / 1000 - timeStart;

      ctx.clearRect(0, 0, w, h);

      particles.forEach((p) => {
        p.x += p.speedX;
        p.y += p.speedY;
        p.z += p.speedZ * 0.5;

        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        if (p.y > h + 10) p.y = -10;
        p.z = ((p.z % 1.5) + 1.5) % 1.5;

        const scale = 0.4 + 0.6 * p.z;
        const twinkle = 0.5 + 0.5 * Math.sin(t * p.twinkleSpeed + p.phase);
        const alpha = twinkle * scale;
        const base = p.color.replace(/[\d.]+\)$/g, `${alpha})`);
        const size = p.size * scale * (1 + 0.3 * Math.sin(t * 0.5 + p.phase));

        const sx = (p.x - w / 2) * (1 / (1 + p.z * 0.3)) + w / 2;
        const sy = (p.y - h / 2) * (1 / (1 + p.z * 0.3)) + h / 2;

        ctx.beginPath();
        ctx.arc(sx, sy, size, 0, Math.PI * 2);
        ctx.fillStyle = base;
        ctx.fill();
      });

      animationId = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-0 pointer-events-none"
      style={{ background: 'transparent' }}
      aria-hidden
    />
  );
};
