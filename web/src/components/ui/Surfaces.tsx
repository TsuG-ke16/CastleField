import type { CSSProperties, ReactNode } from 'react';
import styles from './Surfaces.module.css';

interface SurfaceProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function WoodFrame({ children, className = '', style }: SurfaceProps) {
  return (
    <div className={`${styles.woodFrame} ${className}`} style={style}>
      {children}
    </div>
  );
}

export function ParchmentSheet({ children, className = '', style }: SurfaceProps) {
  return (
    <div className={`${styles.parchment} ${className}`} style={style}>
      {children}
    </div>
  );
}

export function RibbonBanner({
  tone = 'victory',
  label,
  className = '',
}: {
  tone?: 'victory' | 'defeat';
  label: string;
  className?: string;
}) {
  const src =
    tone === 'victory'
      ? '/assets/v2/ui/frames/banner-victory-ribbon.webp'
      : '/assets/v2/ui/frames/banner-defeat-ribbon.webp';
  return (
    <div className={`${styles.ribbonWrap} ${className}`}>
      <img src={src} alt={label} className={styles.ribbonImg} />
      <span className={styles.ribbonText}>{label}</span>
    </div>
  );
}
