import { useMemo, useState } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { SkillTreeCanvas } from '../pixi/SkillTreeCanvas';
import { GameButton, RoundButton } from '../components/ui/GameButton';
import { PaintedIcon } from '../components/ui/PaintedIcon';
import { ParchmentSheet } from '../components/ui/Surfaces';

export function SkillTreeScreen({ onBack }: { onBack: () => void }) {
  const { data, unlockedSkills, toggleSkillNode, resetSkills } = useAppStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const nodes = useMemo(() => {
    const raw = data?.skillTree;
    if (!raw) return [];
    const list = (raw.nodes || []).map((n) => ({
      id: n.id,
      name: n.name,
      group: n.group,
      kind: n.ultimate ? 'ultimate' : n.cross ? 'cross' : n.kind,
      x: n.layout?.x ?? n.x ?? 0,
      y: n.layout?.y ?? n.y ?? 0,
      desc: n.desc || n.description,
      ends: n.ends || null,
    }));
    if (raw.start && !list.some((n) => n.id === 'START')) {
      list.unshift({
        id: raw.start.id || 'START',
        name: raw.start.name || 'スタート',
        group: 'START',
        kind: 'start',
        x: raw.start.layout?.x ?? 0,
        y: raw.start.layout?.y ?? 0,
        desc: 'すべてのスキル経路の起点です。',
        ends: null,
      });
    }
    return list;
  }, [data]);

  const edges = useMemo(() => {
    const raw = data?.skillTree;
    if (!raw) return [] as Array<[string, string]>;
    const template = raw.edges || [];
    const groups = new Set((raw.nodes || []).filter((n) => !n.cross).map((n) => n.group));
    const expanded: Array<[string, string]> = [];
    for (const g of groups) {
      for (const [a, b] of template) {
        const na = a === 'START' ? 'START' : `${g}${a}`;
        const nb = b === 'START' ? 'START' : `${g}${b}`;
        expanded.push([na, nb]);
      }
    }
    for (const n of raw.nodes || []) {
      if (Array.isArray(n.ends)) {
        for (const endId of n.ends) {
          expanded.push([n.id, endId]);
        }
      }
    }
    return expanded;
  }, [data]);

  const filteredNodes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return nodes;
    return nodes.filter((n) => n.id === 'START' || n.name.toLowerCase().includes(q) || n.id.toLowerCase().includes(q));
  }, [nodes, search]);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedId) || null,
    [nodes, selectedId]
  );

  const isUnlocked = selectedNode ? unlockedSkills.includes(selectedNode.id) : false;

  return (
    <section
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 45,
        display: 'flex',
        flexDirection: 'column',
        background: '#f7e7c4',
      }}
      aria-label="スキルツリー"
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '8px 12px',
          background: 'linear-gradient(180deg, #4b7ee3 0%, #2d59ba 100%)',
          borderBottom: '3px solid #4a2e1a',
          color: '#fffaf0',
        }}
      >
        <GameButton size="sm" variant="normal-stone" onClick={onBack}>
          もどる
        </GameButton>
        <strong style={{ fontSize: 15 }}>スキル作戦図（PixiJS）</strong>
        <span className="tabular" style={{ fontWeight: 900, fontSize: 13 }}>
          {unlockedSkills.length}/12pt
        </span>
      </header>

      <div style={{ display: 'flex', gap: 8, padding: '8px 12px', background: '#fff6e0', borderBottom: '2px solid #c9ad7b' }}>
        <input
          type="search"
          placeholder="スキル名・効果で探す…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minHeight: 38, borderRadius: 10, border: '2px solid #4a2e1a', padding: '4px 10px', fontWeight: 700 }}
        />
        <GameButton size="sm" variant="danger-ruby" onClick={resetSkills}>
          全リセット
        </GameButton>
      </div>

      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <SkillTreeCanvas
          nodes={filteredNodes.length ? filteredNodes : nodes}
          edges={edges}
          unlockedIds={unlockedSkills}
          selectedId={selectedId}
          onSelectNode={setSelectedId}
        />

        {selectedNode && (
          <div style={{ position: 'absolute', left: 12, right: 12, bottom: 12, zIndex: 10, maxWidth: 460, margin: '0 auto' }}>
            <ParchmentSheet style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: 16 }}>
                  {selectedNode.name} <small style={{ color: 'var(--cf-ink-muted)' }}>{selectedNode.id}</small>
                </strong>
                <RoundButton onClick={() => setSelectedId(null)} aria-label="閉じる">
                  <PaintedIcon name="close" size={16} />
                </RoundButton>
              </div>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'var(--cf-ink-muted)' }}>
                {selectedNode.desc || `系統: ${selectedNode.group}`}
              </p>
              {selectedNode.id !== 'START' && (
                <GameButton
                  size="sm"
                  fullWidth
                  variant={isUnlocked ? 'danger-ruby' : 'primary-gold'}
                  onClick={() => toggleSkillNode(selectedNode.id)}
                >
                  {isUnlocked ? '解除する' : 'このスキルを取得'}
                </GameButton>
              )}
            </ParchmentSheet>
          </div>
        )}
      </div>
    </section>
  );
}
