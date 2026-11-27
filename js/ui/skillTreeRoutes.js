// Each edge has its own clipped cubic. No shared orthogonal trunks.
export function routeCurve(a,b,positions,radius) {
 const pa=positions[a],pb=positions[b],dx=pb.x-pa.x,dy=pb.y-pa.y,d=Math.hypot(dx,dy)||1,ux=dx/d,uy=dy/d;
 const start={x:pa.x+ux*radius(a),y:pa.y+uy*radius(a)},end={x:pb.x-ux*radius(b),y:pb.y-uy*radius(b)};
 const sample=(p0,p1,p2,p3,t)=>{const u=1-t;return{x:u*u*u*p0.x+3*u*u*t*p1.x+3*u*t*t*p2.x+t*t*t*p3.x,y:u*u*u*p0.y+3*u*u*t*p1.y+3*u*t*t*p2.y+t*t*t*p3.y}};
 const obstacles=Object.entries(positions).filter(([id])=>id!==a&&id!==b).map(([id,p])=>({...p,r:radius(id)+12}));
 let best=null;
 for(const bend of [0,-45,45,-100,100,-180,180]) {
  if(best && Math.abs(bend)*.08>=best.score)continue;
  const c1={x:start.x+(end.x-start.x)/3-uy*bend,y:start.y+(end.y-start.y)/3+ux*bend};
  const c2={x:start.x+(end.x-start.x)*2/3-uy*bend,y:start.y+(end.y-start.y)*2/3+ux*bend};
  let score=Math.abs(bend)*.08;
  for(let i=1;i<12;i++){const p=sample(start,c1,c2,end,i/12);for(const q of obstacles){score+=Math.max(0,q.r-Math.hypot(p.x-q.x,p.y-q.y))**2}if(best&&score>=best.score)break;}
  if(!best||score<best.score)best={score,c1,c2};
 }
 const f=p=>`${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
 return `M ${f(start)} C ${f(best.c1)} ${f(best.c2)} ${f(end)}`;
}
