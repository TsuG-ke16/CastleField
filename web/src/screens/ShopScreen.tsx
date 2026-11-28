import { useMemo, useState } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { getSkinPreviewImage } from '../engine/skinUtils';
import { GameButton, RoundButton } from '../components/ui/GameButton';
import { PaintedIcon } from '../components/ui/PaintedIcon';
import styles from './ShopScreen.module.css';
import { iconFrameImage } from '../components/ui/FramedAvatar';

const CATEGORIES = [
  { id: 'all', label: 'すべて' },
  { id: 'unit', label: '兵士スキン' },
  { id: 'castle', label: '城の外観' },
  { id: 'charSkin', label: 'キャラ' },
  { id: 'spellSkin', label: '魔法' },
  { id: 'cardBack', label: 'カード裏面' },
  { id: 'iconFrame', label: 'フレーム' },
];

const RARITY_META: Record<string, { label: string; rank: number }> = {
  common: { label: 'コモン', rank: 1 },
  uncommon: { label: 'アンコモン', rank: 2 },
  rare: { label: 'レア', rank: 3 },
  epic: { label: 'エピック', rank: 4 },
  legendary: { label: 'レジェンド', rank: 5 },
};

type ShopSortMode = 'default' | 'priceAsc' | 'priceDesc' | 'rarityDesc';

export function ShopScreen() {
  const {
    data,
    coins,
    points,
    ownedSkins,
    selectedCastleSkin,
    selectedSoldierSkin,
    selectedBackSkin,
    selectedIconFrame,
    buyShopItem,
    equipSkin,
  } = useAppStore();
  const [usePoints, setUsePoints] = useState(false);
  const [category, setCategory] = useState('all');
  const [showFilter, setShowFilter] = useState(false);
  const [query, setQuery] = useState('');
  const [affordableOnly, setAffordableOnly] = useState(false);
  const [sortBy, setSortBy] = useState<ShopSortMode>('default');

  const items = useMemo(() => {
    const raw = data?.shop;
    const list = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.items)
        ? raw.items
        : Object.entries(raw?.items || {}).map(([id, v]) => ({ id, ...v }));
    const filtered = list.filter((it) => {
      const cat = String(it.slot || it.category || '');
      if (category !== 'all' && cat !== category && !String(it.id || '').includes(category)) {
        return false;
      }
      if (query.trim() && !String(it.name || '').toLowerCase().includes(query.trim().toLowerCase())) {
        return false;
      }
      const price = usePoints ? (it.pointCost ?? 150) : (it.price ?? 300);
      if (affordableOnly && (it.price === null || (usePoints ? points < price : coins < price))) return false;
      return true;
    });
    if (sortBy === 'default') return filtered;
    const itemPrice = (it: (typeof list)[number], fallback: number): number => {
      if (it.price === null) return fallback;
      return usePoints ? (it.pointCost ?? 150) : (it.price ?? 300);
    };
    return [...filtered].sort((a, b) => {
      if (sortBy === 'priceAsc') return itemPrice(a, Number.MAX_SAFE_INTEGER) - itemPrice(b, Number.MAX_SAFE_INTEGER);
      if (sortBy === 'priceDesc') return itemPrice(b, -1) - itemPrice(a, -1);
      const ra = RARITY_META[String(a.rarity || 'common').toLowerCase()]?.rank ?? 0;
      const rb = RARITY_META[String(b.rarity || 'common').toLowerCase()]?.rank ?? 0;
      return rb - ra;
    });
  }, [data, category, query, affordableOnly, usePoints, coins, points, sortBy]);

  return (
    <section className={styles.page} aria-label="王国ショップ">
      <div className={styles.topControls}>
        <div className={styles.modeSwitch}>
          <GameButton
            size="sm"
            variant={!usePoints ? 'selected-royal' : 'normal-stone'}
            onClick={() => setUsePoints(false)}
          >
            コイン購入
          </GameButton>
          <GameButton
            size="sm"
            variant={usePoints ? 'selected-royal' : 'normal-stone'}
            onClick={() => setUsePoints(true)}
          >
            ポイント交換
          </GameButton>
        </div>

        <RoundButton
          tone={showFilter ? 'gold' : 'stone'}
          onClick={() => setShowFilter((v) => !v)}
          aria-label="検索・絞り込み"
        >
          <PaintedIcon name="filter" size={20} />
        </RoundButton>
      </div>

      {showFilter && (
        <div className={styles.filterDrawer}>
          <input
            type="search"
            className={styles.searchInput}
            placeholder="名前で探す…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            aria-label="並び替え"
            className={styles.sortSelect}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as ShopSortMode)}
          >
            <option value="default">おすすめ順</option>
            <option value="priceAsc">価格が安い順</option>
            <option value="priceDesc">価格が高い順</option>
            <option value="rarityDesc">レア度が高い順</option>
          </select>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800 }}>
            <input
              type="checkbox"
              checked={affordableOnly}
              onChange={(e) => setAffordableOnly(e.target.checked)}
            />
            いま買えるものだけ
          </label>
          <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 900, alignSelf: 'center', color: 'var(--cf-ink-muted)' }} className="tabular">
            表示 {items.length}件 ・ 所持 {ownedSkins.length}件
          </span>
        </div>
      )}

      <div className={styles.catStrip} role="tablist" aria-label="ショップカテゴリ">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`${styles.catChip} ${category === c.id ? styles.catChipActive : ''}`}
            onClick={() => setCategory(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className={styles.grid}>
        {items.length === 0 ? (
          <div
            className={styles.itemCard}
            style={{ gridColumn: '1 / -1', padding: 20, gap: 10 }}
          >
            <strong style={{ fontSize: 14 }}>条件に合うアイテムがありません</strong>
            <GameButton
              size="sm"
              variant="primary-gold"
              onClick={() => {
                setCategory('all');
                setQuery('');
                setAffordableOnly(false);
                setSortBy('default');
              }}
            >
              絞り込みをリセット
            </GameButton>
          </div>
        ) : (
          items.map((item) => {
            const owned = ownedSkins.includes(item.id);
            const price = usePoints ? (item.pointCost ?? 150) : (item.price ?? 300);
            // price が null の品は売り物でない（以前は 300 で買えてしまった）
            const notForSale = item.price === null;
            const canBuy = !owned && !notForSale && (usePoints ? points >= price : coins >= price);
            const slot = String(item.slot || item.category || item.id);
            const previewImg = iconFrameImage(item.id) ?? getSkinPreviewImage(slot);
            const filterCss = item.filters?.blue;
            const rk = String(item.rarity || 'common').toLowerCase();
            const rarityInfo = RARITY_META[rk];
            const equipKind =
              slot === 'iconFrame'
                ? 'frame'
                : slot === 'castle' || item.id.startsWith('castle')
                ? 'castle'
                : slot === 'cardBack' || item.id.includes('back')
                  ? 'back'
                  : slot === 'unit' || item.id.startsWith('unit')
                    ? 'soldier'
                    : null;
            const isEquipped =
              selectedCastleSkin === item.id ||
              selectedSoldierSkin === item.id ||
              selectedBackSkin === item.id ||
              selectedIconFrame === item.id;

            return (
              <div key={item.id} className={styles.itemCard}>
                <span className={`${styles.rarityTag} ${styles[`rarity-${rk}`] || ''}`}>
                  {rarityInfo?.label || rk}
                </span>
              <img
                src={previewImg}
                alt={item.name}
                style={{
                  width: 54,
                  height: 54,
                  objectFit: 'contain',
                  filter: filterCss,
                }}
              />
              <div className={styles.itemName}>{item.name}</div>
              {(item.desc || item.description) && (
                <div style={{ fontSize: 10, color: 'var(--cf-ink-muted)', fontWeight: 700, textAlign: 'center', lineHeight: 1.35 }}>
                  {item.desc || item.description}
                </div>
              )}
              {owned && equipKind ? (
                <GameButton
                  size="sm"
                  fullWidth
                  variant={isEquipped ? 'selected-royal' : 'normal-stone'}
                  onClick={() =>
                    equipKind === 'frame' && isEquipped ? equipSkin('frame', null) : equipSkin(equipKind, item.id)
                  }
                >
                  {isEquipped ? '装備中' : '装備する'}
                </GameButton>
              ) : (
                <GameButton
                  size="sm"
                  fullWidth
                  variant={owned ? 'normal-stone' : canBuy ? 'primary-gold' : 'normal-stone'}
                  disabled={!canBuy}
                  onClick={() => buyShopItem(item.id, price, usePoints)}
                >
                  {owned
                    ? '所持済み'
                    : notForSale
                      ? item.rankReward
                        ? 'ランク報酬'
                        : 'ガチャで入手'
                      : usePoints
                        ? `交換 ${price}pt`
                        : `買う ${price}`}
                </GameButton>
              )}
            </div>
          );
        }))}
      </div>
    </section>
  );
}
