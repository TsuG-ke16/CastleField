// 実際の操作・描画済みのイベントに追従する案内。Game の状態は変えない。
export class Tutorial {
  constructor() {
    this.box = document.createElement('aside');
    this.box.id = 'tutorial'; this.box.hidden = true;
    this.box.setAttribute('aria-label', '操作案内');
    this.box.innerHTML = '<div role="status" aria-atomic="true"><strong></strong><p></p></div><button type="button" class="small-btn">案内を閉じる</button>';
    this.heading = this.box.querySelector('strong');
    this.instruction = this.box.querySelector('p');
    this.hand = document.getElementById('hand');
    this.endTurn = document.getElementById('end-turn');
    document.getElementById('controls').prepend(this.box);
    this.box.querySelector('button').onclick = () => this.finish();
    this.hand.addEventListener('click', event => {
      if (this.step !== 'card' || !event.target.closest('.card.soldier:not(.dim)')) return;
      this.show('use', '出兵する', '「使う」を押して、光った道を選ぼう。');
    });
  }
  pending() { try { return localStorage.getItem('cf-tutorial') !== 'done'; } catch { return true; } }
  start(playerId) {
    this.playerId = playerId;
    this.moved = false;
    this.seen = new Set();
    this.show('card', '兵士を選ぶ', '手札の光っている兵士をタップ。絵の下に攻撃力と体力が出ています。');
  }
  show(step, heading, instruction) {
    this.step = step;
    this.box.hidden = false;
    this.heading.textContent = heading;
    this.instruction.textContent = instruction;
    this.hand.classList.toggle('tutorial-select', step === 'card');
    this.endTurn.classList.toggle('tutorial-end', step === 'end');
  }
  event({ type, payload: p }) {
    if (!this.step) return;
    if (type === 'gameOver') { this.finish(); return; }
    // 攻撃を受けて防御を選ぶ場面：今の案内（「兵士を選ぶ」など）と食い違わないよう、防御の案内に切りかえて、終わったら戻す
    if (type === 'defenseRequested' && p.defenderId === this.playerId) {
      if (this.step !== 'defend') this.before = { step: this.step, heading: this.heading.textContent, instruction: this.instruction.textContent };
      this.show('defend', '防御のチャンス！', '光っている防御カードをタップすると守れます。使わないなら「防御しない」を押そう。');
      return;
    }
    if (type === 'defenseEnded' && this.step === 'defend') {
      const before = this.before ?? { step: 'card', heading: '兵士を選ぶ', instruction: '手札の光っている兵士をタップ。' };
      this.before = null;
      this.show(before.step, before.heading, before.instruction);
      return;
    }
    if (type === 'soldierDeployed' && p.playerId === this.playerId && ['card', 'use'].includes(this.step)) {
      this.show('end', '出兵できた！', '「ターン終了」を押そう。兵士は次の自分の番に進むよ。');
      return;
    }
    if (type === 'turnStarted' && p.playerId !== this.playerId && this.step === 'end') {
      this.show('wait', '相手の番', '画面をタップすると演出を早送りできます。');
      return;
    }
    if (type === 'soldierMoved' && p.playerId === this.playerId && !this.moved) {
      this.moved = true;
      this.show('march', '兵士が進軍した！', '相手の城に着くと大ダメージ。後続の兵士や魔法で援護しよう。');
      return;
    }
    if (!this.moved || this.seen.has(type)) return;
    if (type === 'mpChanged' && p.playerId === this.playerId) {
      this.show('mp', 'MPを回復する', '青いMPは攻撃魔法と精霊に使い、MP＋のカードで回復します。');
    } else if (type === 'cardsFused' && p.playerId === this.playerId) {
      this.show('fusion', '合成できた！', '同じカード2枚で一段強いカードに。「適応」は同じカードの代わりになります。');
    } else if (type === 'monsterAppeared' || type === 'monsterEvolved') {
      this.show('monster', '魔物を仲間にする', '兵士や攻撃魔法で魔物を倒すと、駒のカードが手札に入ります。');
    } else return;
    this.seen.add(type);
  }
  finish() { try { localStorage.setItem('cf-tutorial','done'); } catch {} this.close(); }
  close() {
    this.step = null;
    this.box.hidden = true;
    this.hand.classList.remove('tutorial-select');
    this.endTurn.classList.remove('tutorial-end');
  }
}
