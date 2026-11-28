import { useEffect, useRef } from 'react';
import { Application, Container, Graphics } from 'pixi.js';

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
  onSelectNode: (nodeId: string) => void;
}

export function SkillTreeCanvas({
  nodes,
  edges,
  unlockedIds,
  selectedId,
  onSelectNode,
}: SkillTreeCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const redrawRef = useRef<() => void>(() => {});
  const propsRef = useRef({ nodes, edges, unlockedIds, selectedId, onSelectNode });
  propsRef.current = { nodes, edges, unlockedIds, selectedId, onSelectNode };

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

      // Compute bounds and center
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const n of propsRef.current.nodes) {
        if (n.x < minX) minX = n.x;
        if (n.y < minY) minY = n.y;
        if (n.x > maxX) maxX = n.x;
        if (n.y > maxY) maxY = n.y;
      }
      const cx = (minX + maxX) / 2 || 0;
      const cy = (minY + maxY) / 2 || 0;
      const span = Math.max(maxX - minX, maxY - minY, 600);
      const fitScale = Math.min(el.clientWidth, el.clientHeight) / (span * 1.15);
      world.scale.set(Math.max(0.22, Math.min(1.1, fitScale)));
      world.position.set(el.clientWidth / 2 - cx * world.scale.x, el.clientHeight / 2 - cy * world.scale.y);

      const edgeLayer = new Graphics();
      const nodeLayer = new Container();
      world.addChild(edgeLayer, nodeLayer);

      const draw = () => {
        const { nodes: ns, edges: es, unlockedIds: unl, selectedId: sel } = propsRef.current;
        const unlockedSet = new Set(unl);
        const byId = new Map(ns.map((n) => [n.id, n]));

        edgeLayer.clear();
        for (const [aId, bId] of es) {
          const a = byId.get(aId);
          const b = byId.get(bId);
          if (!a || !b) continue;
          const bothUnlocked = unlockedSet.has(aId) && unlockedSet.has(bId);
          const oneUnlocked = unlockedSet.has(aId) || unlockedSet.has(bId) || aId === 'START' || bId === 'START';
          edgeLayer.moveTo(a.x, a.y);
          const mx = (a.x + b.x) * 0.5;
          const my = (a.y + b.y) * 0.5 - 12;
          edgeLayer.quadraticCurveTo(mx, my, b.x, b.y);
          edgeLayer.stroke({
            width: bothUnlocked ? 5 : oneUnlocked ? 3.5 : 2,
            color: bothUnlocked ? 0x3465cc : oneUnlocked ? 0xd99b38 : 0xc6ad82,
            alpha: bothUnlocked ? 0.95 : oneUnlocked ? 0.8 : 0.5,
          });
        }

        nodeLayer.removeChildren();
        for (const n of ns) {
          const isStart = n.id === 'START';
          const isUltimate = n.kind === 'ultimate' || n.kind === '奥義';
          const isUnlocked = isStart || unlockedSet.has(n.id);
          const isSelected = n.id === sel;
          const r = isStart ? 26 : isUltimate ? 20 : 13;

          const g = new Graphics();
          if (isUltimate || isSelected) {
            g.circle(0, 0, r + 6);
            g.fill({ color: isSelected ? 0x3465cc : 0xffe37a, alpha: 0.35 });
          }
          g.circle(0, 0, r);
          g.fill({
            color: isStart ? 0x3465cc : isUnlocked ? 0x5b8df0 : isUltimate ? 0xffc64d : 0xfff8e6,
          });
          g.stroke({
            width: isSelected ? 4 : 2.5,
            color: isSelected ? 0xffb833 : 0x4a2e1a,
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

      // Pointer drag pan + wheel zoom
      let dragging = false;
      let prevX = 0;
      let prevY = 0;
      const canvas = app.canvas;

      const onDown = (e: PointerEvent) => {
        dragging = true;
        prevX = e.clientX;
        prevY = e.clientY;
      };
      const onMove = (e: PointerEvent) => {
        if (!dragging) return;
        world.x += e.clientX - prevX;
        world.y += e.clientY - prevY;
        prevX = e.clientX;
        prevY = e.clientY;
      };
      const onUp = () => {
        dragging = false;
      };
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.12 : 0.89;
        const nextScale = Math.max(0.18, Math.min(2.2, world.scale.x * factor));
        const rect = canvas.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const wx = (px - world.x) / world.scale.x;
        const wy = (py - world.y) / world.scale.y;
        world.scale.set(nextScale);
        world.x = px - wx * nextScale;
        world.y = py - wy * nextScale;
      };

      canvas.addEventListener('pointerdown', onDown);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      canvas.addEventListener('wheel', onWheel, { passive: false });

      return () => {
        canvas.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
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
  }, [nodes, edges, unlockedIds, selectedId]);

  return (
    <div
      ref={hostRef}
      style={{
        width: '100%',
        height: '100%',
        background: 'radial-gradient(circle at 50% 50%, #fff8e2 0%, #f3dfb2 100%)',
        touchAction: 'none',
        cursor: 'grab',
      }}
    />
  );
}
