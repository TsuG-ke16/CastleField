// UIが受け取ったイベントだけを集計する。再接続で失った履歴は作らない。
const KEY='cf-record-v1';
export class MatchStats {
  constructor(){this.reset();this.record=this.load();}
  load(){try{const r=JSON.parse(localStorage.getItem(KEY)??'null');if(r&&['wins','losses','streak'].every(k=>Number.isSafeInteger(r[k])&&r[k]>=0))return r;}catch{}return {wins:0,losses:0,streak:0};}
  reset(){this.counts={};this.hp={};this.owners={};this.castleOwners={};this.turn=0;this.partial=false;this.recorded=false;}
  begin(state){this.reset();this.partial=state.turn>1;this.turn=state.turn;for(const [id,p] of Object.entries(state.players)){this.hp[id]=p.castleHp;this.castleOwners[id]=p.castleOwner??id;for(const s of p.soldiers)this.owners[s.soldierId]=id;}}
  player(id){return this.counts[id]??= {damage:0,monsters:0,cards:0};}
  event({type,payload:p}){
    if(type==='turnStarted'){this.current=p.playerId;this.turn=p.turn;}
    if(type==='soldierDeployed')this.owners[p.soldierId]=p.playerId;
    if(type==='cardPlayed')this.player(p.playerId).cards++;
    if(type==='spellCast')this.caster=p.playerId;
    if(type==='spellReflected')this.caster=p.defenderId;
    if(type==='spiritTriggered')this.spirit=p.playerId;
    if(type==='monsterDefeated')this.player(p.playerId).monsters++;
    const owner=this.castleOwners[p.playerId]??p.playerId;
    if(type==='castleDamaged'){
      const source=p.source??{};
      const by=source.kind==='soldier'?this.owners[source.soldierId]:source.kind==='spell'?this.caster:source.kind==='spirit'?this.spirit:null;
      const damage=Math.max(0,(this.hp[owner]??p.hp)-p.hp);
      if(by)this.player(by).damage+=damage;
    }
    if(['castleDamaged','castleHealed','monsterAttackedCastle'].includes(type)&&Number.isFinite(p.hp))this.hp[owner]=p.hp;
  }
  finish(won,competitive){if(this.recorded)return;this.recorded=true;if(!competitive||this.partial)return;this.record[won?'wins':'losses']++;this.record.streak=won?this.record.streak+1:0;try{localStorage.setItem(KEY,JSON.stringify(this.record));}catch{}this.drawRecord();}
  drawRecord(){const el=document.getElementById('title-record');if(el)el.textContent=`${this.record.wins}勝 ${this.record.losses}敗 · ${this.record.streak}連勝`;}
  clear(){this.record={wins:0,losses:0,streak:0};try{localStorage.removeItem(KEY);}catch{}this.drawRecord();}
  render(viewerId,competitive){
    const ids=competitive?[viewerId]:Object.keys(this.counts);
    const stats=ids.reduce((a,id)=>{const s=this.player(id);for(const k of Object.keys(a))a[k]+=s[k];return a;},{damage:0,monsters:0,cards:0});
    const el=document.getElementById('result-stats');el.replaceChildren();
    const title=document.createElement('p');title.textContent=this.partial?'再接続後に見届けた記録':competitive?'あなたの活躍':'みんなの試合のまとめ';el.append(title);
    const dl = document.createElement('dl');
    for (const [label, value] of [['手番数', this.turn], ['与えた城ダメージ', stats.damage], ['倒した魔物', stats.monsters], ['使ったカード', stats.cards]]) {
      const item = document.createElement('div');
      item.className = 'result-stat';
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = label;
      dd.textContent = String(value);
      item.append(dt, dd);
      dl.append(item);
    }
    el.append(dl);
  }
}
