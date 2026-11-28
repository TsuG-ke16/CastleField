import type { ReactNode } from 'react';
import { motion, type HTMLMotionProps } from 'motion/react';
import { soundManager } from '../../audio/soundManager';
import styles from './GameButton.module.css';

export type GameButtonVariant = 'primary-gold' | 'normal-stone' | 'selected-royal' | 'danger-ruby';
export type GameButtonSize = 'sm' | 'md' | 'lg';

interface GameButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: GameButtonVariant;
  size?: GameButtonSize;
  fullWidth?: boolean;
  crown?: boolean;
  children: ReactNode;
}

export function GameButton({
  variant = 'normal-stone',
  size = 'md',
  fullWidth = false,
  crown = false,
  className = '',
  onClick,
  disabled,
  children,
  type = 'button',
  ...rest
}: GameButtonProps) {
  return (
    <motion.button
      type={type}
      disabled={disabled}
      whileTap={disabled ? undefined : { y: 3, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 520, damping: 28 }}
      className={[styles.btn, styles[variant], styles[size], fullWidth ? styles.fullWidth : '', className].filter(Boolean).join(' ')}
      onClick={(e) => {
        if (!disabled) soundManager.play('tap');
        onClick?.(e);
      }}
      {...rest}
    >
      {crown && (
        <img
          src="/assets/v2/icons/crown.webp"
          alt=""
          className={styles.crownAccent}
          aria-hidden="true"
        />
      )}
      {children}
    </motion.button>
  );
}

interface RoundButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  tone?: 'stone' | 'gold';
  children: ReactNode;
}

export function RoundButton({
  tone = 'stone',
  className = '',
  onClick,
  disabled,
  children,
  type = 'button',
  ...rest
}: RoundButtonProps) {
  return (
    <motion.button
      type={type}
      disabled={disabled}
      whileTap={disabled ? undefined : { y: 2, scale: 0.93 }}
      transition={{ type: 'spring', stiffness: 540, damping: 28 }}
      className={[styles.round, tone === 'gold' ? styles.roundGold : styles.roundStone, className].filter(Boolean).join(' ')}
      onClick={(e) => {
        if (!disabled) soundManager.play('tap');
        onClick?.(e);
      }}
      {...rest}
    >
      {children}
    </motion.button>
  );
}
