import { computePlayerProgression, countClaimableMissions, useAppStore } from '../../stores/useAppStore';
import { FramedAvatar } from '../ui/FramedAvatar';
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

export function TopBar({
  onOpenNotice,
  onOpenProfile,
}: {
  onOpenNotice?: () => void;
  onOpenProfile?: () => void;
}) {
  const { coins, setTab, playerName, avatarCardType, stats, selectedIconFrame } = useAppStore();
  const prog = computePlayerProgression(stats);

  return (
    <header className={styles.topBar}>
      <button
        type="button"
        className={styles.profilePill}
        onClick={onOpenProfile}
        aria-label="プレイヤープロフィール"
      >
        {/* 枠はアイコンより大きいので、付けているときは名前とのあいだを空ける */}
        <span style={{ display: 'inline-flex', margin: selectedIconFrame ? '0 10px 0 6px' : 0 }}>
          <FramedAvatar cardType={avatarCardType} frameId={selectedIconFrame} size={38} className={styles.avatar} />
        </span>
        <div className={styles.playerMeta}>
          <span className={styles.playerName}>{playerName}</span>
          <span className={styles.playerRank}>Lv.{prog.level} {prog.title}</span>
        </div>
      </button>

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
  const { tab, setTab, data, stats, ownedSkins, unlockedSkills, claimedMissions } = useAppStore();
  const claimableMissions = countClaimableMissions(data, stats, ownedSkins, unlockedSkills, claimedMissions);

  return (
    <nav className={styles.bottomDock} aria-label="メインナビゲーション">
      {NAV_ITEMS.map((item) => {
        const active = tab === item.id;
        const badgeCount = item.id === 'menu' ? claimableMissions : 0;
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
            {badgeCount > 0 && (
              <span className={styles.badge} aria-label={`受取可能な報酬 ${badgeCount}件`}>
                {badgeCount}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
