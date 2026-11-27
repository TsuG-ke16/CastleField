import { lazy, Suspense, useEffect, useState } from 'react';
import { computePlayerProgression, useAppStore } from './stores/useAppStore';
import { cardTypeToImagePath } from './engine/dataLoader';
import { soundManager } from './audio/soundManager';
import { TopBar, BottomNav } from './components/nav/NavChrome';
import { HomeDioramaScene } from './scene3d/HomeDioramaScene';
import { HomeScreen } from './screens/HomeScreen';
import { PaintedIcon } from './components/ui/PaintedIcon';
import { ParchmentSheet } from './components/ui/Surfaces';
import { GameButton, RoundButton } from './components/ui/GameButton';

const BattleScreen = lazy(() => import('./screens/BattleScreen').then((m) => ({ default: m.BattleScreen })));
const DeckScreen = lazy(() => import('./screens/DeckScreen').then((m) => ({ default: m.DeckScreen })));
const GachaScreen = lazy(() => import('./screens/GachaScreen').then((m) => ({ default: m.GachaScreen })));
const ShopScreen = lazy(() => import('./screens/ShopScreen').then((m) => ({ default: m.ShopScreen })));
const MenuScreen = lazy(() => import('./screens/MenuScreen').then((m) => ({ default: m.MenuScreen })));
const SkillTreeScreen = lazy(() => import('./screens/SkillTreeScreen').then((m) => ({ default: m.SkillTreeScreen })));

const AVATAR_CHOICES = [
  'infantry',
  'knight',
  'archer',
  'mage',
  'paladin',
  'hero',
  'dragonKnight',
  'sage',
];

function RouteFallback() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontWeight: 900 }}>
      読み込み中…
    </div>
  );
}

export function App() {
  const {
    init,
    loading,
    error,
    tab,
    mode,
    quality,
    inBattle,
    playerName,
    avatarCardType,
    stats,
    setPlayerName,
    setAvatarCardType,
    setPlayMode,
    setOnlinePassphrase,
    setSelectedStageId,
  } = useAppStore();
  const [skillTreeOpen, setSkillTreeOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(playerName);
  const [invitedRoom, setInvitedRoom] = useState<string | null>(null);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room')?.trim();
    const stage = params.get('stage')?.trim();
    if (room) {
      setPlayMode('casual');
      setOnlinePassphrase(room);
      if (stage) setSelectedStageId(stage);
      setInvitedRoom(room);
    }
  }, [setPlayMode, setOnlinePassphrase, setSelectedStageId]);

  useEffect(() => {
    if (!loading) {
      soundManager.setBgmMode(inBattle ? 'battle' : 'home');
    }
  }, [loading, inBattle]);

  useEffect(() => {
    if (profileOpen) setNameDraft(playerName);
  }, [profileOpen, playerName]);

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

  const prog = computePlayerProgression(stats);
  const winRate = stats.matchesPlayed > 0 ? Math.round((stats.wins / stats.matchesPlayed) * 100) : 0;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <TopBar onOpenNotice={() => setNoticeOpen(true)} onOpenProfile={() => setProfileOpen(true)} />

      <main style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {tab === 'battle' && <HomeDioramaScene tab={tab} mode={mode} quality={quality} />}

        {tab === 'battle' && invitedRoom && (
          <div
            style={{
              position: 'absolute',
              top: 58,
              left: 12,
              right: 12,
              zIndex: 25,
              margin: '0 auto',
              maxWidth: 460,
              padding: '6px 12px',
              background: '#fff3cd',
              border: '2px solid #4a2e1a',
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              fontSize: 12,
              fontWeight: 900,
            }}
          >
            <span>招待ルーム「{invitedRoom}」準備OK！「出陣する！」で入室できます</span>
            <button
              type="button"
              onClick={() => setInvitedRoom(null)}
              style={{ background: 'none', border: 'none', fontWeight: 900, cursor: 'pointer' }}
              aria-label="招待バナーを閉じる"
            >
              ×
            </button>
          </div>
        )}

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

      {profileOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(28,17,8,0.58)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setProfileOpen(false)}
        >
          <div style={{ width: '100%', maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <ParchmentSheet style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: 17 }}>領主プロフィール</strong>
                <RoundButton onClick={() => setProfileOpen(false)} aria-label="閉じる">
                  <PaintedIcon name="close" size={16} />
                </RoundButton>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fbf3dc', padding: 10, borderRadius: 12, border: '1.5px solid #d4bc7d' }}>
                <img
                  src={cardTypeToImagePath(avatarCardType)}
                  alt="アバター"
                  style={{ width: 56, height: 56, borderRadius: 12, border: '2px solid #4a2e1a', background: '#fffaf0', objectFit: 'contain' }}
                />
                <div style={{ flex: 1, fontSize: 12, fontWeight: 900 }}>
                  <div style={{ fontSize: 15 }}>Lv.{prog.level} {prog.title}</div>
                  <div>総XP: {prog.xp} ・ 勝率 {winRate}% ({stats.wins}/{stats.matchesPlayed})</div>
                  <div style={{ marginTop: 4, height: 8, borderRadius: 999, background: '#dfca9f', border: '1.5px solid #4a2e1a', overflow: 'hidden' }}>
                    <div style={{ width: `${prog.currentLevelXp}%`, height: '100%', background: '#3465cc' }} />
                  </div>
                </div>
              </div>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 900 }}>
                表示名
                <input
                  type="text"
                  maxLength={18}
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  style={{ padding: '8px 10px', borderRadius: 10, border: '2px solid #4a2e1a', background: '#fffdf7', fontSize: 14, fontWeight: 800 }}
                />
              </label>

              <div>
                <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 6 }}>アバターを選択</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                  {AVATAR_CHOICES.map((cid) => (
                    <button
                      key={cid}
                      type="button"
                      onClick={() => setAvatarCardType(cid)}
                      aria-label={cid}
                      style={{
                        padding: 4,
                        borderRadius: 10,
                        border: avatarCardType === cid ? '2.5px solid #3465cc' : '2px solid #c9b075',
                        background: avatarCardType === cid ? '#ebf2ff' : '#fffdf6',
                        cursor: 'pointer',
                      }}
                    >
                      <img src={cardTypeToImagePath(cid)} alt={cid} style={{ width: '100%', height: 42, objectFit: 'contain' }} />
                    </button>
                  ))}
                </div>
              </div>

              <GameButton
                variant="primary-gold"
                fullWidth
                onClick={() => {
                  setPlayerName(nameDraft);
                  setProfileOpen(false);
                }}
              >
                保存して閉じる
              </GameButton>
            </ParchmentSheet>
          </div>
        </div>
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
                CastleField v2（脱SVG・新ボタン・Blender 3D・Rust WASM・4陣営/クラシック・スタンプ＆URL招待）へ完全刷新！外でもスマホ片手で快適に対戦できます。
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
