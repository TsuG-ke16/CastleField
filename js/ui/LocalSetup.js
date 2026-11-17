// 選ばなければ従来どおりの2人戦。詳細設定は閉じておく。
import { pillify } from './pills.js';
export class LocalSetup {
  constructor({castles,decks,rules,onStart}) {
    const box=document.getElementById('title-levels');
    this.mode='solo';this.rules=rules;
    const detail=document.createElement('details');detail.className='local-options';
    detail.innerHTML='<summary>人数・城・デッキなどを選ぶ（任意）</summary><div class="local-fields"></div>';
    this.fields=detail.querySelector('div');this.inputs={};
    const add=(key,label,choices)=>{const l=document.createElement('div');l.className='local-field';const cap=document.createElement('span');cap.id=`local-cap-${key}`;cap.textContent=label;l.append(cap);const select=document.createElement('select');select.name=key;select.setAttribute('aria-label',label);for(const [id,name] of choices){const o=document.createElement('option');o.value=id;o.textContent=name;select.append(o);}l.append(select);this.fields.append(l);this.inputs[key]=select;const g=pillify(select,label);g.removeAttribute('aria-label');g.setAttribute('aria-labelledby',cap.id);};
    add('playerCount','人数',Array.from({length:7},(_,i)=>[i+2,`${i+2}人`]));
    add('winCondition','勝ち方',[['firstDestroy','最初に城を落とした人'],['lastStanding','最後の1人（長め）']]);
    add('castle','自分の城',Object.entries(castles??{}).map(([id,c])=>[id,`${c.name}${c.hpBonus?` · 城HP${c.hpBonus>0?'+':''}${c.hpBonus}`:''}${c.maxHandBonus?` · 手札上限${c.maxHandBonus}`:''}${c.castleSpellBonus?` · 城への魔法+${c.castleSpellBonus}`:''}${c.soldierAttackBonus?` · 兵士攻撃+${c.soldierAttackBonus}`:''}`]));
    add('deckMode','山札',[['shared','みんな共通'],['own','自分のデッキ']]);
    add('deck','自分のデッキ',Object.entries(decks??{}).map(([id,d])=>[id,d.name]));
    add('teams','チーム',[['off','個人戦'],['auto','自動で2チーム']]);
    const note=document.createElement('p');note.textContent='CPUは残りの席。同じ端末では全員が人。自分以外の城・デッキは標準です。2チームの城は共有になります。';note.className='local-note';this.fields.append(note);
    this.inputs.deckMode.onchange=()=>{this.inputs.deck.disabled=this.inputs.deckMode.value!=='own';};this.inputs.deckMode.onchange();
    box.querySelector('.levels-title').after(detail);
    const local=document.createElement('button');local.type='button';local.className='plank-btn big';local.textContent='この設定ではじめる';local.id='local-start';local.hidden=true;local.onclick=()=>onStart(null,this.read());
    document.getElementById('levels-back').before(local);
    this.localButton=local;this.title=box.querySelector('.levels-title');this.reset();
  }
  reset(){for(const [k,v] of Object.entries({playerCount:2,winCondition:'firstDestroy',castle:this.rules.defaultCastle??'standard',deckMode:'shared',deck:this.rules.defaultDeck??'balanced',teams:'off'}))this.inputs[k].value=v;this.inputs.deckMode.onchange();for(const el of Object.values(this.inputs))el._pillSync?.();}
  open(mode){this.mode=mode;this.title.textContent=mode==='solo'?'CPU の強さを選んではじめる':'同じ端末で遊ぶ';this.localButton.hidden=mode==='solo';for(const e of document.querySelectorAll('#title-levels .level'))e.hidden=mode!=='solo';}
  read(){return Object.fromEntries(Object.entries(this.inputs).map(([k,el])=>[k,k==='playerCount'?Number(el.value):el.value]));}
}
