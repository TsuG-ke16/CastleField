import { useAppStore } from '../../stores/useAppStore';
import type { AppTab } from '../../engine/types';
import { PaintedIcon, type PaintedIconName } from '../ui/PaintedIcon';
import { RoundButton } from '../ui/GameButton';
import styles from './NavChrome.module.css';

const NAV_ITEMS: Array<{ id: AppTab; label: string; icon: PaintedIconName }> = [
  { id: 'deck', label: 'デッキ', icon: 'deck' },
  { id: 'gacha', label: 'ガチャ', icon: 'gacha' },
  { id: 'battle', label: 'バトル', icon: 'battle' },
  { id: 'shop', label: 'ショップ', icon: 'shop' },
  { id: 'menu', label: 'メニュー', icon: 'settings' },
];

export function TopBar({ onOpenNotice }: { onOpenNotice?: () => void }) {
  const { coins, setTab } = useAppStore();

  return (
    <header className={styles.topBar}>
      <div className={styles.profilePill}>
        <img
          src="/assets/cards/card-infantry.png"
          alt="アバター"
          className={styles.avatar}
        />
        <div className={styles.playerMeta}>
          <span className={styles.playerName}>王国の領主</span>
          <span className={styles.playerRank}>Lv.1 見習い兵</span>
        </div>
      </div>

      <div className={styles.rightGroup}>
        <button
          type="button"
          className={`${styles.coinChip} tabular`}
          onClick={() => setTab('shop')}
          aria-label="所持コイン・ショップへ"
        >
          <PaintedIcon name="coin" size={18} />
          <span>{coins.toLocaleString()}</span>
        </button>
        <RoundButton tone="stone" onClick={onOpenNotice} aria-label="お知らせ">
          <PaintedIcon name="bell" size={22} />
        </RoundButton>
      </div>
    </header>
  );
}

export function BottomNav() {
  const { tab, setTab } = useAppStore();

  return (
    <nav className={styles.bottomDock} aria-label="メインナビゲーション">
      {NAV_ITEMS.map((item) => {
        const active = tab === item.id;
        return (
          <button
            key={item.id}
            type="button"
            aria-current={active ? 'page' : undefined}
            className={`${styles.navTab} ${active ? styles.navTabActive : ''}`}
            onClick={() => setTab(item.id)}
          >
            <PaintedIcon name={item.icon} size={24} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
