import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, access, unlink } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import net from 'node:net';
import { transformRoomScene } from './upstream.mjs';

const here = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const upstream = join(here, '.upstream/claude-penguin');
const args = process.argv.slice(2);
const input = args.shift() || 'demo';
let port = 8767, metadata;
while (args.length) {
  const key = args.shift(), value = args.shift();
  if (key === '--port') port = Number(value);
  else if (key === '--metadata') metadata = resolve(value);
  else throw new Error(`Unknown option ${key}`);
}
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid local port');
await access(join(upstream, 'client/public/assets')).catch(() => {
  throw new Error('Run scripts/setup-game first to install the pinned upstream game.');
});
const { createServer } = await import(pathToFileURL(join(upstream, 'client/node_modules/vite/dist/node/index.js')));
const freePort = () => new Promise((yes, no) => {
  const s = net.createServer(); s.on('error', no);
  s.listen(0, '127.0.0.1', () => { const n = s.address().port; s.close(() => yes(n)); });
});
if (!port) port = await freePort();
const apiPort = await freePort(), wsPort = await freePort();
const origin = `http://127.0.0.1:${port}`, api = `http://127.0.0.1:${apiPort}`;
const data = metadata ? dirname(metadata) : join(here, '.local-game');
await mkdir(data, { recursive: true });
const children = [];
let closing = false, vite;
async function close(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill('SIGTERM');
  // Remove the process record before closing the last event-loop handles.
  // Vite may finish closing after Node has no remaining referenced handles.
  if (metadata) {
    try {
      if (JSON.parse(await readFile(metadata, 'utf8')).pid === process.pid) await unlink(metadata);
    } catch {}
  }
  await vite?.close();
  process.exit(code);
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => close());
function child(command, argv, env = {}) {
  const p = spawn(command, argv, { cwd: here, env: { ...process.env, ...env }, stdio: ['ignore', 'inherit', 'inherit'] });
  children.push(p);
  p.on('error', error => { console.error(error); close(1); });
  p.on('exit', code => { if (!closing) { console.error(`${command} stopped (${code})`); close(1); } });
  return p;
}
child(process.env.PYTHON || 'python3', [join(here, 'pantheon-club'), 'api', input, '--port', String(apiPort)]);
const entry = join(upstream, 'server/src/index.js');
child(process.execPath, ['--import', join(here, 'game/loopback.mjs'), entry], {
  PORT: String(wsPort), PENGUIN_DB: join(data, 'penguin.db'),
  CLUB_SERVER_ENTRY: entry, CLUB_GAME_ORIGIN: origin,
});
try {
  vite = await createServer({
    root: join(upstream, 'client'), configFile: false,
    define: { 'import.meta.env.VITE_WS_URL': JSON.stringify(`ws://127.0.0.1:${wsPort}`) },
    server: {
      host: '127.0.0.1', port, strictPort: true, cors: false,
      fs: { strict: true, allow: [join(upstream, 'client')] },
      proxy: {
        '/state.json': { target: api },
        '/focus': { target: api, headers: { Origin: api } },
      },
    },
    plugins: [{
      name: 'pantheon-igloo',
      resolveId(id) {
        if (id === 'virtual:pantheon-club') return '\0pantheon-club';
        if (id === 'virtual:pantheon-movement') return '\0pantheon-movement';
      },
      load(id) {
        const file = id === '\0pantheon-club' ? 'igloo.js' : id === '\0pantheon-movement' ? 'movement.mjs' : null;
        if (file) {
          this.addWatchFile(join(here, 'game', file));
          return readFile(join(here, 'game', file), 'utf8');
        }
      },
      transform(code, id) {
        if (id.split('?')[0] === join(upstream, 'client/src/scenes/RoomScene.js')) return transformRoomScene(code);
        if (id.split('?')[0] !== join(upstream, 'client/src/main.js')) return;
        if (!code.includes('const config =')) throw new Error('Upstream entry point changed; review the Club adapter.');
        return "import {installClub} from 'virtual:pantheon-club';\n" + code.replace('const config =', 'installClub(RoomScene);\nconst config =');
      },
      configureServer(server) {
        server.middlewares.use('/focus', (req, res, next) => {
          if (req.headers.origin && ![origin, origin.replace('127.0.0.1', 'localhost')].includes(req.headers.origin)) {
            res.statusCode = 403; res.end('foreign origin'); return;
          }
          next();
        });
      },
    }],
  });
  await vite.listen();
  for (let i = 0; i < 100; i++) {
    try {
      const response = await fetch(api + '/state.json');
      const state = await response.json();
      if (state.error) throw new Error(state.error);
      if (response.ok) {
        await new Promise((yes, no) => {
          const socket = net.connect(wsPort, '127.0.0.1', () => { socket.end(); yes(); });
          socket.on('error', no);
        });
        break;
      }
    } catch (error) { if (i === 99) throw error; }
    if (i === 99) throw new Error('Pantheon state bridge did not start');
    await new Promise(r => setTimeout(r, 100));
  }
  const url = `${origin}/?room=igloo&penguin=You`;
  if (metadata) await writeFile(metadata, JSON.stringify({ pid: process.pid, port, apiPort, wsPort, url }) + '\n');
  console.log(`CLUB_GAME_URL=${url}`);
  console.log('Local game only: client, WebSocket server, and state bridge listen on 127.0.0.1.');
} catch (error) { console.error(error); await close(1); }
