import { useMemo, useState } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { cardTypeToImagePath } from '../engine/dataLoader';
import { decodeDeckCode, encodeDeckCode } from '../engine/deckCode';
import { GameCard } from '../components/ui/GameCard';
import { GameButton, RoundButton } from '../components/ui/GameButton';
import { PaintedIcon } from '../components/ui/PaintedIcon';
import { ParchmentSheet } from '../components/ui/Surfaces';
import styles from './DeckScreen.module.css';

const KIND_FILTERS: Array<{ id: string; label: string }> = [
  { id: 'all', label: 'すべて' },
  { id: 'soldier', label: '兵士' },
  { id: 'spell', label: '魔法' },
  { id: 'weapon', label: '武器' },
  { id: 'defense', label: '防御' },
];

const RARITY_FILTERS: Array<{ id: string; label: string }> = [
  { id: 'all', label: '全レア' },
  { id: 'common', label: 'C' },
  { id: 'uncommon', label: 'UC' },
  { id: 'rare', label: 'R' },
  { id: 'epic', label: 'SR' },
  { id: 'legendary', label: 'UR' },
];

export function DeckScreen() {
  const {
    data,
    selectedDeckId,
    setSelectedDeckId,
    customDeck,
    customDecks,
    activeCustomSlot,
    selectCustomSlot,
    renameCustomDeck,
    clonePresetToCustomDeck,
    updateCustomDeckCard,
    resetCustomDeck,
    importCustomDeck,
    setTab,
  } = useAppStore();

  const [subMode, setSubMode] = useState<'deck' | 'catalog'>('deck');
  const [kindFilter, setKindFilter] = useState('all');
  const [rarityFilter, setRarityFilter] = useState('all');
  const [inDeckOnly, setInDeckOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [inspectType, setInspectType] = useState<string | null>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, gx: 50, gy: 50, active: false });
  const [shareOpen, setShareOpen] = useState(false);
  const [importDraft, setImportDraft] = useState('');
  const [shareStatus, setShareStatus] = useState<string | null>(null);

  const decks = data?.decks || {};
  const cards = data?.cards || {};
  const rarities = data?.rarities || {};

  const deckKeysList = Object.keys(decks);
  const isCustom = selectedDeckId === 'custom';
  const activeCardsMap: Record<string, number> = isCustom
    ? customDeck
    : (decks[selectedDeckId] || decks[deckKeysList[0]] || { cards: {} }).cards;
  const activeCustomName = customDecks[activeCustomSlot]?.name || `デッキ${activeCustomSlot + 1}`;
  const activeDeckName = isCustom
    ? `★ ${activeCustomName}`
    : (decks[selectedDeckId] || decks[deckKeysList[0]])?.name || 'デッキ';

  const cardDeckCost = (typeKey: string): number => {
    const r = cards[typeKey]?.rarity || 'common';
    return rarities[r]?.deckCost ?? 1;
  };

  const stats = useMemo(() => {
    const entries = Object.entries(activeCardsMap);
    let total = 0;
    let totalCost = 0;
    const kinds = { soldier: 0, spell: 0, weapon: 0, defense: 0 };
    const rarityCounts: Record<string, number> = {
      common: 0,
      uncommon: 0,
      rare: 0,
      epic: 0,
      legendary: 0,
    };
    for (const [k, count] of entries) {
      total += count;
      totalCost += cardDeckCost(k) * count;
      const def = cards[k];
      if (def) {
        if (def.kind in kinds) kinds[def.kind] += count;
        const rk = def.rarity || 'common';
        rarityCounts[rk] = (rarityCounts[rk] ?? 0) + count;
      }
    }
    return { entries, total, totalCost, kinds, rarityCounts };
  }, [activeCardsMap, cards, rarities]);

  const filteredCatalog = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.entries(cards).filter(([key, def]) => {
      if (kindFilter !== 'all' && def.kind !== kindFilter) return false;
      if (rarityFilter !== 'all' && (def.rarity || 'common') !== rarityFilter) return false;
      if (q) {
        const hay = `${def.name} ${key} ${def.description || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [cards, kindFilter, rarityFilter, query]);

  const deckEditorCards = useMemo(() => {
    if (!inDeckOnly) return filteredCatalog;
    return filteredCatalog.filter(([key]) => (customDeck[key] ?? 0) > 0);
  }, [filteredCatalog, inDeckOnly, customDeck]);

  const fusionChain = useMemo(() => {
    if (!inspectType || !cards[inspectType]) return [];
    const reverseMap = new Map<string, string>();
    for (const [k, d] of Object.entries(cards)) {
      if (d.fuseTo && !reverseMap.has(d.fuseTo)) {
        reverseMap.set(d.fuseTo, k);
      }
    }
    const chain: string[] = [inspectType];
    const seen = new Set(chain);
    let prev = reverseMap.get(inspectType);
    while (prev && !seen.has(prev)) {
      chain.unshift(prev);
      seen.add(prev);
      prev = reverseMap.get(prev);
    }
    let next = cards[inspectType]?.fuseTo;
    while (next && cards[next] && !seen.has(next)) {
      chain.push(next);
      seen.add(next);
      next = cards[next]?.fuseTo;
    }
    return chain;
  }, [inspectType, cards]);

  const totalCatalogCount = Object.keys(cards).length;
  const inspectedDef = inspectType ? cards[inspectType] : null;

  return (
    <section className={styles.page} aria-label="デッキと図鑑">
      <div className={styles.topTabRow}>
        <div style={{ display: 'flex', gap: 6 }}>
          <GameButton
            size="sm"
            variant={subMode === 'deck' ? 'selected-royal' : 'normal-stone'}
            onClick={() => setSubMode('deck')}
          >
            <PaintedIcon name="deck" size={16} />
            <span>デッキ編成</span>
          </GameButton>
          <GameButton
            size="sm"
            variant={subMode === 'catalog' ? 'selected-royal' : 'normal-stone'}
            onClick={() => setSubMode('catalog')}
          >
            <PaintedIcon name="catalog" size={16} />
            <span>カード図鑑 ({totalCatalogCount})</span>
          </GameButton>
        </div>
      </div>

      {subMode === 'deck' && (
        <>
          <div className={styles.deckStrip}>
            <GameButton
              size="sm"
              variant={isCustom ? 'selected-royal' : 'normal-stone'}
              onClick={() => setSelectedDeckId('custom')}
            >
              ★ {activeCustomName}
            </GameButton>
            {Object.entries(decks).map(([id, d]) => (
              <GameButton
                key={id}
                size="sm"
                variant={selectedDeckId === id ? 'selected-royal' : 'normal-stone'}
                onClick={() => setSelectedDeckId(id)}
              >
                {d.name}
              </GameButton>
            ))}
          </div>

          {isCustom && (
            <div className={styles.slotStrip} aria-label="マイデッキ枠">
              {customDecks.map((slot, i) => (
                <GameButton
                  key={i}
                  size="sm"
                  variant={activeCustomSlot === i ? 'selected-royal' : 'normal-stone'}
                  onClick={() => selectCustomSlot(i)}
                >
                  {slot.name || `デッキ${i + 1}`}
                </GameButton>
              ))}
            </div>
          )}

          <div className={styles.layout}>
            <ParchmentSheet className={styles.summaryCol}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                {isCustom ? (
                  <input
                    type="text"
                    className={styles.renameInput}
                    value={activeCustomName}
                    maxLength={14}
                    aria-label="デッキ名を変更"
                    onChange={(e) => renameCustomDeck(activeCustomSlot, e.target.value)}
                  />
                ) : (
                  <strong style={{ fontSize: 15 }}>{activeDeckName}</strong>
                )}
                <span className="tabular" style={{ fontWeight: 900, fontSize: 13, flexShrink: 0 }}>
                  {stats.total}枚 / コスト {stats.totalCost}
                </span>
              </div>

              <div className={styles.balanceBox}>
                <div className={styles.barRow}>
                  <span>コスト</span>
                  <div className={styles.barTrack}>
                    <div
                      className={styles.barFill}
                      style={{
                        width: `${Math.min(100, stats.totalCost)}%`,
                        background: stats.totalCost > 100 ? '#de4f46' : '#ffb833',
                      }}
                    />
                  </div>
                  <span className="tabular">{stats.totalCost}/100</span>
                </div>

                {/* デッキ構成グラフ（種別比率＋レアリティ別分布） */}
                <div className={styles.stackedBar} title="種別比率">
                  {[
                    { key: 'soldier', val: stats.kinds.soldier, color: '#3465cc' },
                    { key: 'spell', val: stats.kinds.spell, color: '#de4f46' },
                    { key: 'weapon', val: stats.kinds.weapon, color: '#e4881a' },
                    { key: 'defense', val: stats.kinds.defense, color: '#4ea85f' },
                  ].map((seg) => (
                    <div
                      key={seg.key}
                      className={styles.stackedSeg}
                      style={{
                        width: `${stats.total ? (seg.val / stats.total) * 100 : 0}%`,
                        background: seg.color,
                      }}
                    />
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 800 }}>
                  <span style={{ color: '#3465cc' }}>■兵士 {stats.kinds.soldier}</span>
                  <span style={{ color: '#de4f46' }}>■魔法 {stats.kinds.spell}</span>
                  <span style={{ color: '#e4881a' }}>■武器 {stats.kinds.weapon}</span>
                  <span style={{ color: '#4ea85f' }}>■防御 {stats.kinds.defense}</span>
                </div>

                <div className={styles.rarityDistRow} aria-label="レアリティ別枚数グラフ">
                  {[
                    { id: 'common', label: 'C' },
                    { id: 'uncommon', label: 'UC' },
                    { id: 'rare', label: 'R' },
                    { id: 'epic', label: 'SR' },
                    { id: 'legendary', label: 'UR' },
                  ].map((rk) => {
                    const cnt = stats.rarityCounts[rk.id] ?? 0;
                    const maxR = Math.max(1, ...Object.values(stats.rarityCounts));
                    return (
                      <div key={rk.id} className={styles.rarityBarCol}>
                        <span className="tabular">{cnt}</span>
                        <div className={styles.rarityBarTrack}>
                          <div
                            className={styles.rarityBarFill}
                            style={{ height: `${Math.round((cnt / maxR) * 100)}%` }}
                          />
                        </div>
                        <span>{rk.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <GameButton variant="primary-gold" size="sm" style={{ flex: 1 }} onClick={() => setTab('battle')}>
                  このデッキで戦う
                </GameButton>
                {!isCustom ? (
                  <GameButton
                    variant="normal-stone"
                    size="sm"
                    onClick={() => clonePresetToCustomDeck(selectedDeckId)}
                  >
                    複製して編集
                  </GameButton>
                ) : (
                  <GameButton variant="normal-stone" size="sm" onClick={resetCustomDeck}>
                    初期に戻す
                  </GameButton>
                )}
                <GameButton
                  variant="normal-stone"
                  size="sm"
                  onClick={() => {
                    setShareOpen(true);
                    setShareStatus(null);
                  }}
                >
                  共有コード
                </GameButton>
              </div>
              {isCustom && stats.totalCost > 100 && (
                <div style={{ fontSize: 11, fontWeight: 900, color: '#a82a24', background: '#fde8e8', border: '1.5px solid #de4f46', borderRadius: 8, padding: '4px 8px' }}>
                  コスト上限(100)を超えています（現在 {stats.totalCost}）。カードを減らしてください。
                </div>
              )}
              {isCustom && stats.total === 0 && (
                <div style={{ fontSize: 11, fontWeight: 900, color: '#8a562d', background: '#fff3cd', border: '1.5px solid #d4a64a', borderRadius: 8, padding: '4px 8px' }}>
                  カードが0枚です。1枚以上追加してください。
                </div>
              )}
            </ParchmentSheet>

            {isCustom ? (
              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className={styles.filterRow}>
                  <input
                    type="search"
                    className={styles.searchInput}
                    placeholder="カード名で検索…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  {KIND_FILTERS.map((k) => (
                    <button
                      key={k.id}
                      type="button"
                      className={`${styles.chip} ${kindFilter === k.id ? styles.chipActive : ''}`}
                      onClick={() => setKindFilter(k.id)}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
                <div className={styles.filterRow}>
                  <button
                    type="button"
                    className={`${styles.chip} ${inDeckOnly ? styles.chipActive : ''}`}
                    onClick={() => setInDeckOnly((v) => !v)}
                  >
                    採用中のみ ({stats.entries.length}種)
                  </button>
                  {RARITY_FILTERS.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className={`${styles.chip} ${rarityFilter === r.id ? styles.chipActive : ''}`}
                      onClick={() => setRarityFilter(r.id)}
                    >
                      {r.label}
                    </button>
                  ))}
                  <span
                    style={{
                      marginLeft: 'auto',
                      fontSize: 11,
                      fontWeight: 900,
                      padding: '2px 9px',
                      borderRadius: 999,
                      background: 'rgba(255, 248, 228, 0.94)',
                      border: '1.5px solid #4a2e1a',
                      boxShadow: '0 2px 0 rgba(74, 46, 26, 0.22)',
                    }}
                    className="tabular"
                  >
                    {deckEditorCards.length} 件
                  </span>
                </div>

                <div className={styles.cardsCol}>
                  {deckEditorCards.map(([typeKey, def]) => {
                    const cnt = customDeck[typeKey] ?? 0;
                    return (
                      <div key={typeKey} className={styles.cardTile}>
                        <GameCard
                          typeKey={typeKey}
                          card={def}
                          selected={cnt > 0}
                          countBadge={cnt > 0 ? cnt : undefined}
                          onClick={() => setInspectType(typeKey)}
                        />
                        <div className={styles.stepControls}>
                          <button
                            type="button"
                            className={styles.stepBtn}
                            disabled={cnt <= 0}
                            aria-label={`${def.name}を減らす`}
                            onClick={() => updateCustomDeckCard(typeKey, -1)}
                          >
                            -
                          </button>
                          <span className="tabular">
                            {cnt}枚 (C{cardDeckCost(typeKey)})
                          </span>
                          <button
                            type="button"
                            className={styles.stepBtn}
                            disabled={cnt >= 6}
                            aria-label={`${def.name}を増やす`}
                            onClick={() => updateCustomDeckCard(typeKey, 1)}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className={styles.cardsCol}>
                {stats.entries.map(([typeKey, count]) => {
                  const def = cards[typeKey];
                  if (!def) return null;
                  return (
                    <GameCard
                      key={typeKey}
                      typeKey={typeKey}
                      card={def}
                      countBadge={count}
                      onClick={() => setInspectType(typeKey)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {subMode === 'catalog' && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className={styles.filterRow}>
            <input
              type="search"
              className={styles.searchInput}
              placeholder="全カードから検索…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {KIND_FILTERS.map((k) => (
              <button
                key={k.id}
                type="button"
                className={`${styles.chip} ${kindFilter === k.id ? styles.chipActive : ''}`}
                onClick={() => setKindFilter(k.id)}
              >
                {k.label}
              </button>
            ))}
          </div>
          <div className={styles.filterRow}>
            {RARITY_FILTERS.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`${styles.chip} ${rarityFilter === r.id ? styles.chipActive : ''}`}
                onClick={() => setRarityFilter(r.id)}
              >
                {r.label}
              </button>
            ))}
            <span
              style={{
                marginLeft: 'auto',
                fontSize: 12,
                fontWeight: 900,
                padding: '2px 9px',
                borderRadius: 999,
                background: 'rgba(255, 248, 228, 0.94)',
                border: '1.5px solid #4a2e1a',
                boxShadow: '0 2px 0 rgba(74, 46, 26, 0.22)',
              }}
              className="tabular"
            >
              {filteredCatalog.length} 件
            </span>
          </div>

          <div className={styles.cardsCol}>
            {filteredCatalog.map(([typeKey, def]) => (
              <GameCard
                key={typeKey}
                typeKey={typeKey}
                card={def}
                countBadge={customDeck[typeKey] || undefined}
                onClick={() => setInspectType(typeKey)}
              />
            ))}
          </div>
        </div>
      )}

      {inspectType && inspectedDef && (
        <div className={styles.modalBackdrop} onClick={() => setInspectType(null)}>
          <div style={{ width: '100%', maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <ParchmentSheet style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <strong style={{ fontSize: 17 }}>{inspectedDef.name}</strong>
                <RoundButton onClick={() => setInspectType(null)} aria-label="閉じる">
                  <PaintedIcon name="close" size={16} />
                </RoundButton>
              </div>

              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div
                  className={styles.tiltWrap}
                  onPointerMove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const px = (e.clientX - rect.left) / rect.width;
                    const py = (e.clientY - rect.top) / rect.height;
                    setTilt({
                      rx: (0.5 - py) * 24,
                      ry: (px - 0.5) * 24,
                      gx: Math.round(px * 100),
                      gy: Math.round(py * 100),
                      active: true,
                    });
                  }}
                  onPointerLeave={() => setTilt({ rx: 0, ry: 0, gx: 50, gy: 50, active: false })}
                  style={{
                    transform: `perspective(560px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) scale(${tilt.active ? 1.04 : 1})`,
                  }}
                >
                  <img
                    src={cardTypeToImagePath(inspectType)}
                    alt={inspectedDef.name}
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                  {(inspectedDef.rarity === 'rare' ||
                    inspectedDef.rarity === 'epic' ||
                    inspectedDef.rarity === 'legendary') && (
                    <div
                      className={styles.holoSheen}
                      style={{
                        background: `radial-gradient(circle at ${tilt.gx}% ${tilt.gy}%, rgba(255,244,170,0.65), rgba(110,220,255,0.28) 45%, transparent 72%)`,
                      }}
                    />
                  )}
                </div>
                <div style={{ flex: 1, fontSize: 12, fontWeight: 800, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div>種別: {KIND_FILTERS.find((k) => k.id === inspectedDef.kind)?.label || inspectedDef.kind}</div>
                  <div>レア度: {rarities[inspectedDef.rarity || 'common']?.name || inspectedDef.rarity || 'コモン'}（編成コスト {cardDeckCost(inspectType)}）</div>
                  {inspectedDef.mpCost !== undefined && <div>消費MP: {inspectedDef.mpCost}</div>}
                  {inspectedDef.kind === 'soldier' && (
                    <div>
                      攻撃 {inspectedDef.attack ?? 0} / HP {inspectedDef.hp ?? 0}
                      {inspectedDef.range && inspectedDef.range > 1
                        ? ` / 射程 ${inspectedDef.range}`
                        : ` / 速度 ${inspectedDef.speed ?? 1}`}
                    </div>
                  )}
                </div>
              </div>

              {inspectedDef.description && (
                <p style={{ margin: 0, fontSize: 12, fontWeight: 700, lineHeight: 1.55, background: '#fbf3dc', padding: 8, borderRadius: 10 }}>
                  {inspectedDef.description}
                </p>
              )}

              {fusionChain.length > 1 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 4 }}>合成進化ルート</div>
                  <div className={styles.chainRow}>
                    {fusionChain.map((cid, idx) => {
                      const d = cards[cid];
                      if (!d) return null;
                      return (
                        <div key={cid} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <button
                            type="button"
                            className={`${styles.chainNode} ${cid === inspectType ? styles.chainNodeActive : ''}`}
                            onClick={() => setInspectType(cid)}
                          >
                            <img
                              src={cardTypeToImagePath(cid)}
                              alt={d.name}
                              style={{ width: 34, height: 34, objectFit: 'contain' }}
                            />
                            <span>{d.name}</span>
                          </button>
                          {idx < fusionChain.length - 1 && <span style={{ fontWeight: 900 }}>→</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(customDeck[inspectType] ?? 0) > 0 && (
                  <GameButton
                    size="sm"
                    variant="normal-stone"
                    onClick={() => updateCustomDeckCard(inspectType, -1)}
                  >
                    -1
                  </GameButton>
                )}
                <GameButton
                  size="sm"
                  variant="normal-stone"
                  style={{ flex: '1 1 160px', minWidth: 0 }}
                  disabled={(customDeck[inspectType] ?? 0) >= 6}
                  onClick={() => updateCustomDeckCard(inspectType, 1)}
                >
                  ★ {activeCustomName} に追加 ({customDeck[inspectType] ?? 0}枚)
                </GameButton>
                <GameButton size="sm" variant="primary-gold" onClick={() => setInspectType(null)}>
                  閉じる
                </GameButton>
              </div>
            </ParchmentSheet>
          </div>
        </div>
      )}

      {shareOpen && (
        <div className={styles.modalBackdrop} onClick={() => setShareOpen(false)}>
          <div style={{ width: '100%', maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <ParchmentSheet style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <strong style={{ fontSize: 17 }}>デッキ共有コード</strong>
                <RoundButton onClick={() => setShareOpen(false)} aria-label="閉じる">
                  <PaintedIcon name="close" size={16} />
                </RoundButton>
              </div>

              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--cf-ink-muted)' }}>
                現在のデッキ（{activeDeckName}）の共有コード：
              </div>
              <textarea
                readOnly
                rows={3}
                aria-label="共有コード出力"
                value={encodeDeckCode(activeCardsMap)}
                style={{
                  width: '100%',
                  padding: 8,
                  borderRadius: 10,
                  border: '2px solid #4a2e1a',
                  background: '#fffdf7',
                  fontSize: 11,
                  fontWeight: 700,
                  resize: 'none',
                  wordBreak: 'break-all',
                }}
              />
              <GameButton
                size="sm"
                variant="normal-stone"
                fullWidth
                onClick={async () => {
                  const code = encodeDeckCode(activeCardsMap);
                  try {
                    await navigator.clipboard?.writeText(code);
                    setShareStatus('共有コードをコピーしました！');
                  } catch {
                    setShareStatus('上の枠からテキストをコピーしてください。');
                  }
                }}
              >
                コードをコピー
              </GameButton>

              <div style={{ borderTop: '1.5px dashed #c9b075', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <strong style={{ fontSize: 13 }}>共有コードを読み込む</strong>
                <textarea
                  rows={2}
                  aria-label="共有コード入力"
                  placeholder="CF2-..."
                  value={importDraft}
                  onChange={(e) => setImportDraft(e.target.value)}
                  style={{
                    width: '100%',
                    padding: 8,
                    borderRadius: 10,
                    border: '2px solid #4a2e1a',
                    background: '#fff',
                    fontSize: 12,
                    fontWeight: 700,
                    resize: 'none',
                  }}
                />
                <GameButton
                  size="sm"
                  variant="primary-gold"
                  fullWidth
                  onClick={() => {
                    const res = decodeDeckCode(importDraft, cards);
                    if (!res.ok) {
                      setShareStatus(res.reason);
                      return;
                    }
                    importCustomDeck(res.cards);
                    setImportDraft('');
                    setShareStatus(
                      res.skipped > 0
                        ? `読み込み完了！（${Object.keys(res.cards).length}種・未対応${res.skipped}件除外）`
                        : `読み込み完了！（${Object.keys(res.cards).length}種）`
                    );
                  }}
                >
                  ★ {activeCustomName} に読み込む
                </GameButton>
              </div>

              {shareStatus && (
                <div style={{ fontSize: 12, fontWeight: 900, color: '#24479b', textAlign: 'center' }} role="status">
                  {shareStatus}
                </div>
              )}
            </ParchmentSheet>
          </div>
        </div>
      )}
    </section>
  );
}
