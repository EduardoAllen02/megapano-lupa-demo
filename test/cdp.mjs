// Mini cliente CDP para pruebas funcionales. Uso: node test/cdp.mjs <cmd> [args]
//   open <url> | eval <js> | shot <archivo> | move x y | down x y | dragto x y | up x y | wheel x y dy | close
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const STATE = path.join(dir, '.tab.json');
const HOST = 'http://localhost:9222';
const [cmd, ...a] = process.argv.slice(2);

async function getTab() {
  if (cmd === 'open') {
    const r = await fetch(`${HOST}/json/new?${a[0]}`, { method: 'PUT' });
    const t = await r.json();
    fs.writeFileSync(STATE, JSON.stringify({ id: t.id, ws: t.webSocketDebuggerUrl }));
    return t;
  }
  return JSON.parse(fs.readFileSync(STATE, 'utf8'));
}

const tab = await getTab();
const ws = new WebSocket(tab.webSocketDebuggerUrl ?? tab.ws);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let n = 0; const pend = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
const send = (method, params = {}) => new Promise((res) => { const id = ++n; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result.exceptionDetails) return 'EXC: ' + JSON.stringify(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text);
  return r.result.result.value;
};
const mouse = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x: +x, y: +y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...extra });

switch (cmd) {
  case 'open': await send('Page.enable'); await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 800, deviceScaleFactor: 1, mobile: false }); console.log('tab', tab.id); break;
  case 'eval': console.log(JSON.stringify(await ev(a.join(' ')), null, 1)); break;
  case 'shot': {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(a[0], Buffer.from(r.result.data, 'base64')); console.log('saved', a[0]); break;
  }
  case 'move': await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: +a[0], y: +a[1] }); break;
  case 'down': await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: +a[0], y: +a[1] }); await mouse('mousePressed', a[0], a[1]); break;
  case 'dragto': await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: +a[0], y: +a[1], button: 'left', buttons: 1 }); break;
  case 'up': await mouse('mouseReleased', a[0], a[1]); break;
  case 'wheel': await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: +a[0], y: +a[1], deltaX: 0, deltaY: +a[2] }); break;
  case 'size': await send('Emulation.setDeviceMetricsOverride', { width: +a[0], height: +a[1], deviceScaleFactor: 1, mobile: a[2] === 'mobile' }); break;
  case 'close': await fetch(`${HOST}/json/close/${tab.id}`); break;
  default: console.log('cmd?');
}
ws.close();
