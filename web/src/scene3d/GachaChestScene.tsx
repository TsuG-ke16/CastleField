import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import * as THREE from 'three';

function ChestMesh({ opening }: { opening: boolean }) {
  const { scene, animations } = useGLTF('/assets/v2/models/gacha-chest-v2.glb');
  const cloned = useMemo(() => scene.clone(), [scene]);
  const group = useRef<THREE.Group>(null);
  const { actions } = useAnimations(animations, group);

  useEffect(() => {
    const action = actions['ChestOpen'] || Object.values(actions)[0];
    if (!action) return;
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    if (opening) {
      action.timeScale = 1.4;
      action.play();
    } else {
      action.paused = true;
      action.time = 0;
    }
  }, [actions, opening]);

  useFrame(({ clock }) => {
    if (!group.current) return;
    const t = clock.getElapsedTime();
    group.current.rotation.y = Math.sin(t * 0.9) * 0.25 - 0.35;
    if (opening) {
      group.current.position.y = Math.sin(t * 24) * 0.05;
    } else {
      group.current.position.y = Math.sin(t * 2.0) * 0.06;
    }
  });

  return (
    <group ref={group} scale={0.86} position={[0, -0.35, 0]}>
      <primitive object={cloned} />
    </group>
  );
}

export function GachaChestScene({ opening, quality }: { opening: boolean; quality: '3d' | '2d' }) {
  if (quality === '2d') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <img
          src="/assets/v2/icons/gacha.webp"
          alt="王国の宝箱"
          style={{ width: 160, height: 160, objectFit: 'contain', filter: 'drop-shadow(0 10px 18px rgba(74,46,26,0.3))' }}
        />
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [2.8, 2.4, 5.6], fov: 40 }}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={1.2} color="#fff7e2" />
        <directionalLight position={[4, 7, 5]} intensity={2.2} color="#fff2c8" />
        <pointLight position={[0, 1.6, 0.5]} intensity={opening ? 6 : 1.5} color="#ffd966" />
        <Suspense fallback={null}>
          <ChestMesh opening={opening} />
        </Suspense>
      </Canvas>
    </div>
  );
}
