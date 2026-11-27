import { NAV_ART, atlasMarkup } from './KingdomArt.js';
import { deckChoice, loadDecks } from './DeckStore.js';

// Match preferences only. Starting a game is owned by the home primary button.
export class LocalSetup {
  constructor({ host, castles, decks, rules, stages, ruleset='kingdom', savedDecks=()=>[], presetDeck=()=>null, previewDeck=()=>{}, onChange=()=>{} }) {
    Object.assign(this,{rules,decks,savedDecks,presetDeck,previewDeck,onChange,ruleset});
    this.key=`cf-match-setup-${ruleset}`;
    this.mode='solo'; this.cpuLevel='normal'; this.inputs={};
    this.box=host;
    host.innerHTML=`<details class="home-cpu"><summary><span class="cpu-current-art" aria-hidden="true"></span><span>CPUの強さ <b data-cpu-current></b></span><small>変更</small></summary><div class="home-cpu-choices" role="group" aria-label="CPU難易度">${[['easy','よわい','守りを中心に戦う'],['normal','ふつう','攻めを中心に戦う'],['hard','つよい','よく考えて戦う']].map(([id,name,note])=>`<button type="button" class="cpu-choice raw-btn" data-level="${id}" aria-pressed="${id==='normal'}">${atlasMarkup(NAV_ART[id],'difficulty-art',80)}<strong>${name}</strong><small>${note}</small></button>`).join('')}</div></details>
      <details class="home-match-options"><summary>対戦設定 <span data-setup-summary></span></summary><div class="home-match-fields"></div><p class="local-note">CPU戦では残りの席がCPU、同じ端末では全員が人になります。自分以外の城・デッキは標準。チーム戦では城を共有します。</p></details>`;
    this.fields=host.querySelector('.home-match-fields');
    const add=(key,label,choices)=>{
      const wrap=document.createElement('label');wrap.className='home-match-field';wrap.dataset.field=key;
      const caption=document.createElement('span');caption.textContent=label;
      const select=document.createElement('select');select.name=key;select.setAttribute('aria-label',label);
      select.append(...choices.map(([id,name])=>new Option(name,id)));
      wrap.append(caption,select);this.fields.append(wrap);this.inputs[key]=select;
    };
    add('playerCount','人数',Array.from({length:7},(_,i)=>[i+2,`${i+2}人`]));
    add('winCondition','勝ち方',[['firstDestroy','最初に城を落とした人'],['lastStanding','最後の1人（長め）']]);
    add('castle','自分の城',Object.entries(castles??{}).map(([id,c])=>[id,`${c.name}${c.hpBonus?` · 城HP${c.hpBonus>0?'+':''}${c.hpBonus}`:''}${c.maxHandBonus?` · 手札上限${c.maxHandBonus}`:''}${c.castleSpellBonus?` · 城への魔法+${c.castleSpellBonus}`:''}${c.soldierAttackBonus?` · 兵士攻撃+${c.soldierAttackBonus}`:''}`]));
    this.deckChoices={shared:Object.entries(decks??{}).filter(([,d])=>!d.costDeck).map(([id,d])=>[id,d.name])};
    this.deckChoices.own=this.deckChoices.shared;
    this.deckChoices.cost=Object.entries(decks??{}).filter(([,d])=>d.costDeck).map(([id,d])=>[id,d.name]);
    add('deckMode','山札',ruleset==='factions'?[['own','陣営の固定デッキ']]:ruleset==='classic'?[['shared','みんな共通']]:[['shared','みんな共通'],['own','自分のデッキ'],...(this.deckChoices.cost.length?[['cost','デッキ編成（コスト制）']]:[])]);
    add('deck','自分のデッキ',this.deckChoices.shared);
    this.preview=document.createElement('div');this.fields.append(this.preview);
    add('teams','チーム',[['off','個人戦'],['auto','自動で2チーム']]);
    if(stages)add('stage','ステージ',[['random','ランダム'],...Object.entries(stages).map(([id,s])=>[id,`${s.icon??''} ${s.name}`.trim()])]);
    const defaults={playerCount:2,winCondition:'firstDestroy',castle:rules.defaultCastle??'standard',deckMode:ruleset==='factions'?'own':this.deckChoices.cost.length?'cost':rules.deckMode==='own'?'own':'shared',deck:this.deckChoices.cost.length?rules.defaultCostDeck:rules.defaultDeck,teams:'off',stage:'random'};
    let saved={};try{saved=JSON.parse(localStorage.getItem(this.key)??'{}')??{}}catch{}
    this.cpuLevel=['easy','normal','hard'].includes(saved.cpuLevel)?saved.cpuLevel:'normal';
    for(const [k,select] of Object.entries(this.inputs)){
      if(k==='deck')continue;
      const value=String(saved[k]??defaults[k]);
      if([...select.options].some(o=>o.value===value))select.value=value;
      else if([...select.options].some(o=>o.value===String(defaults[k])))select.value=defaults[k];
    }
    this.refreshDecks();
    const deck=saved.deck??defaults.deck;if([...this.inputs.deck.options].some(o=>o.value===deck))this.inputs.deck.value=deck;
    host.addEventListener('change',e=>{if(e.target===this.inputs.deckMode)this.refreshDecks();this.changed()});
    host.addEventListener('click',e=>{const b=e.target.closest('.cpu-choice');if(!b)return;this.cpuLevel=b.dataset.level;this.changed();const detail=this.box.querySelector('.home-cpu');detail.open=false;detail.querySelector('summary').focus({preventScroll:true})});
    this.changed(false);
  }
  refreshDecks(){
    const mode=this.inputs.deckMode.value, select=this.inputs.deck, keep=select.value;
    const choices=[...(this.deckChoices[mode]??[])];
    if(mode==='cost')for(const d of this.savedDecks())if(d?.valid)choices.push([deckChoice(d.slot),d.name]);
    select.replaceChildren(...choices.map(([id,name])=>new Option(name,id)));
    if(choices.some(([id])=>id===keep))select.value=keep;
    this.fields.querySelector('[data-field=deck]').hidden=this.ruleset!=='kingdom'||mode!=='own';
    this.fields.querySelector('[data-field=deckMode]').hidden=this.ruleset!=='kingdom';
  }
  syncHomeDeck(deck){
    if(this.ruleset==='factions'){this.chooseDeck(deck?.id);return}
    if(this.inputs.deckMode.value!=='cost')return;
    this.refreshDecks();this.chooseDeck(deck?.kind==='mine'?deckChoice(deck.slot):deck?.presetId??this.rules.defaultCostDeck);
  }
  chooseDeck(id){if([...this.inputs.deck.options].some(o=>o.value===id))this.inputs.deck.value=id;}
  open(mode){this.mode=mode;this.box.hidden=mode==='online';this.box.querySelector('.home-cpu').hidden=mode!=='solo';this.changed(false);}
  read(){return Object.fromEntries(Object.entries(this.inputs).map(([k,el])=>[k,k==='playerCount'?Number(el.value):el.value]));}
  changed(save=true){
    this.preview.hidden=this.ruleset!=='kingdom'||this.inputs.deckMode.value!=='own';
    if(!this.preview.hidden)this.previewDeck(this.preview,this.presetDeck(this.inputs.deck.value));
    this.box.querySelector('[data-cpu-current]').textContent={easy:'よわい',normal:'ふつう',hard:'つよい'}[this.cpuLevel];
    this.box.querySelector('.cpu-current-art').innerHTML=atlasMarkup(NAV_ART[this.cpuLevel],'',32);
    for(const b of this.box.querySelectorAll('.cpu-choice'))b.setAttribute('aria-pressed',String(b.dataset.level===this.cpuLevel));
    this.box.querySelector('[data-setup-summary]').textContent=`${this.inputs.playerCount.selectedOptions[0]?.textContent} · ${this.inputs.castle.selectedOptions[0]?.textContent.split(' · ')[0]}`;
    if(save)try{localStorage.setItem(this.key,JSON.stringify({...this.read(),cpuLevel:this.cpuLevel}))}catch{}
    this.onChange(this.read());
  }
}
