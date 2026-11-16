// 実際の操作・描画済みのイベントに追従する案内。Game の状態は変えない。
export class Tutorial {
  constructor() {
    this.box = document.createElement('aside');
    this.box.id = 'tutorial'; this.box.hidden = true;
    this.box.innerHTML = '<p role="status" aria-live="polite"></p><button type="button" class="small-btn">スキップ</button>';
    document.getElementById('controls').prepend(this.box);
    this.box.querySelector('button').onclick = () => this.finish();
    document.getElementById('hand').addEventListener('click', e => {
      if (this.step === 'card' && e.target.closest('.card')) this.show('use', '説明を読んで「使う」を押そう。\n光った道を選ぶと出兵できるよ。');
    });
  }
  pending() { try { return localStorage.getItem('cf-tutorial') !== 'done'; } catch { return true; } }
  start(playerId) { this.playerId = playerId; this.moved = false; this.show('card', '手札の兵士をタップしよう！\n絵の下は攻撃力と体力だよ。'); }
  show(step, text) { this.step = step; this.box.querySelector('p').textContent = text; this.box.hidden = false; }
  event({type, payload: p}) {
    if (!this.step) return;
    if (type === 'soldierDeployed' && p.playerId === this.playerId && ['card','use'].includes(this.step)) this.show('end', '出兵できた！「ターン終了」！\n次の自分の番に兵士が進むよ。');
    if (type === 'turnStarted' && p.playerId !== this.playerId && this.step === 'end') this.show('wait', '相手の番だよ。\n画面のタップで演出を早送り！');
    if (type === 'soldierMoved' && p.playerId === this.playerId && !this.moved) {
      this.moved = true; this.show('monster', '進軍できた！ 城に届くと大ダメージ。\n出兵→ターン終了を繰り返そう。');
    }
    if (type === 'monsterAppeared') this.show('monster', '魔物は放置するほど城に大ダメージ！\n兵士や魔法で倒すとカードがもらえる。');
    if (type === 'gameOver') this.finish();
  }
  finish() { try { localStorage.setItem('cf-tutorial','done'); } catch {} this.close(); }
  close() { this.step = null; this.box.hidden = true; }
}
