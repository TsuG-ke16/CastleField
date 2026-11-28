import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Application, Container, Graphics } from 'pixi.js';

export interface SkillTreeCanvasHandle {
  zoomBy: (factor: number) => void;
  resetView: () => void;
}

interface SkillNode {
  id: string;
  name: string;
  group: string;
  kind?: string;
  x: number;
  y: number;
}

interface SkillTreeCanvasProps {
  nodes: SkillNode[];
  edges: Array<[string, string]>;
  unlockedIds: string[];
  selectedId: string | null;
  activeGroup?: string | null;
  onSelectNode: (nodeId: string) => void;
}

export const SkillTreeCanvas = forwardRef<SkillTreeCanvasHandle, SkillTreeCanvasProps>(
  function SkillTreeCanvas(
    { nodes, edges, unlockedIds, selectedId, activeGroup = null, onSelectNode },
    ref
  ) {
    const hostRef = useRef<HTMLDivElement>(null);
    const redrawRef = useRef<() => void>(() => {});
    const controlsRef = useRef<SkillTreeCanvasHandle>({
      zoomBy: () => {},
      resetView: () => {},
    });
    const propsRef = useRef({ nodes, edges, unlockedIds, selectedId, activeGroup, onSelectNode });
    propsRef.current = { nodes, edges, unlockedIds, selectedId, activeGroup, onSelectNode };

    useImperativeHandle(ref, () => ({
      zoomBy: (factor: number) => controlsRef.current.zoomBy(factor),
      resetView: () => controlsRef.current.resetView(),
    }));

    useEffect(() => {
      const el = hostRef.current;
      if (!el) return;
      let destroyed = false;
      const app = new Application();

      const init = async () => {
        await app.init({
          resizeTo: el,
          backgroundAlpha: 0,
          antialias: true,
          resolution: Math.min(window.devicePixelRatio || 1, 2),
          autoDensity: true,
        });
        if (destroyed) {
          app.destroy(true);
          return;
        }
        el.appendChild(app.canvas);

        const world = new Container();
        app.stage.addChild(world);

        let minX = Infinity,
          minY = Infinity,
          maxX = -Infinity,
          maxY = -Infinity;
        for (const n of propsRef.current.nodes) {
          if (n.x < minX) minX = n.x;
          if (n.y < minY) minY = n.y;
          if (n.x > maxX) maxX = n.x;
          if (n.y > maxY) maxY = n.y;
        }
        const cx = (minX + maxX) / 2 || 0;
        const cy = (minY + maxY) / 2 || 0;
        const span = Math.max(maxX - minX, maxY - minY, 600);
        const fitScale = Math.max(0.22, Math.min(1.1, Math.min(el.clientWidth, el.clientHeight) / (span * 1.15)));

        const resetView = () => {
          world.scale.set(fitScale);
          world.position.set(el.clientWidth / 2 - cx * fitScale, el.clientHeight / 2 - cy * fitScale);
        };
        resetView();

        const zoomAt = (factor: number, px: number, py: number) => {
          const nextScale = Math.max(0.18, Math.min(2.4, world.scale.x * factor));
          const wx = (px - world.x) / world.scale.x;
          const wy = (py - world.y) / world.scale.y;
          world.scale.set(nextScale);
          world.x = px - wx * nextScale;
          world.y = py - wy * nextScale;
        };

        controlsRef.current = {
          zoomBy: (factor: number) => {
            zoomAt(factor, el.clientWidth / 2, el.clientHeight / 2);
          },
          resetView,
        };

        const bgLayer = new Graphics();
        const edgeLayer = new Graphics();
        const nodeLayer = new Container();
        world.addChild(bgLayer, edgeLayer, nodeLayer);

        for (const mult of [0.16, 0.3, 0.44, 0.56]) {
          bgLayer.circle(cx, cy, span * mult).stroke({ width: 2, color: 0xb8924f, alpha: 0.22 });
        }
        const outerR = span * 0.58;
        for (let i = 0; i < 8; i++) {
          const ang = (Math.PI * 2 * i) / 8;
          bgLayer
            .moveTo(cx, cy)
            .lineTo(cx + Math.cos(ang) * outerR, cy + Math.sin(ang) * outerR)
            .stroke({ width: 1.5, color: 0xb8924f, alpha: 0.16 });
        }

        const draw = () => {
          const {
            nodes: ns,
            edges: es,
            unlockedIds: unl,
            selectedId: sel,
            activeGroup: grp,
          } = propsRef.current;
          const unlockedSet = new Set(unl);
          const byId = new Map(ns.map((n) => [n.id, n]));

          edgeLayer.clear();
          for (const [aId, bId] of es) {
            const a = byId.get(aId);
            const b = byId.get(bId);
            if (!a || !b) continue;
            const dimmed =
              grp &&
              a.group !== grp &&
              b.group !== grp &&
              a.id !== 'START' &&
              b.id !== 'START';
            const bothUnlocked = unlockedSet.has(aId) && unlockedSet.has(bId);
            const oneUnlocked =
              unlockedSet.has(aId) || unlockedSet.has(bId) || aId === 'START' || bId === 'START';
            const mx = (a.x + b.x) * 0.5;
            const my = (a.y + b.y) * 0.5 - 12;
            if (bothUnlocked && !dimmed) {
              edgeLayer.moveTo(a.x, a.y);
              edgeLayer.quadraticCurveTo(mx, my, b.x, b.y);
              edgeLayer.stroke({ width: 9, color: 0xffe37a, alpha: 0.32 });
            }
            edgeLayer.moveTo(a.x, a.y);
            edgeLayer.quadraticCurveTo(mx, my, b.x, b.y);
            edgeLayer.stroke({
              width: bothUnlocked ? 4.5 : oneUnlocked ? 3.5 : 2,
              color: bothUnlocked ? 0x3465cc : oneUnlocked ? 0xd99b38 : 0xc6ad82,
              alpha: dimmed ? 0.14 : bothUnlocked ? 0.95 : oneUnlocked ? 0.8 : 0.5,
            });
          }

          nodeLayer.removeChildren();
          for (const n of ns) {
            const isStart = n.id === 'START';
            const isUltimate = n.kind === 'ultimate' || n.kind === '奥義';
            const isUnlocked = isStart || unlockedSet.has(n.id);
            const isSelected = n.id === sel;
            const isDimmed = Boolean(grp && !isStart && n.group !== grp);
            const r = isStart ? 26 : isUltimate ? 20 : 13;

            const g = new Graphics();
            g.circle(0, 3, r).fill({ color: 0x4a2e1a, alpha: isDimmed ? 0.08 : 0.24 });
            if (isStart || isUltimate || isSelected) {
              g.circle(0, 0, r + 6);
              g.fill({ color: isSelected ? 0x3465cc : 0xffe37a, alpha: isDimmed ? 0.12 : 0.36 });
            }
            g.circle(0, 0, r);
            g.fill({
              color: isStart ? 0x3465cc : isUnlocked ? 0x5b8df0 : isUltimate ? 0xffc64d : 0xfff8e6,
              alpha: isDimmed ? 0.28 : 1,
            });
            g.stroke({
              width: isSelected ? 4 : 2.5,
              color: isSelected ? 0xffb833 : 0x4a2e1a,
              alpha: isDimmed ? 0.3 : 1,
            });
            if (isStart || isUltimate || isUnlocked) {
              g.circle(0, 0, Math.max(4, r - 3)).stroke({
                width: 1.5,
                color: 0xffe37a,
                alpha: isDimmed ? 0.18 : 0.7,
              });
            }
            g.circle(-r * 0.28, -r * 0.28, r * 0.26).fill({
              color: 0xffffff,
              alpha: isDimmed ? 0.12 : 0.48,
            });
            g.position.set(n.x, n.y);
            g.eventMode = 'static';
            g.cursor = 'pointer';
            g.on('pointertap', () => propsRef.current.onSelectNode(n.id));
            nodeLayer.addChild(g);
          }
        };

        redrawRef.current = draw;
        draw();

        // Multi-touch pinch zoom + single pointer drag pan + double-tap zoom + wheel zoom
        const pointers = new Map<number, { x: number; y: number }>();
        let prevPinchDist = 0;
        let prevX = 0;
        let prevY = 0;
        let lastTapTime = 0;
        const canvas = app.canvas;

        const onDown = (e: PointerEvent) => {
          pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pointers.size === 1) {
            prevX = e.clientX;
            prevY = e.clientY;
            const now = performance.now();
            if (now - lastTapTime < 280) {
              const rect = canvas.getBoundingClientRect();
              zoomAt(1.35, e.clientX - rect.left, e.clientY - rect.top);
              lastTapTime = 0;
            } else {
              lastTapTime = now;
            }
          } else if (pointers.size === 2) {
            const pts = Array.from(pointers.values());
            prevPinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
          }
        };

        const onMove = (e: PointerEvent) => {
          if (!pointers.has(e.pointerId)) return;
          pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

          if (pointers.size === 2) {
            const pts = Array.from(pointers.values());
            const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
            if (prevPinchDist > 4 && dist > 4) {
              const rect = canvas.getBoundingClientRect();
              const midX = (pts[0].x + pts[1].x) * 0.5 - rect.left;
              const midY = (pts[0].y + pts[1].y) * 0.5 - rect.top;
              zoomAt(dist / prevPinchDist, midX, midY);
            }
            prevPinchDist = dist;
          } else if (pointers.size === 1) {
            world.x += e.clientX - prevX;
            world.y += e.clientY - prevY;
            prevX = e.clientX;
            prevY = e.clientY;
          }
        };

        const onUp = (e: PointerEvent) => {
          pointers.delete(e.pointerId);
          if (pointers.size === 1) {
            const remaining = Array.from(pointers.values())[0];
            prevX = remaining.x;
            prevY = remaining.y;
          }
          if (pointers.size < 2) prevPinchDist = 0;
        };

        const onWheel = (e: WheelEvent) => {
          e.preventDefault();
          const factor = e.deltaY < 0 ? 1.12 : 0.89;
          const rect = canvas.getBoundingClientRect();
          zoomAt(factor, e.clientX - rect.left, e.clientY - rect.top);
        };

        canvas.addEventListener('pointerdown', onDown);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        canvas.addEventListener('wheel', onWheel, { passive: false });

        return () => {
          canvas.removeEventListener('pointerdown', onDown);
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          window.removeEventListener('pointercancel', onUp);
          canvas.removeEventListener('wheel', onWheel);
        };
      };

      const cleanupPromise = init();
      return () => {
        destroyed = true;
        cleanupPromise.then((fn) => fn?.()).catch(() => {});
        try {
          app.destroy(true, { children: true });
        } catch {
          // ignore if destroyed early
        }
      };
    }, []);

    useEffect(() => {
      redrawRef.current();
    }, [nodes, edges, unlockedIds, selectedId, activeGroup]);

    return (
      <div
        ref={hostRef}
        style={{
          width: '100%',
          height: '100%',
          background: 'radial-gradient(circle at 50% 45%, #fffaf0 0%, #f5e2b5 58%, #dfc082 100%)',
          touchAction: 'none',
          cursor: 'grab',
        }}
      />
    );
  }
);
