import { useMemo, useState } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { cardTypeToImagePath } from '../engine/dataLoader';
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
    clonePresetToCustomDeck,
    updateCustomDeckCard,
    resetCustomDeck,
    setTab,
  } = useAppStore();

  const [subMode, setSubMode] = useState<'deck' | 'catalog'>('deck');
  const [kindFilter, setKindFilter] = useState('all');
  const [rarityFilter, setRarityFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [inspectType, setInspectType] = useState<string | null>(null);

  const decks = data?.decks || {};
  const cards = data?.cards || {};
  const rarities = data?.rarities || {};

  const deckKeysList = Object.keys(decks);
  const isCustom = selectedDeckId === 'custom';
  const activeCardsMap: Record<string, number> = isCustom
    ? customDeck
    : (decks[selectedDeckId] || decks[deckKeysList[0]] || { cards: {} }).cards;
  const activeDeckName = isCustom
    ? '★ オリジナルデッキ'
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
    for (const [k, count] of entries) {
      total += count;
      totalCost += cardDeckCost(k) * count;
      const def = cards[k];
      if (def && def.kind in kinds) kinds[def.kind] += count;
    }
    return { entries, total, totalCost, kinds };
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
              ★オリジナル
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

          <div className={styles.layout}>
            <ParchmentSheet className={styles.summaryCol}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: 15 }}>{activeDeckName}</strong>
                <span className="tabular" style={{ fontWeight: 900, fontSize: 13 }}>
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
                {[
                  { label: '兵士', val: stats.kinds.soldier, color: '#3465cc' },
                  { label: '魔法', val: stats.kinds.spell, color: '#de4f46' },
                  { label: '武器', val: stats.kinds.weapon, color: '#e4881a' },
                  { label: '防御', val: stats.kinds.defense, color: '#4ea85f' },
                ].map((row) => (
                  <div key={row.label} className={styles.barRow}>
                    <span>{row.label}</span>
                    <div className={styles.barTrack}>
                      <div
                        className={styles.barFill}
                        style={{
                          width: `${stats.total ? Math.round((row.val / stats.total) * 100) : 0}%`,
                          background: row.color,
                        }}
                      />
                    </div>
                    <span className="tabular">{row.val}</span>
                  </div>
                ))}
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
              </div>
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

                <div className={styles.cardsCol}>
                  {filteredCatalog.map(([typeKey, def]) => {
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
            <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 900 }} className="tabular">
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
                <img
                  src={cardTypeToImagePath(inspectType)}
                  alt={inspectedDef.name}
                  style={{ width: 84, height: 84, objectFit: 'contain', borderRadius: 12, border: '2px solid #4a2e1a', background: '#fff8e5' }}
                />
                <div style={{ flex: 1, fontSize: 12, fontWeight: 800, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div>種別: {KIND_FILTERS.find((k) => k.id === inspectedDef.kind)?.label || inspectedDef.kind}</div>
                  <div>レア度: {rarities[inspectedDef.rarity || 'common']?.name || inspectedDef.rarity || 'コモン'}（編成コスト {cardDeckCost(inspectType)}）</div>
                  {inspectedDef.mpCost !== undefined && <div>消費MP: {inspectedDef.mpCost}</div>}
                  {inspectedDef.kind === 'soldier' && (
                    <div>
                      攻撃 {inspectedDef.attack ?? 0} / HP {inspectedDef.hp ?? 0}
                      {inspectedDef.range ? ` / 射程 ${inspectedDef.range}` : ` / 速度 ${inspectedDef.speed ?? 1}`}
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

              <div style={{ display: 'flex', gap: 8 }}>
                <GameButton
                  size="sm"
                  variant="normal-stone"
                  style={{ flex: 1 }}
                  onClick={() => updateCustomDeckCard(inspectType, 1)}
                >
                  オリジナルに追加 ({customDeck[inspectType] ?? 0}枚)
                </GameButton>
                <GameButton size="sm" variant="primary-gold" onClick={() => setInspectType(null)}>
                  閉じる
                </GameButton>
              </div>
            </ParchmentSheet>
          </div>
        </div>
      )}
    </section>
  );
}
