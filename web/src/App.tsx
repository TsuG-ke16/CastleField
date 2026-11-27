import { lazy, Suspense, useEffect, useState } from 'react';
import { useAppStore } from './stores/useAppStore';
import { soundManager } from './audio/soundManager';
import { TopBar, BottomNav } from './components/nav/NavChrome';
import { HomeDioramaScene } from './scene3d/HomeDioramaScene';
import { HomeScreen } from './screens/HomeScreen';
import { ParchmentSheet } from './components/ui/Surfaces';
import { GameButton } from './components/ui/GameButton';

const BattleScreen = lazy(() => import('./screens/BattleScreen').then((m) => ({ default: m.BattleScreen })));
const DeckScreen = lazy(() => import('./screens/DeckScreen').then((m) => ({ default: m.DeckScreen })));
const GachaScreen = lazy(() => import('./screens/GachaScreen').then((m) => ({ default: m.GachaScreen })));
const ShopScreen = lazy(() => import('./screens/ShopScreen').then((m) => ({ default: m.ShopScreen })));
const MenuScreen = lazy(() => import('./screens/MenuScreen').then((m) => ({ default: m.MenuScreen })));
const SkillTreeScreen = lazy(() => import('./screens/SkillTreeScreen').then((m) => ({ default: m.SkillTreeScreen })));

function RouteFallback() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontWeight: 900 }}>
      読み込み中…
    </div>
  );
}

export function App() {
  const { init, loading, error, tab, mode, quality, inBattle } = useAppStore();
  const [skillTreeOpen, setSkillTreeOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (!loading) {
      soundManager.setBgmMode(inBattle ? 'battle' : 'home');
    }
  }, [loading, inBattle]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
        <img src="/assets/castles/castle-blue.png" alt="" style={{ width: 96, height: 96, objectFit: 'contain' }} />
        <strong style={{ fontSize: 18 }}>キャッスルフィールド v2 を読み込み中…</strong>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 20 }}>
        <ParchmentSheet>
          <strong>読み込みエラー</strong>
          <p>{error}</p>
        </ParchmentSheet>
      </div>
    );
  }

  if (inBattle) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <BattleScreen />
      </Suspense>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <TopBar onOpenNotice={() => setNoticeOpen(true)} />

      <main style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {tab === 'battle' && <HomeDioramaScene tab={tab} mode={mode} quality={quality} />}

        {tab === 'battle' && <HomeScreen onOpenSkillTree={() => setSkillTreeOpen(true)} />}
        <Suspense fallback={<RouteFallback />}>
          {tab === 'deck' && <DeckScreen />}
          {tab === 'gacha' && <GachaScreen />}
          {tab === 'shop' && <ShopScreen />}
          {tab === 'menu' && <MenuScreen onOpenSkillTree={() => setSkillTreeOpen(true)} />}
        </Suspense>
      </main>

      <BottomNav />

      {skillTreeOpen && (
        <Suspense fallback={<RouteFallback />}>
          <SkillTreeScreen onBack={() => setSkillTreeOpen(false)} />
        </Suspense>
      )}

      {noticeOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(28,17,8,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setNoticeOpen(false)}
        >
          <div style={{ width: '100%', maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <ParchmentSheet style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <strong style={{ fontSize: 17 }}>王国のお知らせ</strong>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, lineHeight: 1.6 }}>
                CastleField v2（脱SVG・新ボタン・Blender 3D・Rust WASM・4陣営/クラシック）へ進化！外でもスマホ片手で快適に対戦できます。
              </p>
              <GameButton variant="primary-gold" fullWidth onClick={() => setNoticeOpen(false)}>
                わかった
              </GameButton>
            </ParchmentSheet>
          </div>
        </div>
      )}
    </div>
  );
}
export default App;
