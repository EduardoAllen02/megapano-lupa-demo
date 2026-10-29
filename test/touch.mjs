// Prueba touch en viewport móvil emulado.
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
const touch = (type, pts) => send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) });
const log = (k, ok, i = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${k}  ${i}`);

await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await ev('location.reload()'); await sleep(7000);
log('M1 listo en móvil', await ev('!!(window.app?.main.state.ready && app.lens.state.ready)'));

await sleep(1500);
const y0 = await ev('app.main.getPosition().yaw');
await touch('touchStart', [[195, 450]]); await sleep(400);
let s = await ev(`JSON.stringify({d: document.getElementById('lens').style.display, tf: document.getElementById('lens').style.transform})`);
log('M2 lupa aparece al tocar', JSON.parse(s).d === 'block', s);
for (let i = 1; i <= 12; i++) { await touch('touchMove', [[195 - i * 10, 450]]); await sleep(30); }
await sleep(300);
s = await ev(`JSON.stringify({d: document.getElementById('lens').style.display, tf: document.getElementById('lens').style.transform, yaw: app.main.getPosition().yaw})`);
const j = JSON.parse(s);
log('M3 pan con un dedo mueve el visor', Math.abs(j.yaw - y0) > 0.02, `Δyaw=${(j.yaw - y0).toFixed(3)}`);
log('M3b lupa sigue visible durante pan', j.d === 'block', s);
await touch('touchEnd', []); await sleep(400);
s = await ev(`document.getElementById('lens').style.display`);
log('M4 lupa se oculta al soltar', s === 'none', s);
// lupa 240px en pantalla de 390: dentro de pantalla?
await touch('touchStart', [[375, 90]]); await sleep(400);
s = await ev(`(() => { const r = document.getElementById('lens').getBoundingClientRect(); return JSON.stringify({l: r.left, t: r.top, r: r.right, b: r.bottom, W: innerWidth}); })()`);
const r = JSON.parse(s);
await shot('s_touch_edge.png');
log('M5 lupa no se sale de pantalla cerca de bordes', r.r > 0 && r.l >= 0 && r.t >= 0 && r.r <= r.W, s);
await touch('touchEnd', []);
// dos dedos: pinch zoom
const f0 = await ev('app.main.state.hFov');
await touch('touchStart', [[150, 400], [250, 400]]); await sleep(100);
for (let i = 1; i <= 10; i++) { await touch('touchMove', [[150 - i * 8, 400], [250 + i * 8, 400]]); await sleep(30); }
await touch('touchEnd', []); await sleep(500);
const f1 = await ev('app.main.state.hFov');
log('M6 pinch-zoom cambia FOV', Math.abs(f1 - f0) > 1, `${f0.toFixed(1)}° → ${f1.toFixed(1)}°`);
await send('Emulation.setTouchEmulationEnabled', { enabled: false });
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
