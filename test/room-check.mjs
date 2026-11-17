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
const data=JSON.parse(await readFile(new URL('assets/penguin/timelines.json',root),'utf8'));
assert.ok(data.main.frames.length>=26,'Native idle, eight directions of walk and sit, wave, and dance timelines');
for(const name of ['body','ring','hotspot'])assert.ok(data.main.frames[0].some(e=>e.name===name),'Native '+name+' layer');
for(const file of data.chunks.files)assert.ok((await readFile(new URL('assets/penguin/chars/'+file,root))).length>0);
const puffles=await readFile(new URL('assets/puffle.pack',root),'utf8');
assert.equal([...puffles.matchAll(/<svg[\s\S]*?<\/svg>/g)].length,4);
console.log('Room timeline: 240 ticks; native body/ring/hotspot layers and animation packs; 4 puffle shapes: OK');
