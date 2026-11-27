import { useState } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { GameButton } from '../components/ui/GameButton';
import { PaintedIcon, type PaintedIconName } from '../components/ui/PaintedIcon';
import { ParchmentSheet } from '../components/ui/Surfaces';

export function MenuScreen({ onOpenSkillTree }: { onOpenSkillTree: () => void }) {
  const {
    quality,
    setQuality,
    muted,
    toggleMute,
    ownedSkins,
    selectedCastleSkin,
    selectedSoldierSkin,
    equipSkin,
  } = useAppStore();
  const [subPage, setSubPage] = useState<'main' | 'skins'>('main');

  if (subPage === 'skins') {
    return (
      <section
        style={{
          position: 'relative',
          zIndex: 10,
          height: '100%',
          overflowY: 'auto',
          padding: '12px 14px 90px',
          maxWidth: 760,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <GameButton size="sm" variant="normal-stone" onClick={() => setSubPage('main')}>
            ← メニュー
          </GameButton>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>スキン装備</h1>
        </div>

        <ParchmentSheet style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <strong style={{ fontSize: 15 }}>現在の装備</strong>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, textAlign: 'center', fontSize: 12, fontWeight: 800 }}>
            <div>
              <img src="/assets/castles/castle-blue.png" alt="城" style={{ width: 72, height: 72, objectFit: 'contain', margin: '0 auto' }} />
              <span>{selectedCastleSkin}</span>
            </div>
            <div>
              <img src="/assets/cards/card-infantry.png" alt="兵士" style={{ width: 72, height: 72, objectFit: 'contain', margin: '0 auto' }} />
              <span>{selectedSoldierSkin}</span>
            </div>
            <div>
              <img src="/assets/ui/card-back.png" alt="カード裏面" style={{ width: 52, height: 72, objectFit: 'contain', margin: '0 auto' }} />
              <span>標準裏面</span>
            </div>
          </div>
        </ParchmentSheet>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {ownedSkins.map((sid) => (
            <ParchmentSheet key={sid} style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
              <PaintedIcon name={sid.includes('castle') ? 'crown' : 'skin'} size={36} />
              <strong style={{ fontSize: 12 }}>{sid}</strong>
              <GameButton
                size="sm"
                fullWidth
                variant={selectedCastleSkin === sid || selectedSoldierSkin === sid ? 'selected-royal' : 'normal-stone'}
                onClick={() => equipSkin(sid.includes('castle') ? 'castle' : 'soldier', sid)}
              >
                {selectedCastleSkin === sid || selectedSoldierSkin === sid ? '装備中' : '装備する'}
              </GameButton>
            </ParchmentSheet>
          ))}
        </div>
      </section>
    );
  }

  const menuRows: Array<{ label: string; desc: string; icon: PaintedIconName; action: () => void }> = [
    { label: 'スキン装備', desc: '持っている見た目を城や兵士に装備する', icon: 'skin', action: () => setSubPage('skins') },
    { label: 'スキル作戦図（200種）', desc: 'クラシックモードのスキルツリーを編集', icon: 'crown', action: onOpenSkillTree },
    { label: 'ランキング・実績', desc: 'シーズン順位とミッション報酬', icon: 'ranking', action: () => {} },
    { label: '遊び方ガイド', desc: '属性相性と城攻めの基本ルール', icon: 'help', action: () => {} },
  ];

  return (
    <section
      style={{
        position: 'relative',
        zIndex: 10,
        height: '100%',
        overflowY: 'auto',
        padding: '12px 14px 90px',
        maxWidth: 760,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
      aria-label="王国メニュー"
    >
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, textShadow: '0 2px 0 #fffaf0' }}>
        王国メニュー
      </h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 900, paddingLeft: 4 }}>自分の王国</div>
        <ParchmentSheet style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {menuRows.map((row) => (
            <button
              key={row.label}
              type="button"
              onClick={row.action}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                width: '100%',
                minHeight: 54,
                padding: '8px 10px',
                borderRadius: 12,
                border: '2px solid #d9c48a',
                background: '#fffdf6',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <PaintedIcon name={row.icon} size={32} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 900 }}>{row.label}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--cf-ink-muted)' }}>{row.desc}</div>
              </div>
              <PaintedIcon name="arrow" size={16} />
            </button>
          ))}
        </ParchmentSheet>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 900, paddingLeft: 4 }}>環境・外遊び設定</div>
        <ParchmentSheet style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 900 }}>描画品質（外遊び省電力）</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--cf-ink-muted)' }}>
                電池・通信量を抑えたいときは「省電力2D」へ
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <GameButton
                size="sm"
                variant={quality === '3d' ? 'selected-royal' : 'normal-stone'}
                onClick={() => setQuality('3d')}
              >
                標準3D
              </GameButton>
              <GameButton
                size="sm"
                variant={quality === '2d' ? 'selected-royal' : 'normal-stone'}
                onClick={() => setQuality('2d')}
              >
                省電力2D
              </GameButton>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 900 }}>サウンド効果音</div>
            <GameButton
              size="sm"
              variant={muted ? 'danger-ruby' : 'selected-royal'}
              onClick={toggleMute}
            >
              {muted ? 'ミュート中' : 'ON'}
            </GameButton>
          </div>
        </ParchmentSheet>
      </div>
    </section>
  );
}
