// モーダルの共通操作。ゲームの状態には触らない。
export function setupAccessibility() {
  const ids=['result','menu','help','card-guide','progress-screen','settings'];
  const closers={menu:'#menu-close',help:'#help-close','card-guide':'.round-btn','progress-screen':'.round-btn',settings:'.settings-close'};
  const visible=el=>Boolean(el&&!el.hidden&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden');
  const top=()=>ids.map(id=>document.getElementById(id)).filter(el=>visible(el)&&!el.classList.contains('embedded-view')).sort((a,b)=>{const z=Number(getComputedStyle(a).zIndex)-Number(getComputedStyle(b).zIndex);return z || (a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING?-1:1);}).at(-1);
  const items=el=>[...el.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary,[tabindex="0"]')].filter(visible);
  const openers=new Map();
  const autoLabels=new WeakSet();
  const labelButton=button=>{if(!button||(!autoLabels.has(button)&&button.hasAttribute('aria-label')))return;const text=button.textContent.replace(/\s+/g,' ').trim();if(text){button.setAttribute('aria-label',text);autoLabels.add(button);}};
  const labelButtons=root=>{if(root.nodeType!==1)return;if(root.matches('button'))labelButton(root);for(const button of root.querySelectorAll('button'))labelButton(button);};
  labelButtons(document.getElementById('app'));
  for(const id of ids){const el=document.getElementById(id);if(!el)continue;el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');if(!el.hasAttribute('aria-labelledby'))el.setAttribute('aria-label',({menu:'メニュー',help:'遊び方',result:'試合結果'})[id]??'設定');}
  document.addEventListener('keydown',e=>{
    const modal=top();
    if(e.key==='Escape'){
      if(modal&&closers[modal.id]){e.preventDefault();e.stopPropagation();modal.querySelector(closers[modal.id])?.click();return;}
      const detail=document.getElementById('card-detail'),target=document.getElementById('target-bar');
      const card=document.querySelector('#hand .card.selected');
      if(visible(target)){e.preventDefault();document.querySelector('.target-cancel').click();}
      else if(visible(detail)){e.preventDefault();document.querySelector('.detail-close').click();card?.focus();}
    }
    if(e.key==='Tab'&&modal){const list=items(modal),first=list[0],last=list.at(-1);if(!first)return;
      if(!modal.contains(document.activeElement)){e.preventDefault();first.focus();}
      else if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    }
  },true);
  const observer=new MutationObserver(records=>{
    for(const r of records){if(r.type==='childList'){for(const node of r.addedNodes)labelButtons(node);labelButton(r.target.closest?.('button'));continue;}const el=r.target;if(!ids.includes(el.id)||el.classList.contains('embedded-view'))continue;
      if(!el.hidden){openers.set(el,document.activeElement);if(top()===el)items(el)[0]?.focus({preventScroll:true});}
      else {const opener=openers.get(el);if(visible(opener))opener.focus({preventScroll:true});openers.delete(el);}
    }
  });
  observer.observe(document.getElementById('app'),{subtree:true,childList:true,attributes:true,attributeFilter:['hidden']});
}
