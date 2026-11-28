import { Suspense, lazy } from 'react';
import type { AppTab, ModeId } from '../engine/types';

const LazyHomeDiorama = lazy(() =>
  import('./HomeDioramaScene').then((m) => ({ default: m.HomeDioramaScene }))
);

function HomeLiteView() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 1,
        background: 'radial-gradient(circle at 50% 38%, #fff6d9 0%, #bfe6ff 55%, #7ec7ff 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      <picture style={{ width: '100%', height: '100%', display: 'block' }}>
        <source media="(orientation: portrait)" srcSet="/assets/v2/renders/home-portrait.webp" />
        <img
          src="/assets/v2/renders/home-landscape.webp"
          alt="王国の城"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: '50% 42%',
            filter: 'drop-shadow(0 10px 24px rgba(35,71,153,0.18))',
          }}
        />
      </picture>
    </div>
  );
}

export function HomeBackdrop({ tab, mode, quality }: { tab: AppTab; mode: ModeId; quality: '3d' | '2d' }) {
  if (quality === '2d') {
    return <HomeLiteView />;
  }
  return (
    <Suspense fallback={<HomeLiteView />}>
      <LazyHomeDiorama tab={tab} mode={mode} quality={quality} />
    </Suspense>
  );
}
