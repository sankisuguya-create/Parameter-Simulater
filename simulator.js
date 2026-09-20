export const LEVEL_SECONDS=[13.6,12.8,12,11.2,10.5,9.8,9.3,8.8,8.4,8];
export const defaults={oniCount:6,runnerCount:18,guardCount:1,mochiCount:0,oniLevel:5,runnerLevel:5,fieldWidth:70,fieldHeight:40,jailPosition:'right',jailWidth:8,jailHeight:6,restrictedEnabled:false,restrictedMode:'inside',restrictedX:25,restrictedY:12,restrictedWidth:12,restrictedHeight:8,captureTarget:18,timeLimit:180,touchRescue:true,touchAmount:'one',symbolRescue:false,symbolAmount:'one',symbolHold:2,symbolCooldown:8,protectionTime:4,rescueTendency:55,dangerDistance:5,guardRange:8,mochiLimit:30,sprintDuration:10,recoveryDuration:20};

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const norm=(x,y)=>{const d=Math.hypot(x,y)||1;return{x:x/d,y:y/d}};
const hash=(seed,id)=>{let x=(seed^Math.imul(id+1,0x9e3779b9))>>>0;return()=>{x+=0x6D2B79F5;let t=x;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}};
export const levelSpeed=level=>50/LEVEL_SECONDS[clamp(Math.round(level),1,10)-1];

const jailFor=c=>{let x=(c.fieldWidth-c.jailWidth)/2,y=(c.fieldHeight-c.jailHeight)/2;if(c.jailPosition==='right'){x=c.fieldWidth-c.jailWidth-5;y=5}else if(c.jailPosition==='edge'){x=(c.fieldWidth-c.jailWidth)/2;y=.7}else if(c.jailPosition==='corner'){x=.7;y=.7}return{x,y,w:c.jailWidth,h:c.jailHeight,cx:x+c.jailWidth/2,cy:y+c.jailHeight/2}};
const overlaps=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;

export function validateConfig(c){
 const errors=[];
 if(c.guardCount+c.mochiCount>c.oniCount)errors.push('守り＋餅は鬼の数以下にしてください。');
 if(c.captureTarget>c.runnerCount)errors.push('終了人数は逃げの数以下にしてください。');
 if(c.jailWidth>=c.fieldWidth||c.jailHeight>=c.fieldHeight)errors.push('牢屋は活動範囲より小さくしてください。');
 if(c.restrictedEnabled){
  const r={x:c.restrictedX,y:c.restrictedY,w:c.restrictedWidth,h:c.restrictedHeight},j=jailFor(c);
  if(r.w<=0||r.h<=0||r.x<0||r.y<0||r.x+r.w>c.fieldWidth||r.y+r.h>c.fieldHeight)errors.push('立ち入り禁止の矩形は運動場の内側に収めてください。');
  if(c.restrictedMode==='inside'&&overlaps(r,j))errors.push('牢屋と立ち入り禁止領域が重ならないようにしてください。');
  if(c.restrictedMode==='outside'&&(j.x<r.x||j.y<r.y||j.x+j.w>r.x+r.w||j.y+j.h>r.y+r.h))errors.push('外側を禁止するときは、牢屋を矩形の内側に入れてください。');
 }
 return errors;
}

export class Simulation{
 constructor(config,seed=20260920){this.config={...defaults,...config};this.seed=seed>>>0;this.reset()}
 reset(){
  this.time=0;this.finished=false;this.result='';this.history=[{t:0,n:0}];this.rescueCount=0;this.captureCount=0;this.maxWait=0;this.symbol={progress:0,cooldown:0,worker:null};this.selectedId=null;
  this.jail=this.makeJail();this.agents=[];
  const c=this.config;const total=c.oniCount+c.runnerCount;
  for(let i=0;i<total;i++){const rnd=hash(this.seed,i);const oni=i<c.oniCount;const role=oni?(i<c.guardCount?'guard':i<c.guardCount+c.mochiCount?'mochi':'chaser'):'runner';const level=oni?c.oniLevel:c.runnerLevel;
   this.agents.push({id:i+1,team:oni?'oni':'runner',role,state:'active',level,speed:levelSpeed(level),x:1+rnd()*(c.fieldWidth-2),y:1+rnd()*(c.fieldHeight-2),vx:0,vy:0,rnd,decision:0,phase:rnd()*Math.PI*2,protectedUntil:0,capturedAt:null,jailedAt:null,waitTotal:0,longestWait:0,captures:0,rescues:0,mochiBy:null,mochiElapsed:0,touchLatch:false,sprintLeft:c.sprintDuration,recoveryUntil:0,wantsSprint:false,moveMode:'すばやく移動',jailMode:i%2?'edge':'wander'});
  }
  this.placeOni();for(const a of this.agents)this.enforceAllowed(a);this.assignMochi();
 }
 makeJail(){return jailFor(this.config)}
 restrictedRect(margin=0){const c=this.config;return{x:c.restrictedX-margin,y:c.restrictedY-margin,w:c.restrictedWidth+margin*2,h:c.restrictedHeight+margin*2}}
 pointForbidden(p,margin=.35){if(!this.config.restrictedEnabled)return false;const r=this.restrictedRect(this.config.restrictedMode==='inside'?margin:-margin);const inside=p.x>r.x&&p.x<r.x+r.w&&p.y>r.y&&p.y<r.y+r.h;return this.config.restrictedMode==='inside'?inside:!inside}
 lineBlocked(a,b){if(!this.config.restrictedEnabled||this.config.restrictedMode!=='inside')return false;for(let i=1;i<24;i++){const t=i/24;if(this.pointForbidden({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t}))return true}return false}
 routeDirection(a,target){if(target.cx!==undefined)target={x:target.cx,y:target.cy};if(!this.lineBlocked(a,target))return norm(target.x-a.x,target.y-a.y);const r=this.restrictedRect(.55),corners=[{x:r.x,y:r.y},{x:r.x+r.w,y:r.y},{x:r.x,y:r.y+r.h},{x:r.x+r.w,y:r.y+r.h}].filter(p=>p.x>.35&&p.x<this.config.fieldWidth-.35&&p.y>.35&&p.y<this.config.fieldHeight-.35&&!this.lineBlocked(a,p));let best=null,score=Infinity;for(const p of corners){const s=dist(a,p)+dist(p,target);if(s<score){best=p;score=s}}return best?norm(best.x-a.x,best.y-a.y):norm(target.x-a.x,target.y-a.y)}
 enforceAllowed(a){const c=this.config;if(!c.restrictedEnabled)return;const r=this.restrictedRect(c.restrictedMode==='inside'?.35:-.35);if(c.restrictedMode==='outside'){const ox=a.x,oy=a.y;a.x=clamp(a.x,r.x,r.x+r.w);a.y=clamp(a.y,r.y,r.y+r.h);if(a.x!==ox)a.vx*=-1;if(a.y!==oy)a.vy*=-1;return}if(!this.pointForbidden(a))return;const candidates=[{x:r.x,y:a.y,axis:'x'},{x:r.x+r.w,y:a.y,axis:'x'},{x:a.x,y:r.y,axis:'y'},{x:a.x,y:r.y+r.h,axis:'y'}].map(p=>({...p,x:clamp(p.x,.35,c.fieldWidth-.35),y:clamp(p.y,.35,c.fieldHeight-.35)})).filter(p=>!this.pointForbidden(p,.34));let best=candidates[0],bd=Infinity;for(const p of candidates){const d=dist(a,p);if(d<bd){best=p;bd=d}}if(best){a.x=best.x;a.y=best.y;if(best.axis==='x')a.vx*=-1;else a.vy*=-1}}
 placeOni(){const c=this.config;this.agents.filter(a=>a.team==='oni').forEach((a,i)=>{const ang=(i/Math.max(1,c.oniCount))*Math.PI*2;a.x=clamp(this.jail.cx+Math.cos(ang)*(this.jail.w/2+2),.5,c.fieldWidth-.5);a.y=clamp(this.jail.cy+Math.sin(ang)*(this.jail.h/2+2),.5,c.fieldHeight-.5)})}
 setAgentLevel(id,level){const a=this.agents.find(x=>x.id===id);if(a){a.level=+level;a.speed=levelSpeed(level)}}
 activeRunners(){return this.agents.filter(a=>a.team==='runner'&&a.state==='active')}
 caught(){return this.agents.filter(a=>a.team==='runner'&&a.state!=='active')}
 walkingToJail(){return this.agents.filter(a=>a.team==='runner'&&a.state==='walkingToJail')}
 jailed(){return this.agents.filter(a=>a.team==='runner'&&a.state==='jailed')}
 capturable(){return this.activeRunners().filter(a=>a.protectedUntil<=this.time)}
 nearest(from,list){let best=null,bd=Infinity;for(const a of list){const d=dist(from,a);if(d<bd-.0001||(Math.abs(d-bd)<.0001&&a.id<(best?.id??Infinity))){best=a;bd=d}}return{agent:best,d:bd}}
 assignMochi(){const mochi=this.agents.filter(a=>a.role==='mochi');const prisoners=this.jailed().filter(r=>!r.mochiBy&&(this.config.mochiLimit===0||r.mochiElapsed<this.config.mochiLimit)).sort((a,b)=>a.capturedAt-b.capturedAt||a.id-b.id);for(const m of mochi){let current=this.agents.find(a=>a.id===m.targetId&&a.state==='jailed'&&a.mochiBy===m.id);if(!current){delete m.targetId;const r=prisoners.shift();if(r){m.targetId=r.id;r.mochiBy=m.id;current=r}}if(current){m.x=clamp(current.x+.5,this.jail.x+.2,this.jail.x+this.jail.w-.2);m.y=current.y}else{m.x=this.jail.cx;m.y=this.jail.cy}}}
 releaseMochi(r){if(!r.mochiBy)return;const m=this.agents.find(a=>a.id===r.mochiBy);if(m)delete m.targetId;r.mochiBy=null}
 capture(r,oni){r.state='walkingToJail';r.capturedAt=this.time;r.jailedAt=null;r.protectedUntil=0;r.touchLatch=false;r.mochiElapsed=0;r.mochiBy=null;r.vx=r.vy=0;r.moveMode='牢屋へ歩く';oni.captures++;this.captureCount++}
 arriveJail(r){r.state='jailed';r.jailedAt=this.time;r.x=clamp(r.x,this.jail.x+.25,this.jail.x+this.jail.w-.25);r.y=clamp(r.y,this.jail.y+.25,this.jail.y+this.jail.h-.25);r.phase=r.rnd()*Math.PI*2;r.moveMode=r.jailMode==='edge'?'境界近くで待つ':'牢屋内を移動'}
 rescue(r,helper){if(r.state!=='jailed'||r.mochiBy)return false;this.releaseMochi(r);const waited=this.time-r.jailedAt;r.waitTotal+=waited;r.longestWait=Math.max(r.longestWait,waited);this.maxWait=Math.max(this.maxWait,waited);r.state='active';r.capturedAt=null;r.jailedAt=null;r.protectedUntil=this.time+this.config.protectionTime;r.x=clamp(helper.x+(r.rnd()-.5)*1.3,.5,this.config.fieldWidth-.5);r.y=clamp(helper.y+(r.rnd()-.5)*1.3,.5,this.config.fieldHeight-.5);this.enforceAllowed(r);r.rescues++;helper.rescues++;this.rescueCount++;return true}
 rescueBy(helper,amount){const available=this.jailed().filter(r=>!r.mochiBy).sort((a,b)=>a.capturedAt-b.capturedAt||a.id-b.id);const targets=amount==='all'?available:available.slice(0,1);for(const r of targets)this.rescue(r,helper);return targets.length}
 decide(a){
  const c=this.config;a.decision=this.time+.45+a.rnd()*.15;a.wantsSprint=false;
  if(a.team==='oni'){
   if(a.role==='mochi')return;
   const runners=this.capturable();
   if(a.role==='guard'){
    const nearby=runners.filter(r=>dist(r,this.jail)<=c.guardRange||Math.hypot(r.x-this.jail.cx,r.y-this.jail.cy)<=c.guardRange+Math.max(this.jail.w,this.jail.h)/2);const n=this.nearest(a,nearby);
    if(n.agent){const v=this.routeDirection(a,n.agent);a.vx=v.x;a.vy=v.y;a.action='牢屋を守る';a.wantsSprint=true;return}
    const ang=this.time*.55+a.phase;a.target={x:this.jail.cx+Math.cos(ang)*(this.jail.w/2+1.3),y:this.jail.cy+Math.sin(ang)*(this.jail.h/2+1.3)};
   }else{const n=this.nearest(a,runners);a.target=n.agent?{x:n.agent.x,y:n.agent.y}:null}
   if(a.target){const v=this.routeDirection(a,a.target);a.vx=v.x;a.vy=v.y;a.action=a.role==='guard'?'見張る':'追いかける';a.wantsSprint=a.role==='chaser'}else{a.vx=a.vy=0}
   return;
  }
  if(a.state!=='active')return;
  const threats=this.agents.filter(o=>o.team==='oni'&&o.role!=='mochi');const threat=this.nearest(a,threats);
  if(threat.agent&&threat.d<c.dangerDistance){const v=norm(a.x-threat.agent.x,a.y-threat.agent.y);a.vx=v.x;a.vy=v.y;a.action='逃げる';a.wantsSprint=true;return}
  const canHelp=this.jailed().some(r=>!r.mochiBy)&&a.protectedUntil<=this.time;
  if(canHelp&&a.rnd()*100<c.rescueTendency){const target=this.jailed().find(r=>!r.mochiBy);if(target){const v=this.routeDirection(a,target);a.vx=v.x;a.vy=v.y;a.action='助けに行く';a.wantsSprint=true;return}}
  const ang=a.phase+this.time*.18+(a.rnd()-.5)*.8;a.vx=Math.cos(ang);a.vy=Math.sin(ang);a.action='動き回る';
 }
 move(a,dt){if(a.role==='mochi')return;if(a.state==='walkingToJail'){const v=this.routeDirection(a,this.jail);a.x+=v.x*1.2*dt;a.y+=v.y*1.2*dt;this.enforceAllowed(a);if(Math.hypot(a.x-this.jail.cx,a.y-this.jail.cy)<.35)this.arriveJail(a);return}if(a.state==='jailed'){this.moveInJail(a,dt);return}if(a.state!=='active')return;let factor=.62;if(this.time<a.recoveryUntil){factor=.24;a.moveMode='回復中（歩く）'}else{if(a.recoveryUntil>0){a.recoveryUntil=0;a.sprintLeft=this.config.sprintDuration}if(a.wantsSprint&&a.sprintLeft>0){factor=1;a.sprintLeft=Math.max(0,a.sprintLeft-dt);a.moveMode='本気で走る';if(a.sprintLeft<=0)a.recoveryUntil=this.time+this.config.recoveryDuration}else a.moveMode='すばやく移動'}a.x+=a.vx*a.speed*factor*dt;a.y+=a.vy*a.speed*factor*dt;if(a.x<.35||a.x>this.config.fieldWidth-.35){a.x=clamp(a.x,.35,this.config.fieldWidth-.35);a.vx*=-1;a.phase=Math.PI-a.phase}if(a.y<.35||a.y>this.config.fieldHeight-.35){a.y=clamp(a.y,.35,this.config.fieldHeight-.35);a.vy*=-1;a.phase=-a.phase}this.enforceAllowed(a)}
 moveInJail(a,dt){const j=this.jail;if(a.jailMode==='edge'){const u=(a.phase+this.time*.18)%(Math.PI*2),rx=j.w/2-.3,ry=j.h/2-.3;a.x=j.cx+Math.cos(u)*rx;a.y=j.cy+Math.sin(u)*ry}else{if(!a.jailTarget||dist(a,a.jailTarget)<.25||Math.floor((this.time-dt)/3)!==Math.floor(this.time/3))a.jailTarget={x:j.x+.35+a.rnd()*(j.w-.7),y:j.y+.35+a.rnd()*(j.h-.7)};const v=norm(a.jailTarget.x-a.x,a.jailTarget.y-a.y);a.x+=v.x*.55*dt;a.y+=v.y*.55*dt;a.x=clamp(a.x,j.x+.2,j.x+j.w-.2);a.y=clamp(a.y,j.y+.2,j.y+j.h-.2)}}
 processCaptures(){const onis=this.agents.filter(a=>a.team==='oni'&&a.role!=='mochi');const candidates=this.capturable();for(const o of onis){const n=this.nearest(o,candidates.filter(r=>r.state==='active'));if(n.agent&&n.d<=.8)this.capture(n.agent,o)}}
 processRescues(){const helpers=this.activeRunners().filter(r=>r.protectedUntil<=this.time);for(const h of helpers){const n=this.nearest(h,this.jailed().filter(r=>!r.mochiBy));const touching=n.agent&&n.d<=.8;if(touching&&!h.touchLatch)this.rescue(n.agent,h);h.touchLatch=!!touching}}
 step(dt=.05){if(this.finished)return;this.time+=dt;this.symbol.cooldown=Math.max(0,this.symbol.cooldown-dt);for(const a of this.agents){if(a.mochiBy){a.mochiElapsed+=dt;if(this.config.mochiLimit>0&&a.mochiElapsed>=this.config.mochiLimit)this.releaseMochi(a)}if(this.time>=a.decision)this.decide(a);this.move(a,dt)}this.processCaptures();this.processRescues(dt);this.assignMochi();
  if(Math.floor((this.time-dt)*2)!==Math.floor(this.time*2))this.history.push({t:this.time,n:this.caught().length});
  if(this.caught().length>=this.config.captureTarget){this.finished=true;this.result='鬼側：目標人数をつかまえました'}else if(this.time>=this.config.timeLimit){this.finished=true;this.result='逃げ側：時間いっぱい逃げました'}
 }
 metrics(){const runners=this.agents.filter(a=>a.team==='runner');let wait=0,max=this.maxWait;for(const r of runners){const current=r.state==='jailed'?this.time-r.jailedAt:0;wait+=r.waitTotal+current;max=Math.max(max,r.longestWait,current)}return{caught:this.caught().length,walking:this.walkingToJail().length,jailed:this.jailed().length,avgWait:wait/runners.length,maxWait:max,rescues:this.rescueCount,captures:this.captureCount}}
 snapshot(){return{time:this.time,finished:this.finished,result:this.result,metrics:this.metrics(),agents:this.agents,jail:this.jail,symbol:this.symbol,history:this.history,config:this.config}}
}
