// Keep upstream's server intact on disk; constrain its listener at load time.
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';

const entry = pathToFileURL(process.env.CLUB_SERVER_ENTRY).href;
const origin = process.env.CLUB_GAME_ORIGIN;
registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (url !== entry) return result;
    const source = Buffer.from(result.source).toString();
    const before = 'new WebSocketServer({ port: PORT,';
    if (!source.includes(before)) throw new Error('Upstream server listener changed; review the loopback adapter.');
    const allowed = [origin, origin.replace('127.0.0.1', 'localhost')];
    return { ...result, source: source.replace(before,
      `new WebSocketServer({ host: '127.0.0.1', verifyClient: ({origin}) => !origin || ${JSON.stringify(allowed)}.includes(origin), port: PORT,`) };
  },
});
