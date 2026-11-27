import { useMemo } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { GameCard } from '../components/ui/GameCard';
import { GameButton } from '../components/ui/GameButton';
import { ParchmentSheet } from '../components/ui/Surfaces';
import styles from './DeckScreen.module.css';

export function DeckScreen() {
  const { data, selectedDeckId, setSelectedDeckId, setTab } = useAppStore();
  const decks = data?.decks || {};
  const cards = data?.cards || {};
  const activeDeck = decks[selectedDeckId] || Object.values(decks)[0];

  const stats = useMemo(() => {
    const entries = Object.entries(activeDeck?.cards || {});
    let total = 0;
    const kinds = { soldier: 0, spell: 0, weapon: 0, defense: 0 };
    for (const [k, count] of entries) {
      total += count;
      const def = cards[k];
      if (def && def.kind in kinds) kinds[def.kind] += count;
    }
    return { entries, total, kinds };
  }, [activeDeck, cards]);

  return (
    <section className={styles.page} aria-label="デッキ編成">
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, flexShrink: 0, scrollbarWidth: 'none' }}>
        {Object.entries(decks).map(([id, d]) => (
          <GameButton
            key={id}
            size="sm"
            variant={selectedDeckId === id ? 'selected-royal' : 'normal-stone'}
            onClick={() => setSelectedDeckId(id)}
          >
            {d.name}
          </GameButton>
        ))}
      </div>

      <div className={styles.layout}>
        <ParchmentSheet className={styles.summaryCol}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: 16 }}>{activeDeck?.name || 'デッキ'}</strong>
            <span className="tabular" style={{ fontWeight: 900 }}>{stats.total}枚</span>
          </div>

          <div className={styles.balanceBox}>
            <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--cf-ink-muted)' }}>デッキ構成バランス</div>
            {[
              { label: '兵士', val: stats.kinds.soldier, color: '#3465cc' },
              { label: '魔法', val: stats.kinds.spell, color: '#de4f46' },
              { label: '武器', val: stats.kinds.weapon, color: '#e4881a' },
              { label: '防御', val: stats.kinds.defense, color: '#4ea85f' },
            ].map((row) => (
              <div key={row.label} className={styles.barRow}>
                <span>{row.label}</span>
                <div className={styles.barTrack}>
                  <div
                    className={styles.barFill}
                    style={{
                      width: `${stats.total ? Math.round((row.val / stats.total) * 100) : 0}%`,
                      background: row.color,
                    }}
                  />
                </div>
                <span className="tabular">{row.val}</span>
              </div>
            ))}
          </div>

          <GameButton variant="primary-gold" fullWidth onClick={() => setTab('battle')}>
            このデッキで戦う
          </GameButton>
        </ParchmentSheet>

        <div className={styles.cardsCol}>
          {stats.entries.map(([typeKey, count]) => {
            const def = cards[typeKey];
            if (!def) return null;
            return (
              <GameCard
                key={typeKey}
                typeKey={typeKey}
                card={def}
                countBadge={count}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}
