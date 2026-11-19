// すべてのカード（と、ランク報酬のカードスキン）が、拡大表示で3D（凹凸の地図つき）になるか確かめる
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = process.env.UI_TEST_URL ?? 'http://127.0.0.1:8787/';
  const b = await chromium.launch(process.env.UI_TEST_CHROMIUM ? { executablePath: process.env.UI_TEST_CHROMIUM } : {}); const p = await b.newPage({ viewport: { width: 390, height: 797 } });
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto(`${root}?local=1&cpu=easy`);
  await p.waitForTimeout(1500);
  const r = await p.evaluate(async () => {
    const { mountMiniCard } = await import('/js/ui/cardView.js');
    const { createCard3D } = await import('/js/ui/Card3D.js');
    const cards = await (await fetch('/data/cards.json')).json();
    const rar = await (await fetch('/data/rarities.json')).json();
    const bad = []; const modes = {};
    const jobs = Object.entries(cards).map(([t, def]) => [t, def, null]);
    for (const skin of ['iron', 'bronze', 'silver', 'gold', 'platinum', 'diamond', 'master', 'champion']) jobs.push(['infantry', cards.infantry, skin]);
    for (const [t, def, skin] of jobs) {
      const d = document.createElement('div'); d.className = 'zoom-card'; d.style.cssText='width:200px;height:300px;position:fixed;left:0;top:0';
      document.getElementById('app').append(d);
      mountMiniCard(d, t, def, rar, { skin });
      const c3 = createCard3D(d, { rarityColor: rar[def.rarity]?.color });
      c3.resize(); c3.render({ quaternion: [1,0,0,0], tiltX: 5, tiltY: 5 });
      await new Promise(r => setTimeout(r, 120));
      const ok = d.classList.contains('zoom-3d') && d.querySelector('.zoom-raised');
      const src = d.querySelector('.mini-card-frame')?.getAttribute('src');
      const reliefs = await Promise.all(['relief','raised'].map(k => fetch(src.replace('cards/frame-','cards/relief/frame-').replace('.png',`-${k}.png`)).then(r=>r.ok)));
      if (!ok || !reliefs.every(Boolean)) bad.push(skin ? `${t}(${skin})` : t);
      const m = d.classList.contains('zoom-gl') ? 'gl' : d.classList.contains('zoom-lite') ? 'lite' : 'pending';
      modes[m] = (modes[m]||0)+1;
      c3.destroy(); d.remove();
    }
    return { n: jobs.length, bad, modes };
  });
  await b.close();
  assert.deepEqual(r.bad, [], '3Dにならないカードがある');
  assert.deepEqual(errs, [], 'ページでエラーが出た');
  console.log(`すべてのカード（${r.n}枚）が3Dの拡大表示になる`, JSON.stringify(r.modes));
