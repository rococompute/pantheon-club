// Browser integration check against an already-running LOCAL native game.
// Node 24+, Chrome; usage: node test/game-check.mjs [http://127.0.0.1:8767/...]
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const url = new URL(process.argv[2] || 'http://127.0.0.1:8767/?room=igloo&penguin=You');
assert(['127.0.0.1', 'localhost'].includes(url.hostname), 'Only test a local game');
const profile = await mkdtemp(join(tmpdir(), 'club-game-check-'));
const chrome = spawn(process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--no-first-run', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank',
], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, serial = 0;
const pending = new Map(), exceptions = [], hosts = new Set();
chrome.on('error', e => { console.error(e.message); });
try {
  const { readFile } = await import('node:fs/promises');
  let port;
  for (let i = 0; i < 100 && !port; i++) {
    try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; } catch {}
    if (!port) await sleep(100);
  }
  assert(port, 'Chrome did not start');
  const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  ws = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
  await new Promise((yes, no) => { ws.onopen = yes; ws.onerror = no; });
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id) {
      const p = pending.get(m.id); pending.delete(m.id);
      if (m.error) p?.reject(new Error(JSON.stringify(m.error))); else p?.resolve(m.result);
    } else if (m.method === 'Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails);
    else if (m.method === 'Network.requestWillBeSent') {
      const request = new URL(m.params.request.url);
      if (['http:', 'https:'].includes(request.protocol)) hosts.add(request.hostname);
    } else if (m.method === 'Network.webSocketCreated') hosts.add(new URL(m.params.url).hostname);
  };
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial;
    pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  const until = async (expression, label, limit = 400) => {
    for (let i = 0; i < limit; i++) { if (await evaluate(expression)) return; await sleep(100); }
    console.error('Browser state:', await evaluate("(()=>{let c=window.__pantheonClub,s=c?.scene;return {room:s?.currentRoom,ready:s?._playerReady,map:s?.mapOpen,penguins:c?.penguins.size,puffles:c?.puffles.size,body:document.body.innerText.slice(0,500),pointer:s&&[s.input.activePointer.worldX,s.input.activePointer.worldY]}})()"));
    console.error('Exceptions:', exceptions);
    throw new Error('Timed out: ' + label);
  };
  const click = async (x, y) => {
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    // Newly built native map zones enter Phaser's input list on its next
    // frame. Move the pointer and let that frame run before pressing.
    await evaluate('new Promise(requestAnimationFrame)');
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await evaluate('new Promise(requestAnimationFrame)');
  };
  const worldClick = async (x, y) => {
    const p = await evaluate(`(()=>{const r=document.querySelector('canvas').getBoundingClientRect();return {x:r.left+${x}/760*r.width,y:r.top+${y}/480*r.height}})()`);
    await click(p.x, p.y);
  };
  await call('Runtime.enable'); await call('Network.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1100, height: 760, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url: url.href });
  await until('window.__pantheonClub?.scene._playerReady && window.__pantheonClub.penguins.size > 0', 'own igloo and native penguins');
  await evaluate('window.club=window.__pantheonClub;clearInterval(club.timer)');
  await until('!club.fetching', 'last state poll');
  await evaluate(`(()=>{const roots=club.state.agents.filter(a=>a.avatar==='penguin');
    club.apply({...club.state,agents:[...roots.map(a=>({...a,state:'working'})),
      ...[1,2].map(i=>({name:'browser-check-'+i,parent:roots[0].name,avatar:'puffle',state:'working'}))]});})()`);
  await until('[...club.penguins.values()].every(p=>p.entity.sprite) && [...club.puffles.values()].every(p=>p.view._ready)', 'native sprites');
  assert.equal(await evaluate('club.puffles.size'), 2);
  assert.equal(await evaluate('new Set([...club.puffles.values()].map(p=>p.view.color)).size'), 1, 'siblings share native color');
  assert(await evaluate('(()=>{const p=[...club.puffles.values()];return Math.abs(p[0].view.x-p[1].view.x)>20})()'), 'sibling puffles do not overlap');
  const before = await evaluate('[club.scene.localPlayer.x,club.scene.localPlayer.y]');
  await worldClick(500, 365);
  await sleep(1500);
  const after = await evaluate('[club.scene.localPlayer.x,club.scene.localPlayer.y]');
  assert(Math.hypot(after[0] - before[0], after[1] - before[1]) > 30, 'floor click moves the player');
  const agentPoint = await evaluate("(()=>{const p=[...club.penguins.values()][0];p.entity.moveTween?.stop();p.entity.isMoving=false;return [p.entity.x,p.entity.y-20]})()");
  await worldClick(...agentPoint);
  await until('!!club.selected', 'agent click opens work card');
  await evaluate("document.querySelector('[data-close]').click()");
  await worldClick(45, 444); // original map button
  await until('club.scene.mapOpen && club.scene.islandMap._built', 'native map');
  const zones = await evaluate("club.scene.islandMap.container.list.filter(o=>o.type==='Zone').map(o=>[o.x,o.y])");
  assert(zones.length > 5, 'native map destinations exist');
  await worldClick(...zones[0]);
  await until("club.scene.currentRoom !== 'igloo' && club.penguins.size===0 && club.puffles.size===0", 'map travel clears agents');
  const destination = await evaluate('club.scene.currentRoom');
  await evaluate("club.scene.changeRoom('town',380,350)");
  await until("club.scene.currentRoom==='town' && club.scene._movieReady && club.scene.movie?._clubCollisionReady && !club.scene._pendingSpawn", 'Town collision before walking');
  // This actual Town-wall target previously rounded the player's feet onto
  // a blocked pixel, after which every click returned its starting point.
  await worldClick(451, 100);
  await until('Math.hypot(club.scene.localPlayer.x-380,club.scene.localPlayer.y-350)>20', 'approach the wall');
  await until('!club.scene.localPlayer.isMoving', 'walk towards the Gift Shop wall');
  assert(await evaluate('!club.scene.movie.hitBlock(club.scene.localPlayer.x,club.scene.localPlayer.y)'), 'wall-edge click ends outside collision');
  await worldClick(380, 350);
  await until('Math.hypot(club.scene.localPlayer.x-380,club.scene.localPlayer.y-350)<5', 'walk away from the wall');
  // Recreate the old gap between visible artwork and a ready block mask.
  await evaluate('window.townBlock=club.scene.movie._block;club.scene.movie._block=null;club.scene.movie._clubCollisionReady=false');
  await worldClick(590, 190); await sleep(500);
  assert(await evaluate('Math.hypot(club.scene.localPlayer.x-380,club.scene.localPlayer.y-350)<5'), 'early building click waits for collision');
  await evaluate('club.scene.movie._block=window.townBlock;club.scene.movie._clubCollisionReady=true');
  // A saved/already-stuck position must recover on the next floor click.
  await evaluate('club.scene.localPlayer.moveTween?.stop();club.scene.localPlayer.setPosition(589,189);void 0');
  assert(await evaluate('club.scene.movie.hitBlock(589,189)'), 'the reproduced missed-door point is inside the building');
  await worldClick(380, 350);
  await until('!club.scene.localPlayer.isMoving && !club.scene.movie.hitBlock(club.scene.localPlayer.x,club.scene.localPlayer.y)', 'escape an already blocked position');
  // Existing walk-to-door / room triggers still work with ready collision.
  await evaluate('club.scene.localPlayer.setPosition(380,350);club.scene.localPlayer.updateDepth();void 0');
  const shop = await evaluate("(()=>{const b=club.scene._interactions.buttons.find(b=>b.path.endsWith('shop_btn')).bounds;return [(b[0]+b[2])/2,(b[1]+b[3])/2]})()");
  await worldClick(...shop);
  await until("club.scene.currentRoom==='shop' && club.scene._movieReady", 'enter the Gift Shop through its door');
  await evaluate("club.scene._showGameUnavailable('beans')");
  await until("club.scene._minigame?.isOpen && !!document.querySelector('iframe')?.contentDocument?.querySelector('iframe')?.contentDocument?.querySelector('.start-button')", 'upstream Bean Counters minigame');
  await evaluate("document.querySelector('iframe').contentDocument.querySelector('iframe').contentDocument.querySelector('.start-button').click()");
  await until("!!document.querySelector('iframe')?.contentDocument?.querySelector('iframe')?.contentDocument?.querySelector('.play-area .player')", 'Bean Counters starts playing');
  await evaluate('club.scene._closeMinigame()');
  await evaluate('club.scene._enterIgloo()');
  await until("club.scene.currentRoom==='igloo' && club.penguins.size>0 && [...club.puffles.values()].every(p=>p.view._ready)", 'returning to the igloo restores agents');
  await evaluate("club.scene._iglooVisit='someone-else'");
  await until('club.penguins.size===0 && club.puffles.size===0', 'no agents in another igloo');
  await evaluate('club.scene._iglooVisit=null');
  await until('club.penguins.size>0', 'own igloo restored');
  await sleep(1500);
  const screenshot = await call('Page.captureScreenshot', { format: 'png' });
  const screenshotPath = process.env.CLUB_SCREENSHOT || join(tmpdir(), 'pantheon-native-igloo.png');
  await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));
  assert.deepEqual([...hosts].filter(h=>!['127.0.0.1','localhost'].includes(h)), [], 'all game traffic stays local');
  assert.deepEqual(exceptions, [], 'no browser exceptions');
  console.log(JSON.stringify({ passed: true, nativeMapDestination: destination, fps: await evaluate('window.__game.loop.actualFps'), screenshot: screenshotPath }));
} finally {
  ws?.close(); chrome.kill();
  await new Promise(r => { if (chrome.exitCode !== null) r(); else chrome.once('exit', r); });
  await rm(profile, { recursive: true, force: true });
}
