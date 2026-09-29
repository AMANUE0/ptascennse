const http = require('node:http');
const path = require('node:path');
const next = require('next');
const { WebSocketServer, WebSocket } = require('ws');

const dev = !process.argv.includes('--production');
process.env.NODE_ENV = dev ? 'development' : 'production';
process.env.CRAFTPANEL_ROOT ||= __dirname;
const port = Number(process.env.PORT || 3000);
const hostname = process.env.HOSTNAME || '0.0.0.0';
const app = next({ dev, dir: __dirname, port, hostname });
const handle = app.getRequestHandler();
const server = http.createServer((req,res) => handle(req,res));
const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
module.exports = { server, wss };
const sessions = new Set();
const snapshot = async cookie => {
  const response = await fetch(`http://127.0.0.1:${port}/api/servers`, { headers: { cookie }, redirect: 'manual', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error((response.status === 401 || response.status === 403) ? 'unauthorized' : 'unavailable');
  return JSON.stringify({ type: 'servers', ...(await response.json()) });
};
function refresh(session) {
  if (session.loading) { session.again = true; return; }
  session.loading = true;
  snapshot(session.cookie).then(data => {
    if (session.ws.readyState !== WebSocket.OPEN) return;
    if (data !== session.previous) {
      if (session.ws.bufferedAmount > 1024 * 1024) return session.ws.close(1013, 'Cliente lento');
      session.ws.send(data); session.previous = data;
    }
  }).catch(error => {
    if (error.message === 'unauthorized') session.ws.close(1008, 'Sesión expirada');
    else session.ws.close(1013, 'Reconectando');
  }).finally(() => {
    session.loading = false;
    if (session.again && session.ws.readyState === WebSocket.OPEN) { session.again = false; refresh(session); }
  });
}
let debounce;
globalThis.craftpanelNotify = () => {
  clearTimeout(debounce);
  debounce = setTimeout(() => { for (const session of sessions) refresh(session); }, 40);
};
app.prepare().then(() => {
  const upgrade = app.getUpgradeHandler();
  server.on('upgrade', async (req, socket, head) => {
    if (req.url?.split('?')[0] !== '/ws/panel') return upgrade(req,socket,head);
    socket.on('error', () => {});
    let origin;
    try { origin = new URL(req.headers.origin); } catch { socket.destroy(); return; }
    if (origin.host !== req.headers.host || !['http:', 'https:'].includes(origin.protocol)) { socket.destroy(); return; }
    try {
      const cookie = req.headers.cookie || '';
      const initial = await snapshot(cookie);
      wss.handleUpgrade(req,socket,head,ws => {
        const session = { ws, cookie, previous: initial, loading: false, again: false, alive: true };
        sessions.add(session); ws.send(initial);
        ws.on('pong', () => { session.alive = true; });
        ws.on('error', () => {});
        ws.on('close', () => sessions.delete(session));
        // This channel is read-only; all mutations use permission-checked HTTP routes.
        ws.on('message', () => ws.close(1008, 'Canal de solo lectura'));
      });
    } catch { socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); socket.destroy(); }
  });
  const heartbeat = setInterval(() => {
    for (const session of sessions) {
      if (!session.alive) { session.ws.terminate(); continue; }
      session.alive = false; session.ws.ping(); refresh(session);
    }
  }, 10000);
  server.on('close', () => clearInterval(heartbeat));
  server.listen(port, hostname, () => console.log(`CraftPanel listo en http://localhost:${port} (WebSocket /ws/panel)`));
}).catch(error => { console.error(error); process.exitCode = 1; });
