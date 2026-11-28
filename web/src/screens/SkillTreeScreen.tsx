import { useMemo, useRef, useState } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { SkillTreeCanvas, type SkillTreeCanvasHandle } from '../pixi/SkillTreeCanvas';
import { GameButton, RoundButton } from '../components/ui/GameButton';
import { PaintedIcon } from '../components/ui/PaintedIcon';
import { ParchmentSheet } from '../components/ui/Surfaces';

export function SkillTreeScreen({ onBack }: { onBack: () => void }) {
  const { data, unlockedSkills, toggleSkillNode, resetSkills } = useAppStore();
  const canvasRef = useRef<SkillTreeCanvasHandle | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
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

  const groups = useMemo(() => {
    const set = new Set<string>();
    for (const n of nodes) {
      if (n.group && n.group !== 'START') set.add(n.group);
    }
    return Array.from(set);
  }, [nodes]);

  const filteredNodes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return nodes.filter((n) => {
      if (n.id === 'START') return true;
      if (
        q &&
        !n.name.toLowerCase().includes(q) &&
        !n.id.toLowerCase().includes(q) &&
        !(n.desc || '').toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [nodes, search]);

  const matchedCount = useMemo(
    () => filteredNodes.filter((n) => n.id !== 'START').length,
    [filteredNodes]
  );

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
          background: 'linear-gradient(180deg, #3e6fd4 0%, #24499e 58%, #1a377d 100%)',
          borderBottom: '3px solid #4a2e1a',
          boxShadow: 'inset 0 1px 0 rgba(255, 250, 240, 0.32), inset 0 -2px 0 #ffd98a, 0 4px 10px rgba(20, 38, 88, 0.28)',
          color: '#fffaf0',
        }}
      >
        <GameButton size="sm" variant="normal-stone" onClick={onBack}>
          もどる
        </GameButton>
        <strong style={{ fontSize: 15, textShadow: '0 1.5px 2px rgba(0, 0, 0, 0.45)' }}>スキル作戦図（PixiJS）</strong>
        <span
          className="tabular"
          style={{
            fontWeight: 900,
            fontSize: 12,
            padding: '3px 10px',
            borderRadius: 999,
            background: 'linear-gradient(180deg, #27489e 0%, #152b69 100%)',
            border: '1.5px solid #ffd98a',
            color: '#ffe37a',
            boxShadow: 'inset 0 1px 0 rgba(255, 245, 210, 0.35), 0 2px 0 rgba(20, 38, 88, 0.45)',
          }}
        >
          {unlockedSkills.length}/12pt
        </span>
      </header>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          background: 'linear-gradient(180deg, #fffaf0 0%, #f7e6bf 100%)',
          borderBottom: '2px solid #c9ad7b',
          boxShadow: 'inset 0 1px 0 #ffffff',
        }}
      >
        <input
          type="search"
          placeholder="スキル名・効果で探す…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minHeight: 38, borderRadius: 10, border: '2px solid #4a2e1a', padding: '4px 10px', fontWeight: 700 }}
        />
        {search.trim() && (
          <span
            className="tabular"
            style={{
              flexShrink: 0,
              padding: '4px 8px',
              borderRadius: 999,
              background: '#3465cc',
              color: '#fffaf0',
              fontSize: 11,
              fontWeight: 900,
            }}
          >
            ヒット {matchedCount}件
          </span>
        )}
        <GameButton size="sm" variant="danger-ruby" onClick={resetSkills}>
          全リセット
        </GameButton>
      </div>

      {groups.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: 6,
            overflowX: 'auto',
            padding: '6px 12px',
            background: '#faecc4',
            borderBottom: '2px solid #c9ad7b',
            flexShrink: 0,
            scrollbarWidth: 'none',
          }}
          aria-label="スキル系統フィルタ"
        >
          <button
            type="button"
            onClick={() => setActiveGroup(null)}
            style={{
              flexShrink: 0,
              padding: '4px 10px',
              borderRadius: 999,
              border: '2px solid #4a2e1a',
              background:
                activeGroup === null
                  ? 'linear-gradient(180deg, #5b8ef2 0%, #3465cc 60%, #22479b 100%)'
                  : 'linear-gradient(180deg, #fffef8 0%, #f4e3bd 100%)',
              boxShadow:
                activeGroup === null
                  ? 'inset 0 1.5px 0 rgba(255, 255, 255, 0.4), inset 0 0 0 1.5px #ffd98a, 0 2px 0 rgba(26, 48, 104, 0.45)'
                  : 'inset 0 1.5px 0 #ffffff, 0 2px 0 rgba(74, 46, 26, 0.22)',
              color: activeGroup === null ? '#fffaf0' : '#4a2e1a',
              fontSize: 11,
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            すべて
          </button>
          {groups.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setActiveGroup(activeGroup === g ? null : g)}
              style={{
                flexShrink: 0,
                padding: '4px 10px',
                borderRadius: 999,
                border: '2px solid #4a2e1a',
                background:
                  activeGroup === g
                    ? 'linear-gradient(180deg, #5b8ef2 0%, #3465cc 60%, #22479b 100%)'
                    : 'linear-gradient(180deg, #fffef8 0%, #f4e3bd 100%)',
                boxShadow:
                  activeGroup === g
                    ? 'inset 0 1.5px 0 rgba(255, 255, 255, 0.4), inset 0 0 0 1.5px #ffd98a, 0 2px 0 rgba(26, 48, 104, 0.45)'
                    : 'inset 0 1.5px 0 #ffffff, 0 2px 0 rgba(74, 46, 26, 0.22)',
                color: activeGroup === g ? '#fffaf0' : '#4a2e1a',
                fontSize: 11,
                fontWeight: 900,
                cursor: 'pointer',
              }}
            >
              {g}系
            </button>
          ))}
        </div>
      )}

      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <SkillTreeCanvas
          ref={canvasRef}
          nodes={filteredNodes.length ? filteredNodes : nodes}
          edges={edges}
          unlockedIds={unlockedSkills}
          selectedId={selectedId}
          activeGroup={activeGroup}
          onSelectNode={setSelectedId}
        />

        <div
          style={{
            position: 'absolute',
            right: 12,
            bottom: selectedNode ? 132 : 14,
            zIndex: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
          aria-label="ズーム操作"
        >
          <RoundButton onClick={() => canvasRef.current?.zoomBy(1.25)} aria-label="拡大">
            <span style={{ fontWeight: 900, fontSize: 18 }}>＋</span>
          </RoundButton>
          <RoundButton onClick={() => canvasRef.current?.zoomBy(0.8)} aria-label="縮小">
            <span style={{ fontWeight: 900, fontSize: 18 }}>－</span>
          </RoundButton>
          <RoundButton onClick={() => canvasRef.current?.resetView()} aria-label="全体表示">
            <span style={{ fontWeight: 900, fontSize: 11 }}>全体</span>
          </RoundButton>
        </div>

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
