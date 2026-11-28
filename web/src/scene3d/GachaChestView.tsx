import { Suspense, lazy, useEffect, useState } from 'react';

const LazyGachaChest = lazy(() =>
  import('./GachaChestScene').then((m) => ({ default: m.GachaChestScene }))
);

const CHEST_FRAMES = Array.from(
  { length: 12 },
  (_, i) => `/assets/v2/renders/chest-open-${String(i).padStart(2, '0')}.webp`
);

function GachaChestLite({ opening }: { opening: boolean }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    for (const src of CHEST_FRAMES) {
      const img = new Image();
      img.src = src;
    }
  }, []);

  useEffect(() => {
    if (!opening) {
      setFrame(0);
      return;
    }
    let cur = 0;
    setFrame(0);
    const timer = window.setInterval(() => {
      cur = Math.min(CHEST_FRAMES.length - 1, cur + 1);
      setFrame(cur);
      if (cur >= CHEST_FRAMES.length - 1) {
        window.clearInterval(timer);
      }
    }, 52);
    return () => window.clearInterval(timer);
  }, [opening]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
      <img
        src={CHEST_FRAMES[frame]}
        alt="王国の宝箱"
        style={{
          width: 220,
          height: 220,
          objectFit: 'contain',
          filter: 'drop-shadow(0 12px 20px rgba(74,46,26,0.28))',
          transition: 'transform 120ms ease',
          transform: opening ? 'scale(1.06)' : 'scale(1)',
        }}
      />
    </div>
  );
}

export function GachaChestView({ opening, quality }: { opening: boolean; quality: '3d' | '2d' }) {
  if (quality === '2d') {
    return <GachaChestLite opening={opening} />;
  }
  return (
    <Suspense fallback={<GachaChestLite opening={opening} />}>
      <LazyGachaChest opening={opening} quality={quality} />
    </Suspense>
  );
}
