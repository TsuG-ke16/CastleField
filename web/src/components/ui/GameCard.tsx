import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import type { CardDef } from '../../engine/types';
import { cardTypeToImagePath } from '../../engine/dataLoader';
import { PaintedIcon } from './PaintedIcon';
import styles from './GameCard.module.css';

interface GameCardProps {
  typeKey: string;
  card: CardDef;
  selected?: boolean;
  disabled?: boolean;
  countBadge?: number;
  width?: number;
  onClick?: () => void;
}

const KIND_LABELS: Record<CardDef['kind'], string> = {
  soldier: '兵士',
  spell: '魔法',
  weapon: '武器',
  defense: '防御',
};

export function GameCard({
  typeKey,
  card,
  selected = false,
  disabled = false,
  countBadge,
  width,
  onClick,
}: GameCardProps) {
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => {
    setImgFailed(false);
  }, [typeKey]);
  const imgSrc = imgFailed ? '/assets/cards/card-infantry.png' : cardTypeToImagePath(typeKey);
  const rarityClass = styles[`rarity-${card.rarity || 'common'}`] || styles['rarity-common'];

  return (
    <motion.div
      role="button"
      tabIndex={0}
      whileTap={disabled ? undefined : { scale: 0.95 }}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      style={width ? { width } : undefined}
      className={[
        styles.card,
        rarityClass,
        selected ? styles.selected : '',
        disabled ? styles.disabled : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className={styles.topRow}>
        <span className={`${styles.kindTag} ${styles[`kind-${card.kind}`] || ''}`}>
          {KIND_LABELS[card.kind] || card.kind}
        </span>
        {(card.mpCost ?? 0) > 0 ? (
          <span className={styles.costPill}>MP {card.mpCost}</span>
        ) : card.cost !== undefined ? (
          <span className={styles.costPill}>C{card.cost}</span>
        ) : null}
      </div>

      <div className={styles.artBox}>
        <img
          src={imgSrc}
          alt={card.name}
          className={styles.artImg}
          onError={() => {
            if (!imgFailed) {
              setImgFailed(true);
            }
          }}
        />
      </div>

      <div className={styles.namePlate} title={card.name}>
        {card.name}
      </div>

      <div className={`${styles.statBar} tabular`}>
        {card.kind === 'soldier' && (
          <>
            <span className={styles.statItem}>⚔{card.attack ?? 0}</span>
            <span className={styles.statItem}>
              <PaintedIcon name="heart" size={11} />
              {card.hp ?? 0}
            </span>
            {typeof card.range === 'number' && card.range > 1 ? (
              <span className={styles.statItem}>射{card.range}</span>
            ) : typeof card.speed === 'number' ? (
              <span className={styles.statItem}>速{card.speed}</span>
            ) : null}
          </>
        )}
        {card.kind === 'weapon' && (
          <span className={styles.statItem}>⚔+{card.attackBonus ?? 0}</span>
        )}
        {card.kind === 'defense' && (
          <span className={styles.statItem}>🛡+{card.amount ?? 0}</span>
        )}
        {card.kind === 'spell' && (
          <span className={styles.statItem}>
            {card.amount !== undefined ? `効果 ${card.amount}` : '特殊効果'}
          </span>
        )}
      </div>

      {countBadge !== undefined && countBadge > 0 && (
        <span className={styles.badgeCount}>×{countBadge}</span>
      )}
    </motion.div>
  );
}
