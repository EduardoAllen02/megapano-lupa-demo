// Batería funcional contra la tab abierta con `node test/cdp.mjs open <url>`.  Uso: node test/run.mjs
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
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.exception?.description));
  return r.result.result.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const move = (x, y, extra = {}) => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, ...extra });
const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(dir, name), Buffer.from(r.result.data, 'base64')); };

const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${info}`); };
const lensState = () => ev(`(() => { const l = document.getElementById('lens'); const p = app.lens.getPosition();
  return { display: l.style.display, tf: l.style.transform, lensYaw: p.yaw, lensPitch: p.pitch, lensFov: app.st.lastLensFov, mainFov: app.main.state.hFov, mainPos: app.main.getPosition() }; })()`);
const W = await ev('document.getElementById("main").clientWidth');
const magOf = (s) => (Math.tan(s.mainFov * Math.PI / 360) / (W / 2)) / (Math.tan(s.lensFov * Math.PI / 360) / 120);
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d); };

// T1 carga
await ev('location.reload()'); await sleep(1500);
const t0 = Date.now();
while (!(await ev('window.app?.main.state.ready && app.lens.state.ready').catch(() => false)) && Date.now() - t0 < 20000) await sleep(200);
check('T1 visor y lupa listos', await ev('!!(window.app?.main.state.ready && app.lens.state.ready)'), `${Date.now() - t0 + 1500} ms (+reload)`);

// T2 lupa sigue el cursor
await move(400, 300); await sleep(300);
let s = await lensState();
check('T2a lupa visible al mover', s.display === 'block');
check('T2b lupa centrada en cursor', s.tf === 'translate(280px, 180px)', s.tf);
await move(900, 450); await sleep(300); s = await lensState();
check('T2c lupa se mueve', s.tf === 'translate(780px, 330px)', s.tf);

// T3 la dirección de la lupa coincide con lo que hay bajo el cursor
const under = await ev(`(() => { const r = app.main.dataHelper.viewerCoordsToSphericalCoords({x:900,y:450}); return r; })()`);
check('T3 centro de lupa = punto bajo cursor', angDiff(s.lensYaw, under.yaw) < 1e-3 && Math.abs(s.lensPitch - under.pitch) < 1e-3, `Δyaw=${angDiff(s.lensYaw, under.yaw).toExponential(1)}`);

// T4 aumento real = 4x (grados por pixel)
const mag = magOf(s);
check('T4 aumento efectivo ≈ 4x', Math.abs(mag - 4) < 0.1, `${mag.toFixed(2)}x`);

// T5 pan con mouse: lupa debe seguir actualizándose con el cursor quieto
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 700, y: 400, button: 'left', buttons: 1, clickCount: 1 });
const p0 = (await lensState()).lensYaw;
for (let i = 1; i <= 10; i++) { await move(700 - i * 20, 400, { button: 'left', buttons: 1 }); await sleep(30); }
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 500, y: 400, button: 'left', buttons: 0, clickCount: 1 });
await sleep(800); s = await lensState();
check('T5 pan: yaw de lupa cambia', angDiff(s.lensYaw, p0) > 0.05, `Δ=${angDiff(s.lensYaw, p0).toFixed(3)} rad`);
const under5 = await ev(`app.main.dataHelper.viewerCoordsToSphericalCoords({x:500,y:400})`);
check('T5b tras el pan lupa sigue apuntando al cursor', angDiff(s.lensYaw, under5.yaw) < 1e-3);

// T6 zoom con rueda: aumento efectivo se mantiene
for (let i = 0; i < 6; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 700, y: 400, deltaX: 0, deltaY: -100 }); await sleep(60); }
await sleep(1200); s = await lensState();
const mag6 = magOf(s);
check('T6 zoom rueda: aumento sigue 4x', Math.abs(mag6 - 4) < 0.15, `mainFov=${s.mainFov.toFixed(1)}° lensFov=${s.lensFov.toFixed(2)}° mag=${mag6.toFixed(2)}x`);

// T7 al máximo zoom + 16x: ¿el FOV de lupa llega al piso (0.2°)?
await ev('app.setMag(16)'); await sleep(500); s = await lensState();
const texelDeg = 360 / 16384;
const degPerLensPx = s.lensFov / 240;
check('T7 piso de FOV de lupa no alcanzado', s.lensFov > 0.2, `lensFov=${s.lensFov.toFixed(3)}° → ${(texelDeg / degPerLensPx).toFixed(2)} px de pantalla por texel de la pano`);
await shot('s_max_zoom.png');

// T8 tiles: la lupa debe pedir L2 (máx. resolución)
await sleep(2500);
const tiles = await ev('JSON.stringify(app.st.tileReq)');
check('T8 se piden tiles de nivel L2', JSON.parse(tiles)[2] > 0, tiles);

// T9 costura ±180° y polos
await ev(`app.main.rotate({yaw: Math.PI - 0.002, pitch: 0})`); await sleep(1500);
await move(W / 2, 400); await sleep(1500); s = await lensState();
await shot('s_seam.png');
check('T9 costura ±180°: lupa en yaw correcto', angDiff(s.lensYaw, s.mainPos.yaw) < 0.02, `lens=${s.lensYaw.toFixed(3)} main=${s.mainPos.yaw.toFixed(3)}`);
await ev(`app.main.rotate({yaw: 0, pitch: 1.5})`); await sleep(1500);
await move(700, 300); await sleep(1500); s = await lensState();
await shot('s_pole.png');
check('T10 cerca del zenit: pitch de lupa válido', Number.isFinite(s.lensPitch) && Math.abs(s.lensPitch) < Math.PI / 2 + 1e-6, `pitch=${s.lensPitch.toFixed(3)}`);

// T11 rendimiento: 120 mousemoves seguidos
await ev(`app.main.rotate({yaw: 0, pitch: 0.1}); app.main.zoom(40); null`); await sleep(1000);
await ev(`(() => { window.__ft = []; let l = performance.now(); (function f(t){ window.__ft.push(t - l); l = t; if (window.__ft.length < 400) requestAnimationFrame(f); })(l); })()`);
for (let i = 0; i < 120; i++) { await move(300 + i * 5, 300 + Math.sin(i / 8) * 100); await sleep(8); }
await sleep(800);
const ft = await ev(`(() => { const a = window.__ft.slice(5).sort((x,y)=>x-y); return { p50: a[Math.floor(a.length*.5)], p95: a[Math.floor(a.length*.95)], max: a[a.length-1], n: a.length }; })()`);
check('T11 rendimiento moviendo la lupa (p95 < 40ms)', ft.p95 < 40, `p50=${ft.p50.toFixed(1)}ms p95=${ft.p95.toFixed(1)}ms max=${ft.max.toFixed(0)}ms n=${ft.n}`);

// T12 apagar lupa
await ev('app.setLens(false)'); await move(500, 300); await sleep(300); s = await lensState();
check('T12 lupa apagada se oculta', s.display === 'none');
await ev('app.setLens(true)');

// T13 mouse sale del visor
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5000, y: 5000 }); await sleep(300);
// (CDP no dispara pointerleave fuera de viewport; simulamos)
await ev(`document.getElementById('main').dispatchEvent(new PointerEvent('pointerleave'))`); await sleep(300); s = await lensState();
check('T13 lupa se oculta al salir', s.display === 'none');

// T14 memoria / contextos
const mem = await ev(`(async () => ({ heapMB: Math.round(performance.memory.usedJSHeapSize/1048576), canv: document.querySelectorAll('canvas').length, tiles: performance.getEntriesByType('resource').filter(e=>/tiles\\/L/.test(e.name)).length, tilesMB: Math.round(performance.getEntriesByType('resource').filter(e=>/tiles\\//.test(e.name)).reduce((a,e)=>a+e.transferSize,0)/1e5)/10 }))()`);
console.log('INFO  T14', JSON.stringify(mem));

console.log(`\n${results.filter((r) => r.ok).length}/${results.length} pruebas OK`);
ws.close();
