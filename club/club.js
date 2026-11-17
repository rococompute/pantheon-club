import {loadSwl, SwlScene} from './vendor/swl.js';
import {SwlCanvasRenderer} from './vendor/swlCanvas.js';
import {MovieRoom} from './vendor/movie/movie.js';
import {Clip} from './vendor/movie/clip.js';

const $ = id => document.getElementById(id);
const canvas = $('scene'), ctx = canvas.getContext('2d');
const W = 760, H = 480, actors = new Map(), puffleCache = new Map();
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let paused = reduced.matches, state, selected, room, renderer, penguinMovie, puffleParts;
const isPenguin = a => a.avatar ? a.avatar === 'penguin' : !a.cloud && !a.parent;
const player = {data:{name:'You',color:'#ffbf35',avatar:'penguin',state:'idle',player:true},x:380,y:410,tx:380,ty:410,dir:1,moving:false,action:null};
try {const saved=JSON.parse(localStorage.getItem('pantheon-club-player')||'{}');if(/^#[a-f\d]{6}$/i.test(saved.color))player.data.color=saved.color;if(typeof saved.name==='string')player.data.name=saved.name.slice(0,20)||'You';} catch {}
const keys=new Set();
let last = 0, tick = 0, misses = 0, ready = false, frameId;
const words = {working:'Working',idle:'Between requests',none:'Session state unavailable',needs_input:'Waiting on you',waiting:'Waiting on you',blocked:'Waiting on you',limited:'At a usage limit',completed:'Completed',done:'Between requests',ended:'Session ended'};
const waiting = a => ['needs_input','waiting','blocked'].includes(a.state);
const image = src => new Promise((resolve,reject) => {const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error(`Could not load ${src}`));img.src=src;});
const json = async path => {const r=await fetch(path);if(!r.ok)throw new Error(`Could not read ${path}`);return r.json();};
const error = message => {$('error').textContent=message;$('error').hidden=!message;};
const hash = s => [...s].reduce((n,c)=>(Math.imul(n,31)+c.charCodeAt(0))>>>0,7);

async function init() {
  const [roomBytes,roomAtlas,movie,pack] = await Promise.all([
    fetch('/assets/coffee.swl').then(r=>{if(!r.ok)throw new Error('Room asset missing');return r.arrayBuffer();}),
    image('/assets/coffee-atlas.png'),MovieRoom.load('/assets/penguin'),fetch('/assets/puffle.pack').then(r=>r.text())]);
  penguinMovie=movie;penguinMovie.setScale(2);
  penguinMovie.prefetchFrames(Array.from({length:25},(_,i)=>i+1),12,true,null,false);
  room=new SwlScene(loadSwl(new Uint8Array(roomBytes)));
  room.prepare();
  for (const path of ['block_mc','triggers_mc','block','triggers']) room.visible(path,false);
  renderer=new SwlCanvasRenderer(W,H,[roomAtlas]);
  // The four SVG shapes are concatenated in the upstream character pack.
  puffleParts=[...pack.matchAll(/<svg[\s\S]*?<\/svg>/g)].map(m=>new DOMParser().parseFromString(m[0],'image/svg+xml').documentElement.querySelector('g').innerHTML);
  ready=true;await poll();frame(performance.now());
}

function drawPenguin(a,logicalFrame,now) {
  if(!a.clip){a.clip=new Clip(penguinMovie);a.clip.set('ring',{visible:false});a.clip.set('hotspot',{visible:false});a.sprite=document.createElement('canvas');a.sprite.width=160;a.sprite.height=192;}
  if(a.rendering || (a.renderAt!==undefined && now-a.renderAt<1/24))return;
  const rgb=parseInt(a.data.color.slice(1),16);
  // The reference's native solid body color transform; faces, outlines, and
  // feet keep their original artwork. No selection ring or sprite-sheet mask.
  a.clip.set('body',{color:{mult:[0,0,0,1],add:[(rgb>>16)&255,(rgb>>8)&255,rgb&255,0]}});
  if(a.logicalFrame!==logicalFrame){a.clip.resetPlayback();a.logicalFrame=logicalFrame;}
  else if(!paused)a.clip.advance(Math.min(3,(now-(a.renderAt??now))*24));
  a.renderAt=now;a.rendering=true;
  const back=a.back||(a.back=document.createElement('canvas'));back.width=160;back.height=192;
  const g=back.getContext('2d');g.setTransform(2,0,0,2,80,150);
  a.clip.draw(g,logicalFrame,2).then(()=>{a.back=a.sprite;a.sprite=back;a.spriteReady=true;}).catch(e=>{if(!a.renderError){a.renderError=true;error('Penguin renderer: '+e.message);}}).finally(()=>a.rendering=false);
}
function puffleImage(color) {
  if(!puffleCache.has(color)) {
    const body=puffleParts[1].replaceAll('#ffffff',color).replaceAll('#33ccff',color);
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="-50 -50 100 100"><g transform="translate(0,10) scale(.65)">${body}<g transform="translate(-1.65,27.2)">${puffleParts[2]}</g><g transform="translate(-.35,4.65)">${puffleParts[3]}</g></g></svg>`;
    const img=new Image();img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);puffleCache.set(color,img);
  }
  return puffleCache.get(color);
}

function actorFor(a,i) {
  const h=hash(a.name), x=230+(i%5)*68, y=300+Math.floor(i/5)*65;
  const button=document.createElement('button');button.className='actor'+(isPenguin(a)?'':' puffle');button.onclick=()=>select(a.name);
  $('characters').append(button);
  return {data:a,x,y,tx:x,ty:y,dir:1,phase:h%628/100,wanderAt:0,button,moving:false};
}
function apply(s) {
  state=s;misses=0;error('');$('connection').textContent=s.network==='demo'?'● DEMO':s.live?'● LIVE':'● RUN RECORD';
  $('market').textContent=s.title+' · '+s.network;$('chain').textContent=`TERM ${s.term} · BLOCK ${s.height}`;
  const ds=s.agents.filter(isPenguin).length;
  $('counts').textContent=`${ds} agent penguin${ds===1?'':'s'} · ${s.agents.length-ds} puffle${s.agents.length-ds===1?'':'s'} · you`;
  const bid=s.bids.at(-1);$('ticker').textContent=bid?`#${bid.id} · ${bid.by} · ${bid.state}: ${bid.title}`:s.finished?'The market is done. Time to put your flippers up.':'The club is open. Waiting for the first bid…';
  const seen=new Set();s.agents.forEach((a,i)=>{let actor=actors.get(a.name);if(!actor){actor=actorFor(a,i);actors.set(a.name,actor);}actor.data=a;actor.button.className='actor'+(isPenguin(a)?'':' puffle');actor.button.setAttribute('aria-label',`${a.name}, ${isPenguin(a)?'agent penguin':'puffle'}, ${words[a.state]||a.state}${a.parent?', from '+a.parent:''}`);seen.add(a.name);});
  for(const [name,a] of actors)if(!seen.has(name)){a.button.remove();actors.delete(name);}
  renderRoster();if(selected&&!actors.has(selected)){selected=null;$('card').hidden=true;}else if(selected)select(selected);
}
function select(name) {
  const a=actors.get(name)?.data;if(!a)return;selected=name;$('card').hidden=false;
  $('card-name').textContent=a.name;$('card-name').style.color=a.color;
  $('card-kind').textContent=a.diplomat?'Participating diplomat':isPenguin(a)?'Scripted network agent':a.cloud?'Cloud worker · puffle':'Child node · puffle';
  $('card-state').textContent=(a.leader?'★ Current leader · ':'')+(words[a.state]||a.state);
  $('card-task').textContent=a.task||a.pending?.map(b=>`Bid #${b.id}: ${b.title}`).join('\n')||`${a.merges||0} merged bids`;
  $('card-parent').textContent=a.parent?`Following ${a.parent} · same team, same color`:a.diplomat?'Works its Pantheon inbox':'Independent network node';
  $('focus-agent').disabled=!state.live||state.network==='demo';$('focus-agent').textContent=a.cloud?'Open parent tab ↗':'Open agent tab ↗';
}
function renderRoster() {
  $('roster').replaceChildren();for(const a of state.agents){const b=document.createElement('button');b.className='roster-agent';
    const dot=document.createElement('i');dot.style.background=a.color;const label=document.createElement('span');label.textContent=a.name;
    const sub=document.createElement('small');sub.textContent=(isPenguin(a)?'Penguin':'Puffle')+' · '+(words[a.state]||a.state);label.append(sub);b.append(dot,label);b.onclick=()=>select(a.name);$('roster').append(b);}
}
$('close-card').onclick=()=>{selected=null;$('card').hidden=true;};
$('focus-agent').onclick=async()=>{const a=actors.get(selected)?.data;if(!a)return;try{const r=await fetch('/focus?agent='+encodeURIComponent(a.cloud?a.parent:a.name),{method:'POST'});if(!r.ok)throw new Error(await r.text());}catch(e){error('Could not open the tab: '+e.message);}};
$('roster-toggle').onclick=()=>{const show=$('roster').hidden;$('roster').hidden=!show;$('roster-toggle').setAttribute('aria-expanded',String(show));};
function motionButton(){$('motion').textContent=paused?'▶':'Ⅱ';$('motion').setAttribute('aria-pressed',String(paused));$('motion').title=paused?'Resume animation':'Pause animation';}
$('motion').onclick=()=>{paused=!paused;motionButton();};motionButton();
reduced.addEventListener('change',e=>{paused=e.matches;motionButton();});
$('help').onclick=()=>$('about').showModal();$('close-about').onclick=()=>$('about').close();
document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('card').hidden=true;selected=null;}});
function walkable(x,y){return x>=80&&x<=685&&y>=240&&y<=442 && !(x>355&&x<575&&y<355) && !(x<200&&y<300);}
function walkTo(x,y){if(!walkable(x,y))return;player.tx=x;player.ty=y;player.action=null;}
canvas.addEventListener('pointerdown',e=>{const r=canvas.getBoundingClientRect();walkTo((e.clientX-r.left)*W/r.width,(e.clientY-r.top)*H/r.height);$('room').focus({preventScroll:true});});
$('room').addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d'].includes(e.key)){keys.add(e.key);player.action=null;e.preventDefault();}});
document.addEventListener('keyup',e=>{if(keys.delete(e.key)&&keys.size===0){player.tx=player.x;player.ty=player.y;}});
window.addEventListener('blur',()=>{if(keys.size){keys.clear();player.tx=player.x;player.ty=player.y;}});
$('player-name').value=player.data.name;$('player-color').value=player.data.color;
function savePlayer(){try{localStorage.setItem('pantheon-club-player',JSON.stringify({name:player.data.name,color:player.data.color}));}catch{}}
$('player-name').addEventListener('input',e=>{player.data.name=e.target.value.trim().slice(0,20)||'You';savePlayer();});
$('player-color').addEventListener('input',e=>{player.data.color=e.target.value;savePlayer();});
$('player-settings').onclick=()=>$('player-dialog').showModal();$('close-player').onclick=()=>{$('player-dialog').close();$('room').focus();};
for(const b of document.querySelectorAll('[data-emote]'))b.onclick=()=>{player.action=b.dataset.emote==='stand'?null:b.dataset.emote;player.tx=player.x;player.ty=player.y;$('player-dialog').close();$('room').focus();};

function target(a,index,t) {
  const d=a.data,h=hash(d.name);
  if(waiting(d))return [340+(index%3)*35,212+Math.floor(index/3)*25];
  if(['limited','ended'].includes(d.state))return [100+(index%3)*48,275+Math.floor(index/3)*28];
  if(d.state==='working'||d.leader)return [240+(index%5)*64,320+Math.floor(index/5)*65];
  if(t>a.wanderAt){a.tx=180+((h+Math.floor(t/8)*137)%380);a.ty=305+((h+Math.floor(t/8)*31)%90);a.wanderAt=t+8;}
  return [a.tx,a.ty];
}
function move(a,x,y,dt){const dx=x-a.x,dy=y-a.y,d=Math.hypot(dx,dy);a.moving=d>2;
  if(a.moving){const k=Math.min(1,dt*(isPenguin(a.data)?95:110)/d);const nx=a.x+dx*k,ny=a.y+dy*k;
    if(!a.data.player||walkable(nx,ny)){a.x=nx;a.y=ny;}else{a.tx=a.x;a.ty=a.y;a.moving=false;}
    a.dir=((Math.round((Math.atan2(dy,dx)*180/Math.PI-90)/45)%8)+8)%8+1;}}
function label(text,x,y,color='#14354b'){ctx.font='bold 10px "Trebuchet MS",sans-serif';ctx.textAlign='center';ctx.lineWidth=3;ctx.strokeStyle='#fff9e9e6';ctx.strokeText(text,x,y);ctx.fillStyle=color;ctx.fillText(text,x,y);}
function bubble(text,x,y){ctx.font='bold 11px "Trebuchet MS",sans-serif';const w=Math.max(26,ctx.measureText(text).width+18);ctx.fillStyle='#fffdf4';ctx.strokeStyle='#273f50';ctx.lineWidth=1.4;ctx.beginPath();ctx.roundRect(x-w/2,y-20,w,24,9);ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(x-3,y+4);ctx.lineTo(x,y+9);ctx.lineTo(x+5,y+4);ctx.fill();ctx.fillStyle='#273f50';ctx.textAlign='center';ctx.fillText(text,x,y-4);}
function drawActor(a,now) {
  const d=a.data,scale=.95+a.y/900;
  if(isPenguin(d)){
    const logical=a.moving?a.dir+8:a.action==='dance'?26:a.action==='wave'||waiting(d)?25:a.action==='sit'||['limited','ended'].includes(d.state)?a.dir+16:a.dir;
    drawPenguin(a,logical,now);
    if(a.spriteReady)ctx.drawImage(a.sprite,a.x-40*scale,a.y-75*scale,80*scale,96*scale);
    if(d.leader)label('★',a.x,a.y-50*scale,'#e3ab13');
    const text=waiting(d)?'Waiting on you!':d.state==='limited'?'z z z':d.state==='working'?'•'.repeat(1+Math.floor(now*2)%3):d.state==='none'?'?':null;
    if(text)bubble(text,a.x,a.y-(d.leader?72:58)*scale);
    label(d.player&&d.name!=='You'?d.name+' (you)':d.name,a.x,a.y+24*scale);
  }else{const img=puffleImage(d.color);const bob=paused?0:Math.abs(Math.sin(now*4+a.phase))*3;
    ctx.fillStyle='#0002';ctx.beginPath();ctx.ellipse(a.x,a.y+4,15,4,0,0,Math.PI*2);ctx.fill();
    if(img.complete&&img.naturalWidth)ctx.drawImage(img,a.x-26,a.y-40-bob,52,52);
    label(d.name.length>19?d.name.slice(0,18)+'…':d.name,a.x,a.y+20);
    if(d.state==='completed')label('✓',a.x+20,a.y-26,'#247d55');if(d.state==='limited')bubble('z z z',a.x,a.y-48);
  }
  if(a.button){a.button.style.left=a.x/W*100+'%';a.button.style.top=a.y/H*100+'%';}
}
function frame(ms){if(frameId)cancelAnimationFrame(frameId);const dt=last?Math.min((ms-last)/1000,.05):0;last=ms;if(!paused)tick+=dt;
  if(ready){ctx.setTransform(2,0,0,2,0,0);ctx.clearRect(0,0,W,H);
    if(!paused&&Math.floor((tick-dt)*24)!==Math.floor(tick*24))room.tick();
    ctx.drawImage(renderer.render(room),0,0);
    const ds=[...actors.values()].filter(a=>isPenguin(a.data));
    ds.forEach((a,i)=>{const [x,y]=target(a,i,tick);if(!paused)move(a,x,y,dt);});
    let solo=0;for(const a of actors.values())if(!isPenguin(a.data)){const p=actors.get(a.data.parent),siblings=[...actors.values()].filter(x=>!isPenguin(x.data)&&x.data.parent===a.data.parent),i=siblings.indexOf(a);
      const x=p?Math.min(650,p.x+42+(i%3)*32):230+solo++*42,y=p?p.y+18+Math.floor(i/3)*28:400;
      if(!paused)move(a,x,y,dt);}
    const dx=(keys.has('ArrowRight')||keys.has('d')?1:0)-(keys.has('ArrowLeft')||keys.has('a')?1:0),dy=(keys.has('ArrowDown')||keys.has('s')?1:0)-(keys.has('ArrowUp')||keys.has('w')?1:0);
    if(dx||dy){player.tx=player.x+dx*8;player.ty=player.y+dy*8;}
    // Pausing the agents' animation still lets the person explore the room.
    move(player,player.tx,player.ty,dt);player.clock=(player.clock||0)+dt;
    canvas.dataset.playerX=player.x.toFixed(1);canvas.dataset.playerY=player.y.toFixed(1);
    canvas.dataset.playerAction=player.action||'stand';
    [...actors.values(),player].sort((a,b)=>a.y-b.y).forEach(a=>drawActor(a,a.data.player?player.clock:tick));
    canvas.dataset.readyPenguins=String([...actors.values(),player].filter(a=>isPenguin(a.data)&&a.spriteReady).length);
    if(state?.finished)label('MARKET COMPLETE',380,442,'#235e4c');
  }frameId=requestAnimationFrame(frame);
}
async function poll(){try{const r=await fetch('/state.json',{cache:'no-store'});if(!r.ok)throw new Error('State unavailable');const s=await r.json();if(s.error)throw new Error(s.error);apply(s);if(ready&&document.hidden)frame(performance.now());}
  catch(e){if(++misses>=3){$('connection').textContent='● DISCONNECTED';error('The room lost its connection. '+e.message+' · Reattach with pantheon-club attach NET.');}}
  setTimeout(poll,2000);
}
init().catch(e=>{error(e.message);$('connection').textContent='● ASSET ERROR';});
