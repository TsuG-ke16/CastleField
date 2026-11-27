import { useMemo, useState } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { getSkinPreviewImage } from '../engine/skinUtils';
import { GameButton, RoundButton } from '../components/ui/GameButton';
import { PaintedIcon } from '../components/ui/PaintedIcon';
import styles from './ShopScreen.module.css';

const CATEGORIES = [
  { id: 'all', label: 'すべて' },
  { id: 'unit', label: '兵士スキン' },
  { id: 'castle', label: '城の外観' },
  { id: 'charSkin', label: 'キャラ' },
  { id: 'spellSkin', label: '魔法' },
  { id: 'cardBack', label: 'カード裏面' },
  { id: 'iconFrame', label: 'フレーム' },
];

export function ShopScreen() {
  const {
    data,
    coins,
    points,
    ownedSkins,
    selectedCastleSkin,
    selectedSoldierSkin,
    selectedBackSkin,
    buyShopItem,
    equipSkin,
  } = useAppStore();
  const [usePoints, setUsePoints] = useState(false);
  const [category, setCategory] = useState('all');
  const [showFilter, setShowFilter] = useState(false);
  const [query, setQuery] = useState('');
  const [affordableOnly, setAffordableOnly] = useState(false);

  const items = useMemo(() => {
    const raw = data?.shop;
    const list = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.items)
        ? raw.items
        : Object.entries(raw?.items || {}).map(([id, v]) => ({ id, ...v }));
    return list.filter((it) => {
      const cat = String(it.slot || it.category || '');
      if (category !== 'all' && cat !== category && !String(it.id || '').includes(category)) {
        return false;
      }
      if (query.trim() && !String(it.name || '').toLowerCase().includes(query.trim().toLowerCase())) {
        return false;
      }
      const price = usePoints ? (it.pointCost ?? 150) : (it.price ?? 300);
      if (affordableOnly && (usePoints ? points < price : coins < price)) return false;
      return true;
    });
  }, [data, category, query, affordableOnly, usePoints, coins, points]);

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
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800 }}>
            <input
              type="checkbox"
              checked={affordableOnly}
              onChange={(e) => setAffordableOnly(e.target.checked)}
            />
            いま買えるものだけ
          </label>
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
        {items.map((item) => {
          const owned = ownedSkins.includes(item.id);
          const price = usePoints ? (item.pointCost ?? 150) : (item.price ?? 300);
          const canBuy = !owned && (usePoints ? points >= price : coins >= price);
          const slot = String(item.slot || item.category || item.id);
          const previewImg = getSkinPreviewImage(slot);
          const filterCss = item.filters?.blue;
          const equipKind =
            slot === 'castle' || item.id.startsWith('castle')
              ? 'castle'
              : slot === 'cardBack' || item.id.includes('back')
                ? 'back'
                : slot === 'unit' || item.id.startsWith('unit')
                  ? 'soldier'
                  : null;
          const isEquipped =
            selectedCastleSkin === item.id ||
            selectedSoldierSkin === item.id ||
            selectedBackSkin === item.id;

          return (
            <div key={item.id} className={styles.itemCard}>
              <span className={styles.rarityTag}>{item.rarity || 'common'}</span>
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
                  onClick={() => equipSkin(equipKind, item.id)}
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
                  {owned ? '所持済み' : usePoints ? `交換 ${price}pt` : `買う ${price}`}
                </GameButton>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
