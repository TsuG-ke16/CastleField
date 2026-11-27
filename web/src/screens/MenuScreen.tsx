import { useState } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { runRustWasmBenchmark, type RustBenchmarkResult } from '../engine/wasmAdapter';
import { getSkinFilter, getSkinPreviewImage } from '../engine/skinUtils';
import { GameButton } from '../components/ui/GameButton';
import { PaintedIcon, type PaintedIconName } from '../components/ui/PaintedIcon';
import { ParchmentSheet } from '../components/ui/Surfaces';

export function MenuScreen({ onOpenSkillTree }: { onOpenSkillTree: () => void }) {
  const {
    quality,
    setQuality,
    muted,
    toggleMute,
    bgmMuted,
    toggleBgmMute,
    engineMode,
    setEngineMode,
    data,
    stats,
    claimedMissions,
    claimMissionReward,
    ownedSkins,
    selectedCastleSkin,
    selectedSoldierSkin,
    unlockedSkills,
    equipSkin,
  } = useAppStore();
  const [subPage, setSubPage] = useState<'main' | 'skins' | 'missions' | 'guide'>('main');
  const [benchBusy, setBenchBusy] = useState(false);
  const [benchResult, setBenchResult] = useState<RustBenchmarkResult | null>(null);
  const [benchError, setBenchError] = useState<string | null>(null);

  const handleRunBench = async () => {
    if (!data || benchBusy) return;
    setBenchBusy(true);
    setBenchError(null);
    try {
      const res = await runRustWasmBenchmark(data, 200, 20261127);
      setBenchResult(res);
    } catch (e) {
      setBenchError(e instanceof Error ? e.message : String(e));
    } finally {
      setBenchBusy(false);
    }
  };

  if (subPage === 'skins') {
    return (
      <section
        style={{
          position: 'relative',
          zIndex: 10,
          height: '100%',
          overflowY: 'auto',
          padding: '12px 14px 90px',
          maxWidth: 760,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <GameButton size="sm" variant="normal-stone" onClick={() => setSubPage('main')}>
            ← メニュー
          </GameButton>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>スキン装備</h1>
        </div>

        <ParchmentSheet style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <strong style={{ fontSize: 15 }}>現在の装備</strong>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, textAlign: 'center', fontSize: 12, fontWeight: 800 }}>
            <div>
              <img
                src="/assets/castles/castle-blue.png"
                alt="城"
                style={{
                  width: 72,
                  height: 72,
                  objectFit: 'contain',
                  margin: '0 auto',
                  filter: getSkinFilter(data, selectedCastleSkin, 'blue'),
                }}
              />
              <span>{selectedCastleSkin}</span>
            </div>
            <div>
              <img
                src="/assets/cards/card-infantry.png"
                alt="兵士"
                style={{
                  width: 72,
                  height: 72,
                  objectFit: 'contain',
                  margin: '0 auto',
                  filter: getSkinFilter(data, selectedSoldierSkin, 'blue'),
                }}
              />
              <span>{selectedSoldierSkin}</span>
            </div>
            <div>
              <img src="/assets/ui/card-back.png" alt="カード裏面" style={{ width: 52, height: 72, objectFit: 'contain', margin: '0 auto' }} />
              <span>標準裏面</span>
            </div>
          </div>
        </ParchmentSheet>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {ownedSkins.map((sid) => {
            const isCastle = sid.includes('castle');
            const isBack = sid.includes('back') || sid.includes('Back');
            const equipKind = isCastle ? 'castle' : isBack ? 'back' : 'soldier';
            const equipped =
              selectedCastleSkin === sid || selectedSoldierSkin === sid;
            return (
              <ParchmentSheet key={sid} style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
                <img
                  src={getSkinPreviewImage(sid)}
                  alt={sid}
                  style={{
                    width: 48,
                    height: 48,
                    objectFit: 'contain',
                    filter: getSkinFilter(data, sid, 'blue'),
                  }}
                />
                <strong style={{ fontSize: 12 }}>{sid}</strong>
                <GameButton
                  size="sm"
                  fullWidth
                  variant={equipped ? 'selected-royal' : 'normal-stone'}
                  onClick={() => equipSkin(equipKind, sid)}
                >
                  {equipped ? '装備中' : '装備する'}
                </GameButton>
              </ParchmentSheet>
            );
          })}
        </div>
      </section>
    );
  }

  if (subPage === 'missions') {
    const missions = [
      { id: 'welcome_gift', title: '王国へようこそ（初陣準備ボーナス）', cur: 1, goal: 1, reward: 150 },
      { id: 'first_match', title: '初めての出陣を経験する', cur: stats.matchesPlayed, goal: 1, reward: 200 },
      { id: 'win_three', title: 'バトルで3回勝利する', cur: stats.wins, goal: 3, reward: 500 },
      { id: 'gacha_ten', title: '王国の宝箱を10回引く', cur: stats.gachaRolls, goal: 10, reward: 300 },
      { id: 'collect_skins', title: 'スキンを5個集める', cur: ownedSkins.length, goal: 5, reward: 300 },
      { id: 'unlock_skills', title: 'スキルを3個解放する', cur: unlockedSkills.length, goal: 3, reward: 250 },
    ];

    return (
      <section
        style={{
          position: 'relative',
          zIndex: 10,
          height: '100%',
          overflowY: 'auto',
          padding: '12px 14px 90px',
          maxWidth: 760,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <GameButton size="sm" variant="normal-stone" onClick={() => setSubPage('main')}>
            ← メニュー
          </GameButton>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>ランキング・実績ミッション</h1>
        </div>

        <ParchmentSheet style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, textAlign: 'center' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--cf-ink-muted)' }}>総試合</div>
            <div style={{ fontSize: 18, fontWeight: 900 }} className="tabular">{stats.matchesPlayed}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--cf-ink-muted)' }}>勝利</div>
            <div style={{ fontSize: 18, fontWeight: 900 }} className="tabular">{stats.wins}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--cf-ink-muted)' }}>ガチャ</div>
            <div style={{ fontSize: 18, fontWeight: 900 }} className="tabular">{stats.gachaRolls}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--cf-ink-muted)' }}>プレイ札</div>
            <div style={{ fontSize: 18, fontWeight: 900 }} className="tabular">{stats.cardsPlayed}</div>
          </div>
        </ParchmentSheet>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {missions.map((m) => {
            const done = m.cur >= m.goal;
            const claimed = claimedMissions.includes(m.id);
            const pct = Math.min(100, Math.round((m.cur / m.goal) * 100));
            return (
              <ParchmentSheet key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <strong style={{ fontSize: 13 }}>{m.title}</strong>
                  <span style={{ fontSize: 12, fontWeight: 900 }} className="tabular">
                    {Math.min(m.cur, m.goal)}/{m.goal}
                  </span>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: '#e2cfa4', border: '1.5px solid #4a2e1a', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: done ? '#4ea85f' : '#3465cc' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 800 }}>報酬: 🪙{m.reward}</span>
                  <GameButton
                    size="sm"
                    variant={claimed ? 'normal-stone' : done ? 'primary-gold' : 'normal-stone'}
                    disabled={!done || claimed}
                    onClick={() => claimMissionReward(m.id, m.reward)}
                  >
                    {claimed ? '受取済み' : done ? '報酬を受け取る' : '未達成'}
                  </GameButton>
                </div>
              </ParchmentSheet>
            );
          })}
        </div>
      </section>
    );
  }

  if (subPage === 'guide') {
    return (
      <section
        style={{
          position: 'relative',
          zIndex: 10,
          height: '100%',
          overflowY: 'auto',
          padding: '12px 14px 90px',
          maxWidth: 760,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <GameButton size="sm" variant="normal-stone" onClick={() => setSubPage('main')}>
            ← メニュー
          </GameButton>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>遊び方ガイド</h1>
        </div>

        <ParchmentSheet style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <strong style={{ fontSize: 15 }}>1. 勝利条件と基本ターン</strong>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, lineHeight: 1.65 }}>
            左・中央・右の3本の道に兵士を送り込み、相手の城HP（初期60）を0にした方の勝ちです。カードはタップまたは上方向スワイプで発動できます。
          </p>
        </ParchmentSheet>

        <ParchmentSheet style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <strong style={{ fontSize: 15 }}>2. 属性4すくみ相性</strong>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '6px 0' }}>
            <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 900 }}>
              <PaintedIcon name="fire" size={32} />
              <div>火</div>
            </div>
            <span style={{ fontWeight: 900 }}>→</span>
            <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 900 }}>
              <PaintedIcon name="wind" size={32} />
              <div>風</div>
            </div>
            <span style={{ fontWeight: 900 }}>→</span>
            <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 900 }}>
              <PaintedIcon name="earth" size={32} />
              <div>土</div>
            </div>
            <span style={{ fontWeight: 900 }}>→</span>
            <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 900 }}>
              <PaintedIcon name="water" size={32} />
              <div>水</div>
            </div>
            <span style={{ fontWeight: 900 }}>→ 火</span>
          </div>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700 }}>
            有利属性の相手に対して攻撃力にボーナスが乗ります。ステージごとの属性強化も活用しましょう。
          </p>
        </ParchmentSheet>

        <ParchmentSheet style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <strong style={{ fontSize: 15 }}>3. 合成進化と防御カード</strong>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, lineHeight: 1.65 }}>
            同じカードを2枚選ぶと「合成」で上位レアカードに進化できます（「適応」はどのカードとも合成可能）。「反射」「身代わり」などの防御カードは相手の直接攻撃時に割り込んで発動します。
          </p>
        </ParchmentSheet>

        <ParchmentSheet style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <strong style={{ fontSize: 15 }}>4. 友達と対戦（合言葉 / 同じ端末）</strong>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, lineHeight: 1.65 }}>
            「同じ端末」なら1台のスマホを交互に受け渡して対戦でき、「合言葉対戦」では Rust サーバー経由で離れた友達とリアルタイム同期対戦が可能です。
          </p>
        </ParchmentSheet>
      </section>
    );
  }

  const menuRows: Array<{ label: string; desc: string; icon: PaintedIconName; action: () => void }> = [
    { label: 'スキン装備', desc: '持っている見た目を城や兵士に装備する', icon: 'skin', action: () => setSubPage('skins') },
    { label: 'スキル作戦図（200種）', desc: 'クラシックモードのスキルツリーを編集', icon: 'crown', action: onOpenSkillTree },
    { label: 'ランキング・実績ミッション', desc: '戦績確認とミッション報酬（コイン獲得）', icon: 'ranking', action: () => setSubPage('missions') },
    { label: '遊び方ガイド', desc: '属性相性と城攻め・合成の基本ルール', icon: 'help', action: () => setSubPage('guide') },
  ];

  return (
    <section
      style={{
        position: 'relative',
        zIndex: 10,
        height: '100%',
        overflowY: 'auto',
        padding: '12px 14px 90px',
        maxWidth: 760,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
      aria-label="王国メニュー"
    >
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, textShadow: '0 2px 0 #fffaf0' }}>
        王国メニュー
      </h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 900, paddingLeft: 4 }}>自分の王国</div>
        <ParchmentSheet style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {menuRows.map((row) => (
            <button
              key={row.label}
              type="button"
              onClick={row.action}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                width: '100%',
                minHeight: 54,
                padding: '8px 10px',
                borderRadius: 12,
                border: '2px solid #d9c48a',
                background: '#fffdf6',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <PaintedIcon name={row.icon} size={32} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 900 }}>{row.label}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--cf-ink-muted)' }}>{row.desc}</div>
              </div>
              <PaintedIcon name="arrow" size={16} />
            </button>
          ))}
        </ParchmentSheet>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 900, paddingLeft: 4 }}>環境・外遊び設定</div>
        <ParchmentSheet style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 900 }}>描画品質（外遊び省電力）</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--cf-ink-muted)' }}>
                電池・通信量を抑えたいときは「省電力2D」へ
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <GameButton
                size="sm"
                variant={quality === '3d' ? 'selected-royal' : 'normal-stone'}
                onClick={() => setQuality('3d')}
              >
                標準3D
              </GameButton>
              <GameButton
                size="sm"
                variant={quality === '2d' ? 'selected-royal' : 'normal-stone'}
                onClick={() => setQuality('2d')}
              >
                省電力2D
              </GameButton>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 900 }}>サウンド効果音</div>
            <GameButton
              size="sm"
              variant={muted ? 'danger-ruby' : 'selected-royal'}
              onClick={toggleMute}
            >
              {muted ? 'ミュート中' : 'ON'}
            </GameButton>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 900 }}>BGM（音楽）</div>
            <GameButton
              size="sm"
              variant={bgmMuted || muted ? 'danger-ruby' : 'selected-royal'}
              disabled={muted}
              onClick={toggleBgmMute}
            >
              {muted ? '全体ミュート中' : bgmMuted ? 'OFF' : 'ON'}
            </GameButton>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 900 }}>ゲームエンジン（計算コア）</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--cf-ink-muted)' }}>
                Rust WebAssembly（標準）／ JS互換フォールバック
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <GameButton
                size="sm"
                variant={engineMode === 'rust-wasm' ? 'selected-royal' : 'normal-stone'}
                onClick={() => setEngineMode('rust-wasm')}
              >
                🦀 Rust WASM
              </GameButton>
              <GameButton
                size="sm"
                variant={engineMode === 'js-legacy' ? 'selected-royal' : 'normal-stone'}
                onClick={() => setEngineMode('js-legacy')}
              >
                JS
              </GameButton>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              paddingTop: 6,
              borderTop: '1px dashed #d3be86',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 900 }}>Rust WASM 200試合ベンチマーク</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--cf-ink-muted)' }}>
                  AI同士の200試合フル対戦をブラウザ内WASMで計測
                </div>
              </div>
              <GameButton
                size="sm"
                variant="primary-gold"
                disabled={benchBusy || !data}
                onClick={handleRunBench}
              >
                {benchBusy ? '計測中…' : 'Rust 200試合ベンチマーク実行'}
              </GameButton>
            </div>

            {benchResult && (
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  padding: '8px 10px',
                  borderRadius: 10,
                  background: '#fbf3dc',
                  border: '1px solid #d4bc7d',
                }}
                className="tabular"
              >
                完了 {benchResult.elapsedMs.toFixed(1)} ms ・ P1勝 {benchResult.p1Wins} / P2勝{' '}
                {benchResult.p2Wins}（引分 {benchResult.draws}）・ 平均 {benchResult.avgTurns.toFixed(1)} ターン
              </div>
            )}
            {benchError && (
              <div style={{ fontSize: 12, fontWeight: 800, color: '#a52a2a' }}>
                計測エラー: {benchError}
              </div>
            )}
          </div>
        </ParchmentSheet>
      </div>
    </section>
  );
}
