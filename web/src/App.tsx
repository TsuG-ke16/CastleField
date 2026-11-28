import { lazy, Suspense, useEffect, useState } from 'react';
import { computePlayerProgression, useAppStore } from './stores/useAppStore';
import { cardTypeToImagePath } from './engine/dataLoader';
import { soundManager } from './audio/soundManager';
import { TopBar, BottomNav } from './components/nav/NavChrome';
import { HomeBackdrop } from './scene3d/HomeBackdrop';
import { HomeScreen } from './screens/HomeScreen';
import { PaintedIcon } from './components/ui/PaintedIcon';
import { ParchmentSheet } from './components/ui/Surfaces';
import { GameButton, RoundButton } from './components/ui/GameButton';
import { FramedAvatar, iconFrameImage } from './components/ui/FramedAvatar';
import { rankedApi } from './engine/rankedClient';

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
    ownedSkins,
    selectedIconFrame,
    equipSkin,
    data,
    onlineServerUrl,
    refreshWallet,
    walletMessage,
    setWalletMessage,
    setPlayMode,
    setOnlinePassphrase,
    setSelectedStageId,
  } = useAppStore();
  const [skillTreeOpen, setSkillTreeOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(playerName);
  const [invitedRoom, setInvitedRoom] = useState<string | null>(null);
  const shopItems = (data?.shop as { items?: Record<string, { name?: string; slot?: string }> } | undefined)?.items;
  const shopName = (id: string) => (shopItems && !Array.isArray(shopItems) && shopItems[id]?.name) || id;
  // 持っているアイコンフレーム（絵のあるものだけ）
  const ownedFrames = ownedSkins.filter((id) => iconFrameImage(id) !== null);

  // アバター・フレーム・名前を変えたら、サーバーにも伝える（ランクマッチの相手・ランキングに見える）。
  // まだランクマッチを遊んでいない端末（ゲスト登録なし）は何もしない。フレームはサーバーの所持品にあるものだけ通る
  useEffect(() => {
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          await rankedApi.updateProfile(onlineServerUrl, playerName, { avatar: avatarCardType });
          await rankedApi.updateProfile(onlineServerUrl, playerName, { iconFrame: selectedIconFrame });
        } catch {
          // つながらないときは、次に変えたときに送る
        }
      })();
    }, 600);
    return () => window.clearTimeout(t);
  }, [onlineServerUrl, playerName, avatarCardType, selectedIconFrame]);

  useEffect(() => {
    init();
  }, [init]);

  // お財布をサーバーで持っているなら、起動したときに読み直す
  useEffect(() => {
    if (!loading) void refreshWallet();
  }, [loading, refreshWallet]);

  // お財布の知らせ（失敗の理由・上限）は少し出して消す
  useEffect(() => {
    if (!walletMessage) return;
    const t = window.setTimeout(() => setWalletMessage(null), 3200);
    return () => window.clearTimeout(t);
  }, [walletMessage, setWalletMessage]);

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
        {tab === 'battle' && <HomeBackdrop tab={tab} mode={mode} quality={quality} />}

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

      {walletMessage && (
        <div
          role="status"
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 'calc(92px + var(--cf-safe-bottom, 0px))',
            transform: 'translateX(-50%)',
            zIndex: 80,
            maxWidth: 'calc(100% - 32px)',
            padding: '8px 14px',
            borderRadius: 12,
            border: '2px solid #4a2e1a',
            background: '#fff6dc',
            fontSize: 13,
            fontWeight: 900,
            boxShadow: 'var(--cf-shadow-float)',
          }}
        >
          {walletMessage}
        </div>
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
                <span style={{ padding: selectedIconFrame ? 12 : 0 }}>
                  <FramedAvatar
                    cardType={avatarCardType}
                    frameId={selectedIconFrame}
                    size={56}
                    style={{ borderRadius: 12, border: '2px solid #4a2e1a', background: '#fffaf0' }}
                  />
                </span>
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
                <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 6 }}>アイコンフレーム</div>
                {ownedFrames.length === 0 ? (
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--cf-ink-muted)' }}>
                    ランクマッチのシーズン報酬でもらえます（最高到達ランクのフレーム）
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                    {[null, ...ownedFrames].map((fid) => (
                      <button
                        key={fid ?? 'none'}
                        type="button"
                        onClick={() => equipSkin('frame', fid)}
                        aria-label={fid ? shopName(fid) : 'フレームなし'}
                        aria-pressed={selectedIconFrame === fid}
                        style={{
                          padding: 4,
                          borderRadius: 10,
                          border: selectedIconFrame === fid ? '2.5px solid #3465cc' : '2px solid #c9b075',
                          background: selectedIconFrame === fid ? '#ebf2ff' : '#fffdf6',
                          cursor: 'pointer',
                          fontSize: 10,
                          fontWeight: 900,
                          minHeight: 48,
                        }}
                      >
                        {fid ? (
                          <img src={iconFrameImage(fid) ?? ''} alt="" style={{ width: '100%', height: 40, objectFit: 'contain' }} />
                        ) : (
                          'なし'
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

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
          <div style={{ width: '100%', maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <ParchmentSheet style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '80dvh', overflowY: 'auto' }}>
              <strong style={{ fontSize: 17 }}>王国のお知らせ（v2 更新情報）</strong>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, fontWeight: 700, lineHeight: 1.65, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <li>2D省エネモード &amp; 3Dジオラマ描画を対戦メニューからいつでも切替できます。</li>
                <li>マイデッキ4枠（コピー・名前変更・採用中絞り込み・レアリティ分布グラフ）に対応。</li>
                <li>バトル終了後に自動記録される対戦履歴（直近12戦・ログ展開）＆リザルト XP/ログ確認。</li>
                <li>ショップ並び替え・レア度色分け＆ガチャ獲得時の1タップ装備を追加。</li>
                <li>PC操作：<code>1</code>〜<code>9</code> 手札選択 / <code>Space</code>・<code>Enter</code> ターン終了 / <code>Esc</code> メニュー。</li>
              </ul>
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
