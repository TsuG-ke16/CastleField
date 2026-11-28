import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Application, Graphics } from 'pixi.js';

export type FxKind = 'fire' | 'thunder' | 'heal' | 'deploy' | 'clash' | 'victory';

export interface BattleFxHandle {
  burst: (kind: FxKind) => void;
}

interface BattleFxOverlayProps {
  stageId?: string;
  weatherId?: string | null;
  isNight?: boolean;
  quality: '3d' | '2d';
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: number;
  kind: 'circle' | 'streak' | 'confetti';
}

interface Ring {
  x: number;
  y: number;
  r: number;
  maxR: number;
  life: number;
  maxLife: number;
  color: number;
}

const CONFETTI_COLORS = [0xffd24c, 0x4da3e8, 0xf25b4b, 0x63d471, 0xc77dff];

export const BattleFxOverlay = forwardRef<BattleFxHandle, BattleFxOverlayProps>(
  function BattleFxOverlay({ stageId = 'meadow', weatherId = null, isNight = false, quality }, ref) {
    const hostRef = useRef<HTMLDivElement>(null);
    const particlesRef = useRef<Particle[]>([]);
    const ringsRef = useRef<Ring[]>([]);
    const propsRef = useRef({ stageId, weatherId, isNight, quality });
    propsRef.current = { stageId, weatherId, isNight, quality };

    useImperativeHandle(ref, () => ({
      burst(kind: FxKind) {
        const el = hostRef.current;
        const w = el?.clientWidth || 360;
        const h = el?.clientHeight || 360;
        const cx = w * 0.5;
        const cy = kind === 'deploy' ? h * 0.62 : kind === 'victory' ? h * 0.35 : h * 0.45;
        const count = propsRef.current.quality === '2d' ? 14 : 30;
        const list = particlesRef.current;

        if (kind === 'fire') {
          ringsRef.current.push({ x: cx, y: h * 0.25, r: 8, maxR: 72, life: 0.42, maxLife: 0.42, color: 0xff7b29 });
          for (let i = 0; i < count; i++) {
            const ang = (Math.PI * 2 * i) / count + Math.random() * 0.3;
            const spd = 70 + Math.random() * 140;
            list.push({
              x: cx,
              y: h * 0.25,
              vx: Math.cos(ang) * spd,
              vy: Math.sin(ang) * spd - 30,
              life: 0.55 + Math.random() * 0.25,
              maxLife: 0.8,
              size: 4 + Math.random() * 5,
              color: i % 3 === 0 ? 0xffe066 : i % 2 === 0 ? 0xff7b29 : 0xde3b32,
              kind: 'circle',
            });
          }
        } else if (kind === 'thunder') {
          ringsRef.current.push({ x: cx, y: cy, r: 10, maxR: 86, life: 0.35, maxLife: 0.35, color: 0x70e4ff });
          for (let i = 0; i < count; i++) {
            const ang = Math.random() * Math.PI * 2;
            const spd = 120 + Math.random() * 190;
            list.push({
              x: cx + (Math.random() - 0.5) * 80,
              y: cy + (Math.random() - 0.5) * 40,
              vx: Math.cos(ang) * spd,
              vy: Math.sin(ang) * spd,
              life: 0.32 + Math.random() * 0.18,
              maxLife: 0.5,
              size: 2.5 + Math.random() * 3,
              color: i % 2 === 0 ? 0x8ef3ff : 0xfff07a,
              kind: 'streak',
            });
          }
        } else if (kind === 'heal') {
          ringsRef.current.push({ x: cx, y: h * 0.72, r: 10, maxR: 64, life: 0.5, maxLife: 0.5, color: 0x6ce88a });
          for (let i = 0; i < count; i++) {
            list.push({
              x: cx + (Math.random() - 0.5) * 120,
              y: h * 0.75 + (Math.random() - 0.5) * 30,
              vx: (Math.random() - 0.5) * 30,
              vy: -55 - Math.random() * 70,
              life: 0.7 + Math.random() * 0.3,
              maxLife: 1.0,
              size: 3.5 + Math.random() * 4,
              color: i % 2 === 0 ? 0x6ce88a : 0xfff3a1,
              kind: 'circle',
            });
          }
        } else if (kind === 'deploy') {
          ringsRef.current.push({ x: cx, y: cy, r: 6, maxR: 54, life: 0.36, maxLife: 0.36, color: 0xffd25a });
          for (let i = 0; i < Math.floor(count * 0.7); i++) {
            const ang = Math.random() * Math.PI * 2;
            const spd = 40 + Math.random() * 75;
            list.push({
              x: cx,
              y: cy,
              vx: Math.cos(ang) * spd,
              vy: Math.sin(ang) * spd * 0.6,
              life: 0.4 + Math.random() * 0.2,
              maxLife: 0.6,
              size: 3 + Math.random() * 3,
              color: i % 2 === 0 ? 0xfff0b3 : 0xdab97a,
              kind: 'circle',
            });
          }
        } else if (kind === 'clash') {
          ringsRef.current.push({ x: cx, y: cy, r: 8, maxR: 60, life: 0.28, maxLife: 0.28, color: 0xffffff });
          for (let i = 0; i < count; i++) {
            const ang = Math.random() * Math.PI * 2;
            const spd = 90 + Math.random() * 140;
            list.push({
              x: cx,
              y: cy,
              vx: Math.cos(ang) * spd,
              vy: Math.sin(ang) * spd,
              life: 0.35 + Math.random() * 0.2,
              maxLife: 0.55,
              size: 2.5 + Math.random() * 3,
              color: i % 2 === 0 ? 0xffffff : 0xffcc4d,
              kind: 'streak',
            });
          }
        } else if (kind === 'victory') {
          for (let i = 0; i < count * 1.4; i++) {
            list.push({
              x: Math.random() * w,
              y: -10 - Math.random() * 40,
              vx: (Math.random() - 0.5) * 60,
              vy: 70 + Math.random() * 110,
              life: 1.4 + Math.random() * 0.8,
              maxLife: 2.2,
              size: 5 + Math.random() * 4,
              color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
              kind: 'confetti',
            });
          }
        }
      },
    }));

    useEffect(() => {
      const el = hostRef.current;
      if (!el) return;
      let destroyed = false;
      const app = new Application();
      let ambientAcc = 0;

      const startPixi = async () => {
        try {
          await app.init({
            resizeTo: el,
            width: Math.max(300, el.clientWidth),
            height: Math.max(300, el.clientHeight),
            backgroundAlpha: 0,
            antialias: false,
            resolution: Math.min(window.devicePixelRatio || 1, 1.5),
            autoDensity: true,
          });
          if (destroyed) {
            app.destroy(true);
            return;
          }
          app.canvas.style.position = 'absolute';
          app.canvas.style.inset = '0';
          app.canvas.style.width = '100%';
          app.canvas.style.height = '100%';
          app.canvas.style.display = 'block';
          app.canvas.style.pointerEvents = 'none';
          el.appendChild(app.canvas);

          const gfx = new Graphics();
          app.stage.addChild(gfx);

          app.ticker.add((ticker) => {
            if (destroyed) return;
            const dt = Math.min(0.05, ticker.deltaMS / 1000);
            const w = el.clientWidth || 360;
            const h = el.clientHeight || 360;
            const { stageId: st, weatherId: wt, isNight: night, quality: q } = propsRef.current;

            // Ambient weather & biome particles
            ambientAcc += dt * (q === '2d' ? 6 : 16);
            while (ambientAcc >= 1) {
              ambientAcc -= 1;
              if (wt === 'rain' || wt === 'storm') {
                particlesRef.current.push({
                  x: Math.random() * (w + 60),
                  y: -12,
                  vx: -55,
                  vy: 290 + Math.random() * 90,
                  life: 1.5,
                  maxLife: 1.5,
                  size: 2,
                  color: 0xaad8ff,
                  kind: 'streak',
                });
              } else if (wt === 'snow' || wt === 'blizzard' || st === 'ice') {
                particlesRef.current.push({
                  x: Math.random() * w,
                  y: -8,
                  vx: (Math.random() - 0.5) * 24,
                  vy: 36 + Math.random() * 34,
                  life: 3.2,
                  maxLife: 3.2,
                  size: 2.2 + Math.random() * 2,
                  color: 0xffffff,
                  kind: 'circle',
                });
              } else if (wt === 'sandstorm' || st === 'desert') {
                particlesRef.current.push({
                  x: -10,
                  y: Math.random() * h,
                  vx: 140 + Math.random() * 80,
                  vy: (Math.random() - 0.5) * 20,
                  life: 2.0,
                  maxLife: 2.0,
                  size: 2.2,
                  color: 0xf4cf84,
                  kind: 'circle',
                });
              } else if (st === 'lava') {
                particlesRef.current.push({
                  x: Math.random() * w,
                  y: h + 8,
                  vx: (Math.random() - 0.5) * 22,
                  vy: -45 - Math.random() * 40,
                  life: 2.4,
                  maxLife: 2.4,
                  size: 2 + Math.random() * 2.2,
                  color: Math.random() > 0.4 ? 0xff8c3b : 0xffdf78,
                  kind: 'circle',
                });
              } else if (st === 'darkForest' || night) {
                particlesRef.current.push({
                  x: Math.random() * w,
                  y: Math.random() * h,
                  vx: (Math.random() - 0.5) * 14,
                  vy: -10 - Math.random() * 14,
                  life: 2.2,
                  maxLife: 2.2,
                  size: 2.4,
                  color: 0xc8ff88,
                  kind: 'circle',
                });
              }
            }

            gfx.clear();

            // Update rings
            const nextRings: Ring[] = [];
            for (const r of ringsRef.current) {
              r.life -= dt;
              if (r.life <= 0) continue;
              const p = 1 - r.life / r.maxLife;
              const radius = r.r + (r.maxR - r.r) * p;
              gfx.circle(r.x, r.y, radius).stroke({ width: 3 * (1 - p), color: r.color, alpha: 0.75 * (1 - p) });
              nextRings.push(r);
            }
            ringsRef.current = nextRings;

            // Update particles (cap 140 for mobile battery)
            const nextParticles: Particle[] = [];
            const src = particlesRef.current.slice(-140);
            for (const p of src) {
              p.life -= dt;
              if (p.life <= 0) continue;
              p.x += p.vx * dt;
              p.y += p.vy * dt;
              const alpha = Math.max(0, Math.min(1, p.life / p.maxLife));
              if (p.kind === 'streak') {
                gfx
                  .moveTo(p.x, p.y)
                  .lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04)
                  .stroke({ width: p.size, color: p.color, alpha });
              } else if (p.kind === 'confetti') {
                gfx.rect(p.x, p.y, p.size, p.size * 0.65).fill({ color: p.color, alpha });
              } else {
                gfx.circle(p.x, p.y, p.size).fill({ color: p.color, alpha });
              }
              nextParticles.push(p);
            }
            particlesRef.current = nextParticles;
          });
        } catch {
          // Graceful no-op if WebGL context limit is reached on very constrained devices
        }
      };

      void startPixi();

      return () => {
        destroyed = true;
        try {
          if (app.renderer) {
            app.destroy(true, { children: true });
          }
        } catch {
          // Ignore partial destroy
        }
      };
    }, []);

    return (
      <div
        ref={hostRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 15,
        }}
      />
    );
  }
);
