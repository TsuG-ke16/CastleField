export type PaintedIconName =
  | 'cpu'
  | 'online'
  | 'local'
  | 'filter'
  | 'bell'
  | 'close'
  | 'check'
  | 'arrow'
  | 'rank-unranked'
  | 'shop'
  | 'skin'
  | 'ranking'
  | 'mission'
  | 'crown'
  | 'battle'
  | 'deck'
  | 'gacha'
  | 'catalog'
  | 'settings'
  | 'profile'
  | 'rank'
  | 'friend'
  | 'coin'
  | 'heart'
  | 'mp'
  | 'help'
  | 'fire'
  | 'water'
  | 'wind'
  | 'earth';

interface PaintedIconProps {
  name: PaintedIconName;
  size?: number;
  className?: string;
  alt?: string;
}

export function PaintedIcon({ name, size = 24, className = '', alt = '' }: PaintedIconProps) {
  return (
    <img
      src={`/assets/v2/icons/${name}.webp`}
      width={size}
      height={size}
      alt={alt}
      aria-hidden={alt === '' ? true : undefined}
      className={className}
      style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0 }}
      decoding="async"
    />
  );
}
