// 選ばなければ従来どおりの2人戦。詳細設定は閉じておく。
import { pillify } from './pills.js';
import { deckChoice, deckSlot, loadDecks } from './DeckStore.js';
export class LocalSetup {
  constructor({castles,decks,rules,stages,onStart,savedDecks,presetDeck,previewDeck,openDeckEditor}) {
    const box=document.getElementById('title-levels');
    this.mode='solo';this.rules=rules;
    Object.assign(this, { savedDecks, presetDeck, previewDeck, openDeckEditor });
    const detail=document.createElement('details');detail.className='local-options';
    detail.innerHTML='<summary>人数・城・デッキなどを選ぶ（任意）</summary><div class="local-fields"></div>';
    this.fields=detail.querySelector('div');this.inputs={};
    const add=(key,label,choices)=>{const l=document.createElement('div');l.className='local-field';const cap=document.createElement('span');cap.id=`local-cap-${key}`;cap.textContent=label;l.append(cap);const select=document.createElement('select');select.name=key;select.setAttribute('aria-label',label);for(const [id,name] of choices){const o=document.createElement('option');o.value=id;o.textContent=name;select.append(o);}l.append(select);this.fields.append(l);this.inputs[key]=select;const g=pillify(select,label);g.removeAttribute('aria-label');g.setAttribute('aria-labelledby',cap.id);};
    add('playerCount','人数',Array.from({length:7},(_,i)=>[i+2,`${i+2}人`]));
    add('winCondition','勝ち方',[['firstDestroy','最初に城を落とした人'],['lastStanding','最後の1人（長め）']]);
    add('castle','自分の城',Object.entries(castles??{}).map(([id,c])=>[id,`${c.name}${c.hpBonus?` · 城HP${c.hpBonus>0?'+':''}${c.hpBonus}`:''}${c.maxHandBonus?` · 手札上限${c.maxHandBonus}`:''}${c.castleSpellBonus?` · 城への魔法+${c.castleSpellBonus}`:''}${c.soldierAttackBonus?` · 兵士攻撃+${c.soldierAttackBonus}`:''}`]));
    const plain=Object.entries(decks??{}).filter(([,d])=>!d.costDeck).map(([id,d])=>[id,d.name]);
    const costs=Object.entries(decks??{}).filter(([,d])=>d.costDeck).map(([id,d])=>[id,d.name]);
    this.deckChoices={shared:plain,own:plain,cost:costs};
    add('deckMode','山札',[['shared','みんな共通'],['own','自分のデッキ'],...(costs.length?[['cost','デッキ編成（コスト制）']]:[])]);
    add('deck','自分のデッキ',plain);
    this.preview = document.createElement('div');
    this.editDeck = document.createElement('button');
    this.editDeck.type = 'button';
    this.editDeck.className = 'small-btn';
    this.editDeck.addEventListener('click', () => this.openDeckEditor(this.repairSlot));
    this.fields.append(this.preview, this.editDeck);
    this.inputs.deck.addEventListener('change', () => this.renderPreview());
    add('teams','チーム',[['off','個人戦'],['auto','自動で2チーム']]);
    // ステージ（data/stages.json）。最初は毎試合ランダム
    if(stages)add('stage','ステージ',[['random','ランダム'],...Object.entries(stages).map(([id,s])=>[id,`${s.icon??''} ${s.name}`.trim()])]);
    const note=document.createElement('p');note.textContent='CPUは残りの席。同じ端末では全員が人。自分以外の城・デッキは標準です。2チームの城は共有になります。';note.className='local-note';this.fields.append(note);
    this.inputs.deckMode.onchange = () => this.refreshDecks();
    this.refreshDecks();
    box.querySelector('.levels-title').after(detail);
    const local=document.createElement('button');local.type='button';local.className='plank-btn big';local.textContent='この設定ではじめる';local.id='local-start';local.hidden=true;local.onclick=()=>onStart(null,this.read());
    document.getElementById('levels-back').before(local);
    this.localButton=local;this.title=box.querySelector('.levels-title');this.reset();
  }
  refreshDecks() {
    const mode = this.inputs.deckMode.value;
    const select = this.inputs.deck;
    const keep = select.value;
    const choices = [...this.deckChoices[mode]];
    if (mode === 'cost') {
      for (const deck of this.savedDecks()) {
        if (deck?.valid) choices.push([deckChoice(deck.slot), deck.name]);
      }
    }
    select.disabled = mode === 'shared';
    select.replaceChildren(...choices.map(([id, name]) => new Option(name, id)));
    select.value = choices.some(([id]) => id === keep) ? keep : choices[0]?.[0] ?? '';
    if (select._pillSync) {
      select.nextElementSibling.remove();
      delete select._pillSync;
    }
    const group = pillify(select, '自分のデッキ');
    group.removeAttribute('aria-label');
    group.setAttribute('aria-labelledby', 'local-cap-deck');
    this.renderPreview();
  }

  renderPreview() {
    const mode = this.inputs.deckMode.value;
    const choice = this.inputs.deck.value;
    const slots = mode === 'cost' ? this.savedDecks() : [];
    const slot = deckSlot(choice);
    const invalid = slots.find(deck => deck && !deck.valid);
    this.repairSlot = invalid?.slot;
    this.editDeck.hidden = mode !== 'cost';
    this.editDeck.textContent = invalid ? '保存したデッキを修正' : 'デッキを編成する';
    const deck = mode === 'shared' ? null : slot === null ? this.presetDeck(choice) : slots[slot];
    this.previewDeck(this.preview, deck);
  }

  reset(){for(const [k,v] of Object.entries({playerCount:2,winCondition:'firstDestroy',castle:this.rules.defaultCastle??'standard',deckMode:this.deckChoices.cost.length?'cost':'shared',deck:this.deckChoices.cost.length?(this.rules.defaultCostDeck??this.deckChoices.cost[0][0]):(this.rules.defaultDeck??'balanced'),teams:'off',...(this.inputs.stage?{stage:'random'}:{})})){this.inputs[k].value=v;if(k==='deckMode')this.inputs.deckMode.onchange();}
    // 山札は、プレイヤーごとに別（コスト制）が最初の設定。編成したデッキがあれば、それを選んでおく
    const mine=this.inputs.deckMode.value==='cost'?this.savedDecks().find(d=>d?.valid&&d.slot===loadDecks().active):null;
    if(mine){this.inputs.deck.value=deckChoice(mine.slot);this.renderPreview();}
    for(const el of Object.values(this.inputs))el._pillSync?.();}
  open(mode){this.mode=mode;this.title.textContent=mode==='solo'?'CPU の強さを選んではじめる':'同じ端末で遊ぶ';this.localButton.hidden=mode==='solo';for(const e of document.querySelectorAll('#title-levels .level'))e.hidden=mode!=='solo';}
  read(){return Object.fromEntries(Object.entries(this.inputs).map(([k,el])=>[k,k==='playerCount'?Number(el.value):el.value]));}
}
