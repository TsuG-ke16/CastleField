import { UI_CONFIG } from './config.js';
import { sound } from './Sound.js';
const KEY = 'cf-settings-v1';
const speeds = { normal: 1.8, fast: .65, skip: 0 };
export class Settings {
  constructor(onChange = () => {}) {
    this.onChange = onChange;
    this.value = { sfx: .5, bgm: .3, speed: 'normal', reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, text: 'normal', name: '' };
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
      if (saved && typeof saved === 'object') {
        for (const k of ['sfx','bgm']) if (Number.isFinite(saved[k])) this.value[k] = Math.max(0,Math.min(1,saved[k]));
        if (Object.hasOwn(speeds,saved.speed)) this.value.speed = saved.speed;
        if (['small','normal','large'].includes(saved.text)) this.value.text = saved.text;
        if (typeof saved.reduced === 'boolean') this.value.reduced = saved.reduced;
        if (typeof saved.name === 'string') this.value.name = saved.name.slice(0,16);
      } else this.value.name = localStorage.getItem('cf-name') ?? '';
    } catch {}
    this.box = document.createElement('div'); this.box.id = 'settings'; this.box.className = 'screen dim'; this.box.hidden = true;
    this.box.setAttribute('role','dialog'); this.box.setAttribute('aria-modal','true'); this.box.setAttribute('aria-labelledby','settings-title');
    this.box.innerHTML = `<div class="screen-box parchment settings-box"><h2 id="settings-title">設定</h2>
      <label>効果音 <output id="sfx-value"></output><input name="sfx" type="range" min="0" max="1" step=".05"></label>
      <label>BGM <output id="bgm-value"></output><input name="bgm" type="range" min="0" max="1" step=".05"></label>
      <label>演出の速さ<select name="speed"><option value="normal">ふつう</option><option value="fast">はやい</option><option value="skip">スキップ</option></select></label>
      <label class="check-label"><input name="reduced" type="checkbox">動きを減らす（揺れ・点滅・一瞬の停止）</label>
      <label>文字の大きさ<select name="text"><option value="small">小</option><option value="normal">中</option><option value="large">大</option></select></label>
      <label>あなたの名前<input name="name" maxlength="16" autocomplete="nickname"></label>
      <p role="status" class="settings-status"></p><button type="button" class="plank-btn settings-close">閉じる</button></div>`;
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
    for(const k of ['sfx','bgm'])this.box.querySelector(`#${k}-value`).textContent=`${Math.round(v[k]*100)}%`;
    this.onChange(v);
  }
  open(){this.opener=document.activeElement;this.box.hidden=false;this.box.querySelector('input').focus();}
  close(){this.box.hidden=true;this.opener?.focus();}
}
