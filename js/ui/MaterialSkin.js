// All controls share one generated kit. Texture density, corners and button heights are fixed.
export function setupMaterialSkin(root = document.getElementById('app')) {
  const primary = '#end-turn,.detail-use,#menu-close,#rematch,.room-start,.settings-close,#help-close,#local-start,#title-join,#title-solo,.discard-ok';
  function decorate(node) {
    if (!(node instanceof Element)) return;
    const elements = [node, ...node.querySelectorAll('button,.screen-box,.parchment,.panel,.title-choices,.room-seat,.room-settings,.local-options,.set-group')];
    for (const el of elements) {
      if (el.matches('button') && !el.closest('#debug-panel') && el.id !== 'debug-toggle') {
        const skin = el.matches('.guide-card,.upgrade-item,.fusion-pair,.pill-stack .pill') ? 'card'
          : el.matches('.round-btn') ? 'round' : el.matches('.mode-choice,.level') ? 'wide'
          : el.matches('.shop-tabs > button,.guide-tabs > button') ? 'tab' : el.matches('.pill') ? 'compact' : 'regular';
        el.dataset.uiSkin = skin;
        el.dataset.uiTone = el.matches(primary) ? 'primary' : el.matches('.danger') ? 'danger' : 'neutral';
      }
      if (el.matches('.screen-box.parchment,.guide-box,.progress-box,.title-choices,#card-detail,#upgrade-panel,#target-bar,#discard-bar,#result .screen-box,.room-seat,.room-settings,.local-options,.set-group')) el.dataset.uiFrame = 'paper';
    }
  }
  decorate(root);
  for (const id of ['hud','controls']) document.getElementById(id).dataset.uiFrame = 'wood';
  const observer = new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) decorate(node);
  });
  observer.observe(root, { subtree:true, childList:true });
  return observer;
}
