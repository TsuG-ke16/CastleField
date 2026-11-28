import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { AppTab, ModeId } from '../engine/types';
import { DRACO_PATH } from './dracoPath';

function DioramaModel({ mode }: { mode: ModeId }) {
  const { scene } = useGLTF('/assets/v2/models/home-diorama-v2.glb', DRACO_PATH);
  const cloned = useMemo(() => scene.clone(), [scene]);
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    // Gentle floating island bobbing
    groupRef.current.position.y = Math.sin(clock.getElapsedTime() * 0.6) * 0.14;
    if (mode === 'factions') {
      groupRef.current.rotation.y += 0.0012;
    }
  });

  return (
    <group ref={groupRef}>
      <primitive object={cloned} />
    </group>
  );
}

const TAB_CAMERA_TARGETS: Record<AppTab, { pos: [number, number, number]; target: [number, number, number] }> = {
  battle: { pos: [0, 12.5, 22.5], target: [0, 3.0, 0] },
  gacha: { pos: [-7.5, 8.2, 14.5], target: [-1.5, 3.4, -1.2] },
  shop: { pos: [9.0, 8.5, 14.5], target: [1.8, 3.2, 1.0] },
  deck: { pos: [0, 16.0, 16.5], target: [0, 3.2, 0] },
  menu: { pos: [4.5, 13.0, 21.0], target: [0, 3.0, 0] },
};

function CameraRig({ tab }: { tab: AppTab }) {
  const { camera, size } = useThree();
  const desiredPos = useMemo(() => new THREE.Vector3(), []);
  const desiredLook = useMemo(() => new THREE.Vector3(), []);
  const currentLook = useRef(new THREE.Vector3(0, 3, 0));

  useFrame((_, delta) => {
    const cfg = TAB_CAMERA_TARGETS[tab] || TAB_CAMERA_TARGETS.battle;
    const isPortrait = size.width / Math.max(1, size.height) < 0.85;
    const distScale = isPortrait ? 1.48 : 1.0;
    desiredPos.set(cfg.pos[0] * distScale, cfg.pos[1] * (isPortrait ? 1.18 : 1), cfg.pos[2] * distScale);
    desiredLook.set(cfg.target[0], cfg.target[1] - (isPortrait ? 0.6 : 0), cfg.target[2]);
    const alpha = Math.min(1, delta * 3.5);
    camera.position.lerp(desiredPos, alpha);
    currentLook.current.lerp(desiredLook, alpha);
    camera.lookAt(currentLook.current);
  });

  return null;
}

export function HomeDioramaScene({ tab, mode, quality }: { tab: AppTab; mode: ModeId; quality: '3d' | '2d' }) {
  useEffect(() => {
    useGLTF.preload('/assets/v2/models/home-diorama-v2.glb', DRACO_PATH);
  }, []);

  if (quality === '2d') {
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(circle at 50% 38%, #fff6d9 0%, #bfe6ff 55%, #7ec7ff 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        <img
          src="/assets/bg/home-castle.png"
          alt="王国の城"
          style={{ width: 'min(92vw, 480px)', maxHeight: '55vh', objectFit: 'contain', filter: 'drop-shadow(0 12px 24px rgba(35,71,153,0.2))' }}
        />
      </div>
    );
  }

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [0, 12.5, 22.5], fov: 40, near: 0.2, far: 150 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      >
        <ambientLight intensity={1.15} color="#fff8ea" />
        <hemisphereLight args={['#a8dcff', '#c9a66b', 1.1]} />
        <directionalLight position={[12, 22, 14]} intensity={2.1} color="#fff4d8" />
        <directionalLight position={[-10, 8, -12]} intensity={0.8} color="#82c4ff" />
        <Suspense fallback={null}>
          <DioramaModel mode={mode} />
        </Suspense>
        <CameraRig tab={tab} />
        <OrbitControls
          enablePan={false}
          enableZoom={false}
          maxPolarAngle={Math.PI * 0.45}
          minPolarAngle={Math.PI * 0.18}
        />
      </Canvas>
    </div>
  );
}
