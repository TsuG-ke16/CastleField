import { UI_CONFIG } from './config.js';
import { sound } from './Sound.js';
import { HOME_SKY_MODES, HOME_SKY_LABELS } from './HomeDioramaGL.js';
const KEY = 'cf-settings-v1';
const speeds = { normal: 1.8, fast: .65, skip: 0 };
export class Settings {
  constructor(onChange = () => {}) {
    this.onChange = onChange;
    this.value = { sfx: .5, bgm: .3, speed: 'normal', reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, text: 'normal', homeSky: 'auto', home3d: true, name: '' };
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
      if (saved && typeof saved === 'object') {
        for (const k of ['sfx','bgm']) if (Number.isFinite(saved[k])) this.value[k] = Math.max(0,Math.min(1,saved[k]));
        if (Object.hasOwn(speeds,saved.speed)) this.value.speed = saved.speed;
        if (['small','normal','large'].includes(saved.text)) this.value.text = saved.text;
        if (HOME_SKY_MODES.includes(saved.homeSky)) this.value.homeSky = saved.homeSky;
        if (typeof saved.home3d === 'boolean') this.value.home3d = saved.home3d;
        if (typeof saved.reduced === 'boolean') this.value.reduced = saved.reduced;
        if (typeof saved.name === 'string') this.value.name = saved.name.slice(0,16);
      } else this.value.name = localStorage.getItem('cf-name') ?? '';
    } catch {}
    this.box = document.createElement('div'); this.box.id = 'settings'; this.box.className = 'screen dim'; this.box.hidden = true;
    this.box.setAttribute('role','dialog'); this.box.setAttribute('aria-modal','true'); this.box.setAttribute('aria-labelledby','settings-title');
    // 見た目はピル型のボタン。中身の select / checkbox は隠して残し、値の読み書きは今までどおりそこで行う
    const pills=(name,label,options,wrap=false)=>`<div class="set-row"><span class="set-name">${label}</span><div class="pill-group${wrap?' pill-wrap':''}" role="group" aria-label="${label}" data-for="${name}">${options.map(([v,t])=>`<button type="button" class="pill" data-value="${v}">${t}</button>`).join('')}</div></div>`;
    this.box.innerHTML = `<div class="screen-box parchment settings-box"><h2 id="settings-title">設定</h2>
      <div class="settings-content">
      <section class="set-group"><h3>サウンド</h3>
        <label class="set-row"><span class="set-name">効果音</span><input name="sfx" type="range" min="0" max="1" step=".05"><output id="sfx-value"></output></label>
        <label class="set-row"><span class="set-name">BGM</span><input name="bgm" type="range" min="0" max="1" step=".05"><output id="bgm-value"></output></label>
      </section>
      <section class="set-group"><h3>画面と演出</h3>
        ${pills('homeSky','ホームの空（時間帯）',HOME_SKY_MODES.map((k)=>[k,HOME_SKY_LABELS[k]]),true)}
        <p class="set-note">基本は現在時刻に合わせて宇宙と光が変化します。好みの時間帯に固定もできます。</p>
        ${pills('home3d','ホームの3D表示',[['true','3Dリアルタイム'],['false','省電力（静止画）']])}
        <p class="set-note">標準は動く水面・滝・360°回転を楽しめるリアルタイム3Dです。電池消費を抑えたい場合は省電力へ切り替えられます。</p>
        ${pills('speed','演出の速さ',[['normal','ふつう'],['fast','はやい'],['skip','スキップ']])}
        ${pills('reduced','動きを減らす',[['true','ON'],['false','OFF']])}
        <p class="set-note">揺れや点滅を抑え、カードの獲得は静止画で表示します。</p>
        ${pills('text','文字の大きさ',[['small','小'],['normal','中'],['large','大']])}
        <p class="settings-reading-preview">兵士は次の自分の番から進軍します。</p>
      </section>
      <section class="set-group set-account" hidden><h3>アカウント</h3>
        <p class="set-note set-account-note"></p>
        <button type="button" class="plank-btn set-account-btn"></button>
      </section>
      <section class="set-group set-name-group"><h3>なまえ</h3>
        <label class="set-row"><span class="set-name">あなたの名前</span><input name="name" maxlength="16" autocomplete="nickname" placeholder="なまえ"></label>
      </section>
      <section class="set-group"><h3>戦績</h3>
        <p class="set-note set-record" aria-live="polite"></p>
        <button type="button" class="small-btn set-record-clear">戦績をリセット</button>
      </section>
      </div>
      <select name="homeSky" hidden>${HOME_SKY_MODES.map((k)=>`<option value="${k}"></option>`).join('')}</select>
      <input name="home3d" type="checkbox" hidden>
      <select name="speed" hidden><option value="normal"></option><option value="fast"></option><option value="skip"></option></select>
      <input name="reduced" type="checkbox" hidden>
      <select name="text" hidden><option value="small"></option><option value="normal"></option><option value="large"></option></select>
      <footer class="settings-footer"><p role="status" class="settings-status"></p><button type="button" class="plank-btn settings-close">閉じる</button></footer></div>`;
    this.box.addEventListener('click', e => {
      const pill=e.target.closest('.pill'); if(!pill)return;
      const input=this.box.querySelector(`[name="${pill.parentElement.dataset.for}"]`);
      if(input.type==='checkbox')input.checked=pill.dataset.value==='true';else input.value=pill.dataset.value;
      input.dispatchEvent(new Event('input',{bubbles:true}));
    });
    document.getElementById('app').append(this.box);
    for(const [k,v] of Object.entries(this.value)) { const input=this.box.querySelector(`[name="${k}"]`); if(input.type==='checkbox')input.checked=v;else input.value=v; }
    this.box.addEventListener('input', e => {
      const k=e.target.name; if(!Object.hasOwn(this.value,k))return;
      this.value[k]=e.target.type==='checkbox'?e.target.checked:e.target.type==='range'?Number(e.target.value):e.target.value;
      this.apply();
      try { localStorage.setItem(KEY,JSON.stringify(this.value)); localStorage.setItem('cf-name',this.value.name);this.box.querySelector('.settings-status').textContent='保存しました'; }
      catch {this.box.querySelector('.settings-status').textContent='この端末では保存できません。この画面では設定が有効です。';}
    });
    this.box.querySelector('.settings-close').onclick=()=>this.close();
    this.box.querySelector('.set-record-clear').onclick=()=>{ this.onClearRecord?.(); this.setRecord(this.recordText); };
    this.box.querySelector('.set-account-btn').onclick=()=>{ const open=this.onAccount; this.close(); open?.(); };
    this.box.addEventListener('click',e=>{if(e.target===this.box)this.close();});
    this.box.addEventListener('keydown',e=>{
      if(e.key==='Escape'){e.stopPropagation();this.close();}
      if(e.key==='Tab'){
        const list=[...this.box.querySelectorAll('input, select, button')];const first=list[0],last=list.at(-1);
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
      }
    });
    this.apply();
  }
  apply(){
    const v=this.value; UI_CONFIG.speed=speeds[v.speed]; UI_CONFIG.reducedMotion=v.reduced;
    document.documentElement.dataset.textSize=v.text;
    document.documentElement.classList.toggle('reduced-motion',v.reduced);
    sound.sfxVolume=v.sfx; sound.bgmVolume=v.bgm; sound.updateVolumes?.();
    for(const k of ['sfx','bgm']){this.box.querySelector(`#${k}-value`).textContent=`${Math.round(v[k]*100)}%`;this.box.querySelector(`[name="${k}"]`).style.setProperty('--p',`${Math.round(v[k]*100)}%`);}
    for(const group of this.box.querySelectorAll('.pill-group'))for(const pill of group.children){const on=String(v[group.dataset.for])===pill.dataset.value;pill.classList.toggle('on',on);pill.setAttribute('aria-pressed',String(on));}
    this.onChange(v);
  }
  open(){this.opener=document.activeElement;this.box.hidden=false;this.box.querySelector('input').focus();}
  /**
   * アカウントの欄（サーバーのアカウント機能があるときだけ出す）。info は { label, note, onOpen } か null
   * ゲストには「アカウントを作成」、作成済みなら「アカウント」を出し、押すとアカウントの画面を開く
   */
  /** 戦績（タイトルにあった「戦績を消す」を、設定に移した）。text は「3勝 2敗 · 1連勝」など */
  setRecord(text, onClear) {
    this.recordText = text; if (onClear) this.onClearRecord = onClear;
    this.box.querySelector('.set-record').textContent = text ?? '';
  }

  setAccount(info) {
    const sec=this.box.querySelector('.set-account');
    sec.hidden=!info;
    // アカウントがあるときは、名前はアカウントの表示名だけ（プロフィールで変える）。ここの名前は出さない
    this.box.querySelector('.set-name-group').hidden=!!info;
    if(!info)return;
    sec.querySelector('.set-account-note').textContent=info.note;
    sec.querySelector('.set-account-btn').textContent=info.label;
    this.onAccount=info.onOpen;
  }

  close(){this.box.hidden=true;this.opener?.focus();}
}
