import { SKILL_ART } from './kingdomSkillArt.js';
export { SKILL_ART };
const groupIds = ['C','M','E','S','T','P','H','I','V','G','B','R','D','Q','U','K','F','A','L'];
export const GROUP_ART = Object.fromEntries(groupIds.map((id,index)=>[id,{sheet:'groups',index,cols:5,rows:4}]));
export const START_ART={sheet:'groups',index:19,cols:5,rows:4};
export const CROSS_ART={sheet:'decor',index:5,cols:4,rows:2};
export const FRAME_ART=Object.fromEntries(['normal','ultimate','cross','start'].map((id,index)=>[id,{sheet:'decor',index,cols:4,rows:2}]));
export const NAV_ART=Object.fromEntries(['profile','deck','rank','gacha','settings','catalog','help','more','easy','normal','hard','local'].map((id,index)=>[id,{sheet:'navigation',index,cols:4,rows:3}]));
let atlasSequence=0;
export function atlasMarkup(spec, cls='', size=32) {
 if(!spec)return '';
 const {sheet,index,cols,rows}=spec;
 const aspect=sheet==='decor'?2:sheet==='classic-spells'?3:sheet==='cards-extra2'?1.5:sheet==='skills-0'?1267/1241:1;
 const inset=sheet==='navigation'&&index>=8?0.035:0;
 const clipId=`kingdom-clip-${++atlasSequence}`;
 const x=(index%cols)/cols,y=Math.floor(index/cols)/(rows*aspect);
 return `<svg class="kingdom-art ${cls}" viewBox="${x} ${y} ${1/cols} ${1/(rows*aspect)}" width="${size}" height="${size}" overflow="hidden" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><defs><clipPath id="${clipId}"><rect x="${x+inset/cols}" y="${y}" width="${(1-inset*2)/cols}" height="${1/(rows*aspect)}"/></clipPath></defs><g clip-path="url(#${clipId})"><image href="assets/ui/kingdom-v2/${sheet}.png" width="1" height="${1/aspect}"/></g></svg>`;
}
export function atlasElement(spec,size,cls) {
 const t=document.createElement('template');t.innerHTML=atlasMarkup(spec,cls,size);return t.content.firstElementChild;
}
