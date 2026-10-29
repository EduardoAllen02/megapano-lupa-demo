// Alineación a 1x: lupa encendida vs apagada, mismo punto -> mismos píxeles. Guarda align_*.png; el diff lo calcula align.py
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const tab = JSON.parse(fs.readFileSync(path.join(dir, '.tab.json'), 'utf8'));
const ws = new WebSocket(tab.ws);
await new Promise((r) => (ws.onopen = r));
let n = 0; const pend = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); pend.get(d.id)?.(d); pend.delete(d.id); };
const send = (method, params = {}) => new Promise((res) => { const id = ++n; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const ev = (expr) => send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }).then((r) => r.result.result.value);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(dir, name), Buffer.from(r.result.data, 'base64')); };

await ev(`document.getElementById('lens').classList.add('plain'); null`);
await ev('app.st.mag = 1; null');
const W = await ev('document.getElementById("main").clientWidth');
const cases = [
  ['centro', 0.3, 0.1, W / 2, 400],
  ['costura', Math.PI - 0.01, 0.0, W / 2, 400],
  ['fueracentro', 0.3, 0.1, W / 2 + 350, 300],
  ['zenit', 0.5, 1.45, W / 2, 400],
  ['nadir', 2.0, -1.4, W / 2, 400],
];
for (const [name, yaw, pitch, x, y] of cases) {
  await ev(`app.main.rotate({yaw:${yaw}, pitch:${pitch}}); app.main.zoom(40); null`);
  await sleep(2500);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await sleep(3500);
  await shot(`align_${name}_on.png`);
  const info = await ev(`JSON.stringify({tf: document.getElementById('lens').style.transform, hf: app.st.lastLensFov, mf: app.main.state.hFov})`);
  await ev(`document.getElementById('lens').style.visibility='hidden'; null`); await sleep(300);
  await shot(`align_${name}_off.png`);
  await ev(`document.getElementById('lens').style.visibility='visible'; null`);
  fs.writeFileSync(path.join(dir, `align_${name}.json`), JSON.stringify({ x, y, info: JSON.parse(info) }));
}
ws.close();
