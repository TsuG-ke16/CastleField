import { useState } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { runRustWasmBenchmark, type RustBenchmarkResult } from '../engine/wasmAdapter';
import { getSkinFilter, getSkinPreviewImage } from '../engine/skinUtils';
import { GameButton } from '../components/ui/GameButton';
import { PaintedIcon, type PaintedIconName } from '../components/ui/PaintedIcon';
import { ParchmentSheet } from '../components/ui/Surfaces';
import { transferApi } from '../engine/rankedClient';

export function MenuScreen({ onOpenSkillTree }: { onOpenSkillTree: () => void }) {
  const {
    quality,
    setQuality,
    muted,
    toggleMute,
    bgmMuted,
    toggleBgmMute,
    volume,
    setVolume,
    mulliganEnabled,
    toggleMulliganEnabled,
    reducedMotion,
    toggleReducedMotion,
    resetTutorial,
    matchHistory,
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
    walletMode,
    enableServerWallet,
    disableServerWallet,
    redeemTransferCode,
    onlineServerUrl,
  } = useAppStore();
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletNote, setWalletNote] = useState<string | null>(null);
  const [transferCode, setTransferCode] = useState<{ code: string; expiresAt: number } | null>(null);
  const [codeInput, setCodeInput] = useState('');
  const [transferNote, setTransferNote] = useState<string | null>(null);
  const [subPage, setSubPage] = useState<'main' | 'skins' | 'missions' | 'history' | 'guide'>('main');
  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null);
  const [tutorialResetNote, setTutorialResetNote] = useState(false);
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
    // ミッションの中身は data/v2/economy.json（サーバーも同じものを読んで確かめる）
    const progressOf: Record<string, number> = {
      always: 1,
      matches: stats.matchesPlayed,
      wins: stats.wins,
      gachaRolls: stats.gachaRolls,
      skins: ownedSkins.length,
      skills: unlockedSkills.length,
    };
    const missions = (data?.economy?.missions || []).map((m) => ({ ...m, cur: progressOf[m.kind] ?? 0 }));

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

  if (subPage === 'history') {
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
          gap: 10,
        }}
        aria-label="戦績・対戦履歴"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <GameButton size="sm" variant="normal-stone" onClick={() => setSubPage('main')}>
            ← メニュー
          </GameButton>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>対戦履歴（直近12戦）</h1>
        </div>

        {matchHistory.length === 0 ? (
          <ParchmentSheet style={{ textAlign: 'center', fontWeight: 800, fontSize: 13 }}>
            まだ対戦履歴がありません。バトルを終えると自動で記録されます。
          </ParchmentSheet>
        ) : (
          matchHistory.map((m) => {
            const expanded = expandedMatchId === m.id;
            const stageName = (data?.stages?.[m.stage]?.name || m.stage || '草原').split('（')[0];
            return (
              <ParchmentSheet key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 900,
                        background: m.won ? '#4ea85f' : '#a82a24',
                        color: '#fffaf0',
                      }}
                    >
                      {m.won ? '勝利' : '敗北'}
                    </span>
                    <strong style={{ fontSize: 13 }}>
                      {stageName} / {m.deckLabel}
                    </strong>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--cf-ink-muted)' }}>
                    {new Date(m.at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 800, display: 'flex', gap: 10, flexWrap: 'wrap' }} className="tabular">
                  <span>{m.turns}周</span>
                  <span>与ダメ {m.damageDealt}</span>
                  <span>札 {m.cardsPlayed}枚</span>
                  <span>魔物撃破 {m.monstersDefeated}</span>
                </div>
                {m.log.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setExpandedMatchId(expanded ? null : m.id)}
                    style={{
                      alignSelf: 'flex-start',
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      fontSize: 11,
                      fontWeight: 900,
                      color: '#24479b',
                      cursor: 'pointer',
                    }}
                  >
                    {expanded ? '▲ バトルログを閉じる' : `▼ バトルログを見る (${m.log.length}件)`}
                  </button>
                )}
                {expanded && (
                  <div
                    style={{
                      maxHeight: 150,
                      overflowY: 'auto',
                      background: '#fbf3dc',
                      border: '1.5px solid #d4bc7d',
                      borderRadius: 8,
                      padding: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 3,
                    }}
                  >
                    {m.log.map((line, i) => (
                      <div key={i}>{line}</div>
                    ))}
                  </div>
                )}
              </ParchmentSheet>
            );
          })
        )}
      </section>
    );
  }

  const menuRows: Array<{ label: string; desc: string; icon: PaintedIconName; action: () => void }> = [
    { label: 'スキン装備', desc: '持っている見た目を城や兵士に装備する', icon: 'skin', action: () => setSubPage('skins') },
    { label: 'スキル作戦図（200種）', desc: 'クラシックモードのスキルツリーを編集', icon: 'crown', action: onOpenSkillTree },
    { label: 'ランキング・実績ミッション', desc: '戦績確認とミッション報酬（コイン獲得）', icon: 'ranking', action: () => setSubPage('missions') },
    { label: '戦績・対戦履歴', desc: `直近のバトル結果とログを確認（${matchHistory.length}件）`, icon: 'mission', action: () => setSubPage('history') },
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
        <div style={{ fontSize: 13, fontWeight: 900, paddingLeft: 4 }}>お財布（コイン・所持品）</div>
        <ParchmentSheet style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 800, lineHeight: 1.6 }}>
            {walletMode === 'server'
              ? 'サーバーに保存しています（この端末のゲスト登録にひもづきます）。'
              : 'この端末に保存しています。サーバーに保存すると、コインと所持品を書きかえられなくなります。'}
          </div>
          {walletMode !== 'server' && (
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--cf-ink-muted)', lineHeight: 1.5 }}>
              切りかえると、この端末のスキンはサーバーに移ります（1回だけ。ランク報酬は除く）。コインはサーバーの初期値から始まります。CPU対戦の報酬は1日{data?.economy?.matchReward.dailyLimit ?? 10}回までです。別の端末へ引き継ぐ方法は、まだありません。
            </div>
          )}
          <GameButton
            size="sm"
            fullWidth
            variant={walletMode === 'server' ? 'normal-stone' : 'primary-gold'}
            disabled={walletBusy}
            onClick={async () => {
              if (walletMode === 'server') {
                disableServerWallet();
                setWalletNote('この端末の保存に戻しました（サーバーの記録は残ります）');
                return;
              }
              setWalletBusy(true);
              const r = await enableServerWallet();
              setWalletBusy(false);
              setWalletNote(r.ok ? 'サーバーに保存するようにしました' : r.reason || '切りかえられませんでした');
            }}
          >
            {walletBusy ? '切りかえ中…' : walletMode === 'server' ? 'この端末の保存に戻す' : 'サーバーに保存する'}
          </GameButton>
          {walletNote && <div style={{ fontSize: 12, fontWeight: 800 }}>{walletNote}</div>}

          <div style={{ borderTop: '1.5px dashed #c9b075', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <strong style={{ fontSize: 13 }}>別の端末へ引き継ぐ</strong>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--cf-ink-muted)', lineHeight: 1.5 }}>
              今の端末でコードを出し、新しい端末で入れると、サーバーのお財布とランクの続きから遊べます。コードは24時間・1回だけ。使うと、元の端末では続きを遊べなくなります。
            </div>
            {transferCode ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <span
                  className="tabular"
                  style={{ fontSize: 24, fontWeight: 900, letterSpacing: 3, userSelect: 'all' }}
                  aria-label="引き継ぎコード"
                >
                  {transferCode.code.slice(0, 5)}-{transferCode.code.slice(5)}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700 }}>
                  {new Date(transferCode.expiresAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} まで有効
                </span>
              </div>
            ) : (
              <GameButton
                size="sm"
                fullWidth
                onClick={async () => {
                  setTransferNote(null);
                  try {
                    const r = await transferApi.issue(onlineServerUrl);
                    if (r.ok && r.code && r.expiresAt) setTransferCode({ code: r.code, expiresAt: r.expiresAt });
                    else setTransferNote(r.reason || 'コードを出せませんでした');
                  } catch (e) {
                    setTransferNote(e instanceof Error ? e.message : String(e));
                  }
                }}
              >
                引き継ぎコードを出す
              </GameButton>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="text"
                inputMode="text"
                autoCapitalize="characters"
                placeholder="コードを入れる（例 ABCDE-FGH23）"
                aria-label="引き継ぎコードを入れる"
                value={codeInput}
                maxLength={16}
                onChange={(e) => setCodeInput(e.target.value)}
                style={{ flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: 10, border: '2px solid #4a2e1a', background: '#fffdf7', fontSize: 14, fontWeight: 800 }}
              />
              <GameButton
                size="sm"
                variant="primary-gold"
                disabled={codeInput.replace(/[^a-zA-Z0-9]/g, '').length < 10}
                onClick={async () => {
                  const r = await redeemTransferCode(codeInput);
                  setTransferNote(r.ok ? '引き継ぎました。サーバーのお財布で続きから遊べます' : r.reason || '引き継げませんでした');
                  if (r.ok) setCodeInput('');
                }}
              >
                引き継ぐ
              </GameButton>
            </div>
            {transferNote && <div style={{ fontSize: 12, fontWeight: 800 }}>{transferNote}</div>}
          </div>
        </ParchmentSheet>

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

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 900 }}>マスター音量 ({Math.round(volume * 100)}%)</div>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(volume * 100)}
              aria-label="マスター音量"
              onChange={(e) => setVolume(Number(e.target.value) / 100)}
              style={{ width: 130, accentColor: '#3465cc' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 900 }}>初期手札マリガン</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--cf-ink-muted)' }}>
                開始時に1回だけ手札を引き直せます
              </div>
            </div>
            <GameButton
              size="sm"
              variant={mulliganEnabled ? 'selected-royal' : 'normal-stone'}
              onClick={toggleMulliganEnabled}
            >
              {mulliganEnabled ? 'ON' : 'OFF'}
            </GameButton>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 900 }}>動きを減らす（酔い・省エネ）</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--cf-ink-muted)' }}>
                画面揺れや強い点滅演出を抑えます
              </div>
            </div>
            <GameButton
              size="sm"
              variant={reducedMotion ? 'selected-royal' : 'normal-stone'}
              onClick={toggleReducedMotion}
            >
              {reducedMotion ? 'ON' : 'OFF'}
            </GameButton>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 900 }}>初回バトルヒント</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--cf-ink-muted)' }}>
                {tutorialResetNote ? '次回のバトルでヒントを再表示します' : 'カード出し方・ターン終了ヒントをもう一度見る'}
              </div>
            </div>
            <GameButton
              size="sm"
              variant="normal-stone"
              onClick={() => {
                resetTutorial();
                setTutorialResetNote(true);
              }}
            >
              再表示
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
