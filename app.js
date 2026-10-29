import { Viewer } from '@photo-sphere-viewer/core';
import { EquirectangularTilesAdapter } from '@photo-sphere-viewer/equirectangular-tiles-adapter';

const LEVELS = [
  { width: 4096, cols: 8, rows: 4 },
  { width: 8192, cols: 16, rows: 8 },
  { width: 16384, cols: 32, rows: 16 },
];
const panorama = {
  baseUrl: 'tiles/base.jpg',
  levels: LEVELS,
  tileUrl: (col, row, level) => `tiles/L${level}_${col}_${row}.jpg`,
};

const MAIN_FOV = { min: 20, max: 100 };
const LENS_FOV = { min: 1, max: 100 }; // PSV recorta minFov a 1°; con 0.2 el mapeo zoom<->fov salía 2% desviado

const $ = (id) => document.getElementById(id);
const lensEl = $('lens');
const mainEl = $('main');

const st = {
  lensOn: true,
  mag: 4,
  size: 240,
  pointer: null,   // {x, y, touch}
  inside: false,
  dirty: false,
  frames: 0,
  tileReq: { 0: 0, 1: 0, 2: 0 },
  tileErr: 0,
};

const adapter = [EquirectangularTilesAdapter, { showErrorTile: false, baseBlur: false }];

const main = new Viewer({
  container: mainEl,
  adapter,
  panorama,
  navbar: false,
  minFov: MAIN_FOV.min,
  maxFov: MAIN_FOV.max,
  defaultZoomLvl: 40,
  mousewheelSpeed: 1,
  touchmoveTwoFingers: false,
  loadingTxt: 'Cargando…',
});

const lens = new Viewer({
  container: $('lens-view'),
  adapter,
  panorama,
  navbar: false,
  minFov: LENS_FOV.min,
  maxFov: LENS_FOV.max,
  mousemove: false,
  mousewheel: false,
  touchmoveTwoFingers: false,
  keyboard: false,
  loadingTxt: '',
  loadingImg: null,
  moveInertia: false,
  rendererParameters: { alpha: false },
});

// --- Sincronía lupa <-> visor principal -------------------------------------------------------
function fovToZoom(fov, range) {
  return Math.max(0, Math.min(100, ((range.max - fov) / (range.max - range.min)) * 100));
}

function updateLens() {
  st.dirty = false;
  const p = st.pointer;
  if (!st.lensOn || !p || !p.visible || !main.state.ready) {
    lensEl.style.display = 'none';
    return;
  }
  const rect = mainEl.getBoundingClientRect();
  const vx = p.x - rect.left;
  const vy = p.y - rect.top;

  let sph;
  try {
    sph = main.dataHelper.viewerCoordsToSphericalCoords({ x: vx, y: vy });
  } catch (e) { sph = null; }
  if (!sph) { lensEl.style.display = 'none'; return; }

  // Con touch la lupa se dibuja arriba del dedo para no taparla.
  let lx = vx, ly = vy;
  if (p.touch) {
    ly = vy - (st.size / 2 + 40);
    if (ly - st.size / 2 < 0) ly = vy + (st.size / 2 + 40); // sin espacio arriba: debajo del dedo
    lx = Math.max(st.size / 2, Math.min(mainEl.clientWidth - st.size / 2, vx));
  }
  lensEl.style.width = lensEl.style.height = st.size + 'px';
  lensEl.style.transform = `translate(${lx - st.size / 2}px, ${ly - st.size / 2}px)`;
  lensEl.style.display = 'block';
  lens.resize({ width: st.size, height: st.size });

  // Proyección rectilínea: px por radián en el centro = (W/2)/tan(fov/2). Igualamos (aumento * px/rad principal) con el de la lupa.
  const tanMain = Math.tan((main.state.hFov * Math.PI) / 360);
  const lensFov = Math.max(LENS_FOV.min, Math.min(LENS_FOV.max,
    (2 * Math.atan((st.size / mainEl.clientWidth) * tanMain / st.mag) * 180) / Math.PI));
  lens.zoom(fovToZoom(lensFov, LENS_FOV));
  lens.rotate({ yaw: sph.yaw, pitch: sph.pitch });
  st.lastLensFov = lensFov;
}
function schedule() { if (!st.dirty) { st.dirty = true; requestAnimationFrame(updateLens); } }

mainEl.addEventListener('pointermove', (e) => {
  st.pointer = { x: e.clientX, y: e.clientY, touch: e.pointerType === 'touch', visible: true };
  schedule();
});
mainEl.addEventListener('pointerdown', (e) => {
  st.pointer = { x: e.clientX, y: e.clientY, touch: e.pointerType === 'touch', visible: true };
  schedule();
});
mainEl.addEventListener('pointerleave', () => { if (st.pointer) st.pointer.visible = false; schedule(); });
mainEl.addEventListener('pointerup', (e) => { if (e.pointerType === 'touch' && st.pointer) { st.pointer.visible = false; schedule(); } });
mainEl.addEventListener('pointercancel', () => { if (st.pointer) st.pointer.visible = false; schedule(); });
// Cuando el usuario arrastra / hace zoom con el mouse quieto, la dirección bajo el cursor cambia.
main.addEventListener('position-updated', schedule);
main.addEventListener('zoom-updated', schedule);
main.addEventListener('size-updated', schedule);
main.addEventListener('ready', schedule);

// --- Navegación propia: zoom, flechas (mantener presionado) y pantalla completa ------------------
// (la barra de PSV colapsa botones solos y su fullscreen deja fuera la lupa y los paneles)
const zoomSlider = $('rng-zoom');
const syncZoom = () => { zoomSlider.value = main.getZoomLevel(); };
main.addEventListener('zoom-updated', syncZoom);
main.addEventListener('ready', syncZoom);
zoomSlider.oninput = (e) => main.zoom(+e.target.value);
$('z-in').onclick = () => main.zoom(Math.min(100, main.getZoomLevel() + 10));
$('z-out').onclick = () => main.zoom(Math.max(0, main.getZoomLevel() - 10));
for (const btn of document.querySelectorAll('#nav [data-dir]')) {
  const [dx, dy] = btn.dataset.dir.split(',').map(Number);
  let raf = 0;
  const step = () => {
    const p = main.getPosition();
    const k = (main.state.hFov / 100) * 0.012; // rad/frame, proporcional al FOV
    main.rotate({ yaw: p.yaw + dx * k, pitch: Math.max(-1.55, Math.min(1.55, p.pitch + dy * k)) });
    raf = requestAnimationFrame(step);
  };
  const stop = () => cancelAnimationFrame(raf);
  btn.addEventListener('pointerdown', (e) => { btn.setPointerCapture(e.pointerId); stop(); step(); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.addEventListener(ev, stop);
}
$('fs').onclick = () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.();
};

// --- Controles de la lupa (panel debajo de la barra de PSV) -------------------------------------
const MAG = { min: 2, max: 16 };
function setLens(on) { st.lensOn = on; $('chk-lens').checked = on; schedule(); }
function setMag(v) {
  st.mag = Math.max(MAG.min, Math.min(MAG.max, v));
  $('rng-mag').value = st.mag; $('v-mag').textContent = st.mag + 'x'; schedule();
}
function setSize(px) { st.size = px; $('rng-size').value = px; $('v-size').textContent = px + 'px'; schedule(); }
$('chk-lens').onchange = (e) => setLens(e.target.checked);
$('rng-mag').oninput = (e) => setMag(+e.target.value);
$('rng-size').oninput = (e) => setSize(+e.target.value);
window.addEventListener('keydown', (e) => {
  if (e.key === 'l' || e.key === 'L') setLens(!st.lensOn);
  if (e.key === '+' || e.key === '=') setMag(st.mag + 1);
  if (e.key === '-') setMag(st.mag - 1);
  if (e.key === 'd' || e.key === 'D') $('panel').classList.toggle('compact'); // ocultar/mostrar métricas
});

// --- Métricas ----------------------------------------------------------------------------------
new PerformanceObserver((list) => {
  for (const en of list.getEntries()) {
    const m = en.name.match(/tiles\/L(\d)_/);
    if (m) st.tileReq[m[1]]++;
  }
}).observe({ type: 'resource', buffered: true });
window.addEventListener('error', () => { st.tileErr++; }, true);

let last = performance.now(), fps = 0;
(function loop(t) {
  st.frames++;
  if (t - last >= 1000) { fps = Math.round((st.frames * 1000) / (t - last)); st.frames = 0; last = t; }
  requestAnimationFrame(loop);
})(last);
setInterval(() => {
  const mem = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) + ' MB' : 'n/d';
  $('stats').textContent =
    `FPS ${fps} | heap ${mem}\n` +
    `FOV ${main.state.hFov.toFixed(1)}° | lupa ${(st.lastLensFov ?? 0).toFixed(2)}°\n` +
    `tiles L0:${st.tileReq[0]} L1:${st.tileReq[1]} L2:${st.tileReq[2]}`;
}, 500);

// Para pruebas funcionales desde CDP
window.app = { main, lens, st, updateLens, setLens, setMag, setSize };
