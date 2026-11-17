// Exercise initialization, state polling, rendering, and cards without a
// browser process or network listener. Canvas calls are recorded, not rasterized.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setTimeout as wait} from 'node:timers/promises';
const root=new URL('../club/',import.meta.url), elements=new Map(), raf=[], timers=[];
let drawCalls=0;
const context=new Proxy({measureText:text=>({width:text.length*7})},{get:(target,key)=>target[key]||(()=>{if(key==='drawImage')drawCalls++;}),set:(target,key,value)=>(target[key]=value,true)});
class Element {
 constructor(){this.style={};this.children=[];this.hidden=true;this.textContent='';this.attributes={};}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=children;}
 setAttribute(key,value){this.attributes[key]=value;}
 getContext(){return context;}
 remove(){for(const e of elements.values())e.children=e.children.filter(c=>c!==this);}
 showModal(){this.hidden=false;}
 close(){this.hidden=true;}
}
globalThis.document={getElementById:id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);},createElement:()=>new Element(),addEventListener(){}};
globalThis.matchMedia=()=>({matches:false,addEventListener(){}});
globalThis.Image=class {constructor(){this.width=1024;this.height=1024;this.naturalWidth=1024;this.complete=true;}set src(value){this._src=value;queueMicrotask(()=>this.onload?.());}};
globalThis.DOMParser=class {parseFromString(source){return {documentElement:{querySelector:()=>({innerHTML:source.match(/<g[^>]*>([\s\S]*)<\/g>/)[1]})}};}};
globalThis.requestAnimationFrame=fn=>raf.push(fn);
globalThis.setTimeout=fn=>timers.push(fn);
const state={network:'fixture',live:true,title:'Market (codex leader)',term:3,height:25,finished:false,tasks:[],bids:[],agents:[
 {name:'codex',diplomat:true,color:'#10a37f',state:'working',leader:true,pending:[]},
 {name:'claude',diplomat:true,color:'#d97757',state:'needs_input',pending:[]},
 {name:'task-42',diplomat:false,cloud:true,parent:'codex',color:'#10a37f',state:'working',task:'Prove codec',pending:[]}
]};
globalThis.fetch=async(path,opts)=>{
 if(path==='/state.json')return Response.json(state);
 if(path.startsWith('/focus'))return new Response('ok');
 return new Response(await readFile(new URL(path.slice(1),root)));
};
const data=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const swl=data(await readFile(new URL('vendor/swl.js',root),'utf8'));
const renderer=data((await readFile(new URL('vendor/swlCanvas.js',root),'utf8')).replace("'./swl.js'",JSON.stringify(swl)));
const source=(await readFile(new URL('club.js',root),'utf8')).replace("'./vendor/swl.js'",JSON.stringify(swl)).replace("'./vendor/swlCanvas.js'",JSON.stringify(renderer));
await import(data(source));
for(let i=0;i<100&&!raf.length;i++)await wait(5);
assert.ok(raf.length,'Client initialized: '+elements.get('error')?.textContent);
for(let i=0;i<180;i++){const fn=raf.shift();fn(i*16.67);}
assert.equal(elements.get('connection').textContent,'● LIVE');
assert.equal(elements.get('characters').children.length,3);
assert.ok(drawCalls>100,'Room and sprites draw');
const worker=elements.get('characters').children[2];worker.onclick();
assert.equal(elements.get('card-name').textContent,'task-42');
assert.equal(elements.get('card-task').textContent,'Prove codec');
assert.equal(elements.get('focus-agent').textContent,'Open parent tab ↗');
await elements.get('focus-agent').onclick();
state.agents.pop();await timers.shift()();
assert.equal(elements.get('characters').children.length,2);
assert.equal(elements.get('card').hidden,true);
console.log('Client initialization, 180 render frames, worker card, parent focus, worker removal: OK');
