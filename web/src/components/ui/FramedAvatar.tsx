import type { CSSProperties } from 'react';
import { cardTypeToImagePath } from '../../engine/dataLoader';

/** アイコンフレームの品 ID（shop.json の frame_<階級>）→ 絵。ランク報酬のフレームだけ絵がある */
export function iconFrameImage(frameId: string | null | undefined): string | null {
  const m = /^frame_([a-z]+)$/.exec(frameId || '');
  return m ? `/assets/frames/rank-frame-${m[1]}.png` : null;
}

// 枠の絵（assets/frames/rank-frame-*.png、正方形）の中の窓：幅の約56%、窓の中心は高さの約47%
const WINDOW_RATIO = 0.56;
const WINDOW_CENTER_Y = 0.47;

/** アバター（カードの絵）に、装備したアイコンフレームを重ねる。frameId がなければアバターだけ */
export function FramedAvatar({
  cardType,
  frameId,
  size,
  className,
  style,
  alt = 'アバター',
}: {
  cardType: string;
  frameId?: string | null;
  size: number;
  className?: string;
  style?: CSSProperties;
  alt?: string;
}) {
  const frame = iconFrameImage(frameId);
  const frameSize = size / WINDOW_RATIO;
  return (
    <span
      style={{ position: 'relative', display: 'inline-block', width: size, height: size, flexShrink: 0 }}
      data-frame={frameId || undefined}
    >
      <img
        src={cardTypeToImagePath(cardType)}
        alt={alt}
        className={className}
        style={{ width: size, height: size, objectFit: 'contain', display: 'block', ...style }}
      />
      {frame && (
        <img
          src={frame}
          alt=""
          aria-hidden="true"
          style={{
            position: 'absolute',
            width: frameSize,
            height: frameSize,
            left: (size - frameSize) / 2,
            top: size / 2 - frameSize * WINDOW_CENTER_Y,
            pointerEvents: 'none',
            maxWidth: 'none',
          }}
        />
      )}
    </span>
  );
}
