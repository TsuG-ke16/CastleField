// このゲーム用に作った短い旋律。音源ファイルも外部曲も使わない。
const TRACKS = {
  title: { beat:.38, bass:48, notes:[72,76,79,76,74,77,81,77,72,76,79,84,81,79,76,0] },
  battle: { beat:.23, bass:45, notes:[69,72,76,72,67,71,74,71,69,72,77,76,74,72,71,67] },
  tension: { beat:.17, bass:38, notes:[62,0,65,66,62,0,69,66,63,0,66,69,66,65,63,61] },
  victory: { beat:.28, bass:48, notes:[72,76,79,84,0,79,84,88,86,84,79,76,79,84,0,0] },
  defeat: { beat:.45, bass:45, notes:[76,0,74,72,71,0,69,0,72,0,71,67,69,0,0,0] },
};
export class Music {
  constructor(sound) {
    this.sound=sound; this.scene='title'; this.nodes=new Set();
    document.addEventListener('visibilitychange',()=>document.hidden?this.stop():this.start());
    window.addEventListener('pagehide',()=>this.stop());
    window.addEventListener('pageshow',()=>this.start());
  }
  setScene(scene) { if(scene===this.scene)return;this.scene=scene;this.stop();this.start(); }
  start() {
    const s=this.sound;
    if(this.timer||!s.ctx||document.hidden)return;
    if(!this.gain){this.gain=s.ctx.createGain();this.gain.connect(s.ctx.destination);}
    this.updateVolume();this.step=0;this.next=s.ctx.currentTime+.02;
    const tick=()=>{
      if(s.ctx.state!=='running')return;
      const track=TRACKS[this.scene]??TRACKS.title;
      if(this.next<s.ctx.currentTime)this.next=s.ctx.currentTime+.02;
      while(this.next<s.ctx.currentTime+.15){
        if(!s.muted){
          const note=track.notes[this.step%track.notes.length];
          if(note)this.note(note,this.next,track.beat*.8,.12,'triangle');
          if(this.step%4===0)this.note(track.bass+(this.step%8===4?5:0),this.next,track.beat*2.7,.09,'sine');
        }
        this.step++;this.next+=track.beat;
      }
    };
    tick();this.timer=setInterval(tick,80);
  }
  note(midi,at,duration,volume,type){
    const c=this.sound.ctx,o=c.createOscillator(),g=c.createGain();
    o.type=type;o.frequency.value=440*2**((midi-69)/12);
    g.gain.setValueAtTime(.0001,at);g.gain.exponentialRampToValueAtTime(volume,at+.015);g.gain.exponentialRampToValueAtTime(.0001,at+duration);
    o.connect(g).connect(this.gain);this.nodes.add(o);o.onended=()=>{this.nodes.delete(o);o.disconnect();g.disconnect();};o.start(at);o.stop(at+duration+.01);
  }
  updateVolume(){if(this.gain)this.gain.gain.setTargetAtTime(this.sound.muted?0:this.sound.bgmVolume,this.sound.ctx.currentTime,.025);}
  stop(){clearInterval(this.timer);this.timer=null;for(const n of this.nodes){try{n.stop();}catch{}}this.nodes.clear();}
}
