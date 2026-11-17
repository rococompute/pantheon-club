// Real browser acceptance: native vector rendering, walking, collision limits,
// customization, persistence, and the independent player/agent state.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
const moduleName=process.env.PLAYWRIGHT_MODULE||'playwright';
const {chromium}=await import(moduleName.startsWith('/')?pathToFileURL(moduleName).href:moduleName);
const root=fileURLToPath(new URL('../',import.meta.url));
const server=spawn(process.env.PYTHON||'python3',[root+'pantheon-club','view','demo'],{cwd:root,stdio:['ignore','pipe','pipe']});
let browser;
try {
 const url=await new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>reject(new Error('View server did not start')),15000);
  server.stdout.on('data',b=>{const m=String(b).match(/http:\/\/127\.0\.0\.1:\d+\//);if(m){clearTimeout(timeout);resolve(m[0]);}});
  server.once('error',reject);server.once('exit',code=>reject(new Error('View exited '+code)));
 });
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
 const page=await browser.newPage({viewport:{width:1000,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);
 await page.waitForFunction(()=>Number(document.querySelector('#scene').dataset.readyPenguins)>=5);
 assert.match(await page.locator('#counts').textContent(),/4 agent penguins/);
 const position=()=>page.locator('#scene').evaluate(c=>({x:Number(c.dataset.playerX),y:Number(c.dataset.playerY)}));
 const clickFloor=async(x,y)=>{const r=await page.locator('#scene').boundingBox();await page.mouse.click(r.x+x*r.width/760,r.y+y*r.height/480);};
 const before=await position();await clickFloor(620,410);
 await page.waitForFunction(()=>Number(document.querySelector('#scene').dataset.playerX)>615);
 assert.ok((await position()).x>before.x+200,'Player walks to the clicked floor');
 await page.keyboard.down('ArrowLeft');await page.waitForTimeout(250);await page.keyboard.up('ArrowLeft');
 const moved=await position();assert.ok(moved.x<610,'Arrow keys move the player');
 await clickFloor(450,260);await page.waitForTimeout(150);
 assert.ok(Math.abs((await position()).x-moved.x)<3,'Counter clicks do not move the player');
 await page.getByRole('button',{name:'Customize your penguin'}).click();
 await page.locator('#player-name').fill('Explorer');
 await page.locator('#player-color').fill('#e239ab');
 await page.getByRole('button',{name:'Dance',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#scene').dataset.playerAction==='dance');
 await page.waitForTimeout(400);
 const colored=await page.locator('#scene').evaluate(c=>{
  const x=Number(c.dataset.playerX),y=Number(c.dataset.playerY);
  const pixels=c.getContext('2d').getImageData((x-40)*2,(y-70)*2,160,160).data;
  let match=0;for(let i=0;i<pixels.length;i+=4)if(Math.abs(pixels[i]-226)<4&&Math.abs(pixels[i+1]-57)<4&&Math.abs(pixels[i+2]-171)<4&&pixels[i+3]>200)match++;
  return match;
 });
 assert.ok(colored>40,'Native body transform renders the selected color');
 await page.reload();await page.waitForFunction(()=>Number(document.querySelector('#scene').dataset.readyPenguins)>=5);
 await page.getByRole('button',{name:'Customize your penguin'}).click();
 assert.equal(await page.locator('#player-name').inputValue(),'Explorer');assert.equal(await page.locator('#player-color').inputValue(),'#e239ab');
 await page.getByRole('button',{name:'Close penguin settings'}).click();
 await page.screenshot({path:process.env.CLUB_SCREENSHOT||'/private/tmp/pantheon-club-acceptance.png'});
 assert.deepEqual(errors,[],'No browser runtime errors');
 console.log('Native penguins, player walking, arrow keys, counter collision, body color, dance, and saved identity: OK');
} finally {await browser?.close();server.kill('SIGTERM');}
