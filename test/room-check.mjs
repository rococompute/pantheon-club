// Validate the actual pinned room timeline and animation metadata without a browser.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root=new URL('../club/',import.meta.url);
const module=await readFile(new URL('vendor/swl.js',root),'utf8');
const {loadSwl,SwlScene}=await import('data:text/javascript;base64,'+Buffer.from(module).toString('base64'));
const scene=new SwlScene(loadSwl(await readFile(new URL('assets/coffee.swl',root))));
for(const path of ['block_mc','triggers_mc','block','triggers'])scene.visible(path,false);
assert.equal(scene.s.width,760);assert.equal(scene.s.height,480);assert.ok(scene.prepare());
for(let i=0;i<240;i++)assert.ok(scene.tick());
assert.ok(scene.s.draw.length>5);assert.equal(scene.s.error,null);
const data=JSON.parse(await readFile(new URL('assets/penguin-frames.json',root),'utf8'));
for(const action of ['idle','walk','sit'])for(let dir=1;dir<=8;dir++){
 const seq=data.sequences[action][dir];assert.ok(seq.count>0);
 for(let i=seq.start;i<seq.start+seq.count;i++){
  const f=data.frames[i];assert.ok(f.frame.x+f.frame.w<=1024);assert.ok(f.frame.y+f.frame.h<=1024);
  assert.ok(Number.isFinite(f.offset.left)&&Number.isFinite(f.offset.top));
 }
}
const puffles=await readFile(new URL('assets/puffle.pack',root),'utf8');
assert.equal([...puffles.matchAll(/<svg[\s\S]*?<\/svg>/g)].length,4);
console.log('Room timeline: 240 ticks; 8-way idle, walk, sit sprites; 4 puffle shapes: OK');
