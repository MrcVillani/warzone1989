// Disegno: terreno, edifici, mezzi, effetti, nebbia, minimappa. Legge lo stato del motore senza modificarlo.
import {
  TILE, MW, MH, N, P, GROUND, DIRT, WATER, ROCK, FOREST, CHASSIS, STRUCTS,
  S, terr, deposits, occ, vis, explored, proj, ent, canSee, canPlace, mulberry32, clamp, ftile, towerWeapon,
} from '../engine/index.js';
import { ui, cam, view, hover, fxs, PAL, reducedMotion } from './state.js';
import { fxq } from './quality.js';

let cv, ctx, mini, mctx, terrC = null, terrG = null, mmBase = null;
const fogC = document.createElement('canvas'); fogC.width = MW; fogC.height = MH;
const fogG = fogC.getContext('2d'); const fogImg = fogG.createImageData(MW, MH);

export function initRender(canvas, miniCanvas) { cv = canvas; ctx = cv.getContext('2d'); mini = miniCanvas; mctx = mini.getContext('2d'); }

/* ---------- camera ---------- */
// La tela della mappa usa al massimo la risoluzione del livello di qualità (in bassa meno pixel da riempire).
export function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  view.dpr = Math.min(dpr, fxq.q.res);
  const r = cv.getBoundingClientRect(); view.cw = Math.max(1, r.width); view.ch = Math.max(1, r.height);
  const w = Math.round(view.cw * view.dpr), h = Math.round(view.ch * view.dpr);
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const m = mini.getBoundingClientRect(); mini.width = Math.round(Math.max(1, m.width) * dpr); mini.height = Math.round(Math.max(1, m.height) * dpr);
  clampCam();
}
export function clampCam() {
  const vw = view.cw / cam.z, vh = view.ch / cam.z, m = 64;
  cam.x = vw > MW * TILE + 2 * m ? (MW * TILE - vw) / 2 : clamp(cam.x, -m, MW * TILE - vw + m);
  cam.y = vh > MH * TILE + 2 * m ? (MH * TILE - vh) / 2 : clamp(cam.y, -m, MH * TILE - vh + m);
}
export function centerOn(x, y) { cam.x = x - view.cw / cam.z / 2; cam.y = y - view.ch / cam.z / 2; clampCam(); }
export function screenToWorld(x, y) { return { x: cam.x + x / cam.z, y: cam.y + y / cam.z }; }

/* ---------- terreno ---------- */
export function renderTerrain(seed) {
  const c = document.createElement('canvas'); c.width = MW * TILE; c.height = MH * TILE;
  const g = c.getContext('2d'); const r = mulberry32(seed * 7 + 3);
  const base = v => v === WATER ? [196, 27, 26] : v === DIRT ? [36, 23, 36] : v === ROCK ? [38, 7, 39] : [80, 19, 32];
  const col = (v, j) => { const [h, s, l] = base(v); return `hsl(${h},${s}%,${(l + j).toFixed(1)}%)`; };
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) { g.fillStyle = col(terr[x + y * MW], (r() - 0.5) * 3); g.fillRect(x * TILE, y * TILE, TILE, TILE); }
  g.globalAlpha = 0.33;
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const v = terr[x + y * MW];
    for (let k = 0; k < 3; k++) { g.fillStyle = col(v, (r() - 0.5) * 4); g.beginPath(); g.arc(x * TILE + r() * TILE, y * TILE + r() * TILE, 9 + r() * 12, 0, 7); g.fill(); }
  }
  g.globalAlpha = 1;
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const v = terr[x + y * MW], px = x * TILE, py = y * TILE;
    if (v === GROUND || v === DIRT || v === FOREST) {
      for (let k = 0; k < 7; k++) { g.fillStyle = r() < 0.5 ? 'rgba(20,24,12,0.22)' : 'rgba(220,215,170,0.08)'; g.fillRect(px + r() * TILE, py + r() * TILE, 1 + r() * 2, 1 + r() * 1.5); }
    } else if (v === WATER) {
      g.strokeStyle = 'rgba(170,205,210,0.13)'; g.lineWidth = 1;
      for (let k = 0; k < 2; k++) { const lx = px + r() * TILE, ly = py + r() * TILE; g.beginPath(); g.moveTo(lx, ly); g.quadraticCurveTo(lx + 5, ly - 2, lx + 10, ly); g.stroke(); }
    }
  }
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    if (terr[x + y * MW] !== WATER) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
      if (terr[nx + ny * MW] === WATER) continue;
      g.fillStyle = 'rgba(205,195,150,0.16)';
      g.fillRect(x * TILE + (dx > 0 ? TILE - 3 : 0), y * TILE + (dy > 0 ? TILE - 3 : 0), dx ? 3 : TILE, dy ? 3 : TILE);
    }
  }
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    if (terr[x + y * MW] !== ROCK) continue;
    for (let k = 0; k < 2; k++) {
      const cx = x * TILE + 8 + r() * 16, cy = y * TILE + 8 + r() * 16, rr0 = 7 + r() * 8, n = 6 + Math.floor(r() * 3), pts = [];
      for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, d = rr0 * (0.7 + r() * 0.35); pts.push([Math.cos(a) * d, Math.sin(a) * d]); }
      const poly = (ox, oy) => { g.beginPath(); pts.forEach(([a, b], i) => i ? g.lineTo(cx + a + ox, cy + b + oy) : g.moveTo(cx + a + ox, cy + b + oy)); g.closePath(); };
      g.fillStyle = 'rgba(0,0,0,0.32)'; poly(3, 4); g.fill();
      g.fillStyle = `hsl(38,6%,${44 + r() * 8}%)`; poly(0, 0); g.fill();
      g.fillStyle = 'rgba(255,250,230,0.12)'; g.beginPath(); g.arc(cx - rr0 * 0.25, cy - rr0 * 0.3, rr0 * 0.45, 0, 7); g.fill();
    }
  }
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    if (terr[x + y * MW] !== FOREST) continue;
    const n = 3 + Math.floor(r() * 2);
    for (let k = 0; k < n; k++) {
      const cx = x * TILE + 5 + r() * 22, cy = y * TILE + 5 + r() * 22, rr0 = 6 + r() * 5;
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.arc(cx + 3, cy + 4, rr0, 0, 7); g.fill();
      g.fillStyle = `hsl(${92 + r() * 14},${26 + r() * 8}%,${19 + r() * 6}%)`; g.beginPath(); g.arc(cx, cy, rr0, 0, 7); g.fill();
      g.fillStyle = 'rgba(190,210,140,0.14)'; g.beginPath(); g.arc(cx - rr0 * 0.3, cy - rr0 * 0.3, rr0 * 0.5, 0, 7); g.fill();
    }
  }
  // reticolo della carta: quadrati da 8 caselle con il riferimento di settore
  g.strokeStyle = 'rgba(235,228,200,0.09)'; g.lineWidth = 1;
  for (let i = 8; i < MW; i += 8) { g.beginPath(); g.moveTo(i * TILE + 0.5, 0); g.lineTo(i * TILE + 0.5, MH * TILE); g.stroke(); }
  for (let i = 8; i < MH; i += 8) { g.beginPath(); g.moveTo(0, i * TILE + 0.5); g.lineTo(MW * TILE, i * TILE + 0.5); g.stroke(); }
  g.fillStyle = 'rgba(235,228,200,0.28)'; g.font = '500 11px "IBM Plex Mono", monospace';
  for (let gy = 0; gy < 8; gy++) for (let gx = 0; gx < 8; gx++) g.fillText('ABCDEFGH'[gx] + (gy + 1), gx * 8 * TILE + 5, gy * 8 * TILE + 14);
  terrC = c; terrG = g; initTracks();
  mmBase = document.createElement('canvas'); mmBase.width = MW; mmBase.height = MH;
  const mg = mmBase.getContext('2d'), img = mg.createImageData(MW, MH);
  const mc = { [GROUND]: [86, 98, 62], [DIRT]: [117, 101, 72], [WATER]: [48, 78, 88], [ROCK]: [112, 108, 98], [FOREST]: [52, 68, 38] };
  for (let i = 0; i < N; i++) { const c3 = mc[terr[i]]; img.data[i * 4] = c3[0]; img.data[i * 4 + 1] = c3[1]; img.data[i * 4 + 2] = c3[2]; img.data[i * 4 + 3] = 255; }
  for (const d of deposits) { const i = d.x + d.y * MW; img.data[i * 4] = 20; img.data[i * 4 + 1] = 18; img.data[i * 4 + 2] = 14; }
  mg.putImageData(img, 0, 0);
}
function scorch(x, y, r, a = 0.55) {
  if (!terrG) return;
  // in bassa qualità un disco pieno e tenue al posto della sfumatura radiale
  if (!fxq.q.glow) { terrG.fillStyle = `rgba(14,11,8,${(a * 0.45).toFixed(3)})`; terrG.beginPath(); terrG.arc(x, y, r * 0.7, 0, 7); terrG.fill(); return; }
  const gr = terrG.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, `rgba(14,11,8,${a})`); gr.addColorStop(1, 'rgba(14,11,8,0)');
  terrG.fillStyle = gr; terrG.beginPath(); terrG.arc(x, y, r, 0, 7); terrG.fill();
}
export function updateFogImage() {
  const d = fogImg.data;
  for (let i = 0; i < N; i++) { d[i * 4] = 12; d[i * 4 + 1] = 14; d[i * 4 + 2] = 13; d[i * 4 + 3] = vis[i] ? 0 : explored[i] ? 125 : 255; }
  fogG.putImageData(fogImg, 0, 0);
}

/* ---------- effetti visivi (dagli eventi del motore) ---------- */
// Aloni di luce già disegnati una volta: lampi, vampe e fuochi si disegnano con drawImage in modalità additiva.
// Quello caldo per fuoco ed esplosioni, quello verde-azzurro per la saldatura del modulo riparazione.
function makeGlow(stops) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return c;
}
const glowC = makeGlow([[0, 'rgba(255,240,200,1)'], [0.22, 'rgba(255,190,100,0.8)'], [0.55, 'rgba(235,120,45,0.28)'], [1, 'rgba(200,80,30,0)']]);
const glowR = makeGlow([[0, 'rgba(225,255,240,1)'], [0.25, 'rgba(120,235,195,0.75)'], [0.6, 'rgba(60,170,170,0.22)'], [1, 'rgba(40,120,140,0)']]);
const glow = (g, x, y, r, a, c = glowC) => { if (a <= 0.01) return; g.globalAlpha = Math.min(1, a); g.drawImage(c, x - r, y - r, r * 2, r * 2); };
const MAXP_RM = 320, MAX_WRECKS = 40;
// Densità degli effetti: «Riduci movimento» la dimezza, il livello di qualità la riduce ancora.
const dens = () => (reducedMotion() ? 0.5 : 1) * fxq.q.dens;
const maybe = k => k >= 1 || Math.random() < k;
const clock = () => performance.now() / 1000;
// Nuova particella, se c'è posto (il limite tiene basso il costo per fotogramma).
function addP(k, x, y, vx, vy, life, s, vz) {
  const parts = fxs.parts, max = fxq.q.maxP; if (parts.length >= (reducedMotion() ? Math.min(MAXP_RM, max) : max)) return;
  parts.push({ k, x, y, vx, vy, life, max: life, s, z: 0, vz: vz || 0 });
}
function nearView(x, y, m) { const vw = view.cw / cam.z, vh = view.ch / cam.z; return x > cam.x - m && x < cam.x + vw + m && y > cam.y - m && y < cam.y + vh + m; }
// Il giocatore vede questo punto? Gli effetti del nemico nella nebbia non si mostrano.
function seenAt(x, y) { const tx = ftile(x), ty = ftile(y); return tx >= 0 && ty >= 0 && tx < MW && ty < MH && vis && vis[tx + ty * MW] === 1; }
const boomKind = e => e.kind || (e.size >= 2 ? 'struct' : Math.abs(e.size - 0.9) < 0.01 ? 'unit' : 'shot');

function boom(x, y, size, kind) {
  const rm = reducedMotion(), q = dens(), full = fxq.q.glow, { fx } = fxs;
  if (kind === 'unit') {
    if (fxs.wrecks.length >= MAX_WRECKS) fxs.wrecks.shift();
    fxs.wrecks.push({ x, y, a: Math.random() * 7, t: 0, life: rm ? 4 : 7, ph: Math.random() * 6 });
  }
  if (!rm && (kind === 'struct' || size >= 1.4)) {
    const hw = view.cw / cam.z / 2, hh = view.ch / cam.z / 2;
    const f = Math.max(0, 1 - Math.hypot(x - cam.x - hw, y - cam.y - hh) / (Math.max(hw, hh) * 1.6));
    fxs.shake = Math.min(7, fxs.shake + 1.8 * size * f);
  }
  if (!nearView(x, y, 160)) return;
  const L = 0.16 + 0.08 * size;
  fx.push({ k: 'light', x, y, life: L, max: L, s: 26 * size });
  if (full || kind !== 'shot') fx.push({ k: 'shock', x, y, life: 0.3, max: 0.3, s: 20 * size });
  fx.push({ k: 'ring', x, y, life: 0.4, max: 0.4, s: 12 * size });
  const n = Math.round(7 * size * q), long = kind === 'struct' ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 7, v = 20 + Math.random() * 70 * size;
    addP('fire', x, y, Math.cos(a) * v, Math.sin(a) * v, 0.3 + Math.random() * 0.35, 2 + Math.random() * 3 * size);
    addP('smoke', x + (Math.random() - 0.5) * 10 * size, y + (Math.random() - 0.5) * 10 * size, (Math.random() - 0.5) * 14, -6 - Math.random() * 10, (1.2 + Math.random() * 1.3) * long, 4 + Math.random() * 4 * size);
  }
  const nd = Math.round((kind === 'shot' ? 3 : 6) * size * q);
  for (let i = 0; i < nd; i++) { const a = Math.random() * 7, v = 35 + Math.random() * 90; addP('debris', x, y, Math.cos(a) * v, Math.sin(a) * v, 0.9 + Math.random() * 0.5, 1.5 + Math.random() * 1.5, 60 + Math.random() * 90 * size); }
  if (kind === 'shot' && size >= 1.5) {
    // granata dell'obice: cratere annerito, anello di polvere e colonna di fumo che sale
    scorch(x, y, 15 * size, 0.6);
    if (full) fx.push({ k: 'shock', x, y, life: 0.45, max: 0.45, s: 30 * size });
    for (let i = 0; i < 8 * q; i++) { const a = i / (8 * q) * Math.PI * 2; addP('dust', x + Math.cos(a) * 6, y + Math.sin(a) * 5, Math.cos(a) * 70, Math.sin(a) * 55, 0.9 + Math.random() * 0.4, 4 + Math.random() * 2); }
    for (let i = 0; i < 3 * q; i++) addP('smoke', x + (Math.random() - 0.5) * 8, y + (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 6, -16 - Math.random() * 14, 2 + Math.random(), 6 + Math.random() * 3);
  }
}
// Vampa di sparo, diversa per arma: [stile, scala, durata]. Le armi nuove riusano gli stili con una scala più grande.
const MZ = {
  MG: ['mg', 1, 0.06], HMG: ['hmg', 1, 0.07], CN: ['cn', 1, 0.1], CN75: ['cn', 1.25, 0.11], CN105: ['cn', 1.5, 0.12],
  HW: ['cn', 1.75, 0.14], RK: ['rk', 1, 0.09], AT: ['rk', 1.1, 0.1], MRL: ['rk', 1.35, 0.11], MO: ['mo', 1, 0.09], FL: ['fl', 1, 0.08],
};
// La direzione si ricava dal tiratore più vicino alla bocca dell'arma.
function muzzle(e) {
  if (!nearView(e.x, e.y, 60)) return;
  const w = e.w || (e.s <= 3 ? 'MG' : 'CN'), [st, sc, life] = MZ[w] || MZ.CN;
  let a = Math.random() * 7, bd = 900;
  for (const s of S.ents) {
    if (s.dead || (e.owner != null && s.owner !== e.owner) || (s.kind === 'struct' && s.type !== 'tower' && s.type !== 'bunker')) continue;
    const dx = e.x - s.x, dy = e.y - s.y; if (dx > 34 || dx < -34 || dy > 34 || dy < -34) continue;
    const d = dx * dx + dy * dy; if (d < bd && d > 4) { bd = d; a = Math.atan2(dy, dx); }
  }
  fxs.fx.push({ k: 'muzzle', st, sc, x: e.x, y: e.y, a, life, max: life });
  const c = Math.cos(a), s = Math.sin(a), q = fxq.q.dens;
  if (st === 'cn') {
    const v = 24 * sc;
    if (maybe(q)) for (const side of [-1, 1]) addP('smoke', e.x, e.y, -s * side * v + c * 8, c * side * v + s * 8, 0.6 * sc, 2.4 * sc);
    if (maybe(q)) addP('smoke', e.x + c * 4, e.y + s * 4, c * 28 * sc, s * 28 * sc, 0.5 * sc, 2.6 * sc);
    if (w === 'HW') for (let i = 0, n = 6 * dens(); i < n; i++) { const b = Math.random() * 7, u = 20 + Math.random() * 20; addP('dust', e.x - c * 14, e.y - s * 14, Math.cos(b) * u, Math.sin(b) * u, 1.1, 4); }
  } else if (st === 'rk') {
    const n = Math.round(3 * sc * sc * Math.min(1, q + 0.15));
    for (let i = 0; i < n; i++) { const v = 30 + Math.random() * 30 * sc; addP('smoke', e.x - c * 10, e.y - s * 10, -c * v + (Math.random() - 0.5) * 24 * sc, -s * v + (Math.random() - 0.5) * 24 * sc, 0.75 * sc, 3 * sc); }
  } else if (st === 'mo') {
    for (let i = 0; i < 2; i++) if (maybe(q)) addP('smoke', e.x, e.y, (Math.random() - 0.5) * 12, -20 - Math.random() * 12, 0.9, 3);
  }
}
export function spawnFx(e) {
  const { fx } = fxs;
  switch (e.k) {
    case 'boom': { const kind = boomKind(e); if (kind === 'shot' ? seenAt(e.x, e.y) : (e.owner === P || seenAt(e.x, e.y))) boom(e.x, e.y, e.size, kind); break; }
    case 'scorch': scorch(e.x, e.y, e.r); break;
    case 'flash': if (e.owner === P || seenAt(e.x, e.y)) muzzle(e); break;
    case 'tracer': if (nearView(e.x1, e.y1, 80)) fx.push({ k: 'tracer', x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, life: 0.07, max: 0.07 }); break;
    case 'hit':
      if (!nearView(e.x, e.y, 40)) break;
      fx.push({ k: 'ring', x: e.x, y: e.y, life: 0.2, max: 0.2, s: 8 });
      if (fxq.q.glow) fx.push({ k: 'light', x: e.x, y: e.y, life: 0.08, max: 0.08, s: 12 });
      for (let i = 0, n = Math.round(4 * fxq.q.dens); i < n; i++) addP('fire', e.x, e.y, (Math.random() - 0.5) * 80, (Math.random() - 0.5) * 80, 0.25, 2);
      break;
    // con molte particelle già in volo (salve di razzi) la scia di fumo si dirada
    case 'trail': if (Math.random() < (fxs.parts.length > fxq.q.maxP / 2 ? 0.35 : 0.8) * fxq.q.dens && nearView(e.x, e.y, 30)) addP('smoke', e.x, e.y, 0, -4, 0.6, 2.2); break;
    case 'spark': if (maybe(fxq.q.dens) && nearView(e.x, e.y, 30)) addP('spark', e.x, e.y, (Math.random() - 0.5) * 60, -Math.random() * 50, 0.35, 1.5); break;
    case 'spray': if (maybe(fxq.q.dens) && nearView(e.x, e.y, 30)) addP('spray', e.x, e.y, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, 0.6, 3); break;
    case 'chimney': if (maybe(fxq.q.dens) && nearView(e.x, e.y, 60)) addP('smoke', e.x, e.y, 6 + Math.random() * 6, -4 - Math.random() * 6, 2.4, 4); break;
    case 'flame': {
      // getto del lanciafiamme: lingua di fuoco animata, fiamme che volano verso il bersaglio, fumo e terreno annerito
      if (!(e.owner === P || seenAt(e.x2, e.y2)) || !nearView(e.x2, e.y2, 80)) break;
      const r = e.r || 24, dx = e.x2 - e.x1, dy = e.y2 - e.y1, d = Math.hypot(dx, dy) || 1, q = dens();
      fx.push({ k: 'flame', x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, r, life: 0.36, max: 0.36, ph: Math.random() * 7 });
      for (let i = 0; i < 5 * q; i++) { const k = 0.25 + Math.random() * 0.75, v = 40 + Math.random() * 50; addP('fire', e.x1 + dx * k, e.y1 + dy * k, dx / d * v + (Math.random() - 0.5) * 30, dy / d * v + (Math.random() - 0.5) * 30, 0.22 + Math.random() * 0.2, 2 + Math.random() * 2.5); }
      for (let i = 0; i < 4 * q; i++) { const a = Math.random() * 7, rr0 = Math.random() * r * 0.75; addP('fire', e.x2 + Math.cos(a) * rr0, e.y2 + Math.sin(a) * rr0, (Math.random() - 0.5) * 12, -10 - Math.random() * 16, 0.35 + Math.random() * 0.25, 2 + Math.random() * 2.2); }
      if (Math.random() < 0.9 * q) addP('smoke', e.x2 + (Math.random() - 0.5) * r * 0.6, e.y2 + (Math.random() - 0.5) * r * 0.6, 3 + Math.random() * 5, -10 - Math.random() * 10, 1.6, 3.8);
      if (maybe(fxq.q.dens)) scorch(e.x2 + (Math.random() - 0.5) * r * 0.5, e.y2 + (Math.random() - 0.5) * r * 0.5, r * 0.55, 0.13);
      break;
    }
    case 'repair':
      // modulo riparazione: arco verde-azzurro tra i due mezzi e scintille di saldatura sul mezzo riparato
      if (!(e.owner === P || seenAt(e.x2, e.y2)) || !nearView(e.x2, e.y2, 60)) break;
      fx.push({ k: 'repair', x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, life: 0.3, max: 0.3 });
      for (let i = 0, n = Math.max(1, Math.round(4 * dens())); i < n; i++) addP('rspark', e.x2 + (Math.random() - 0.5) * 8, e.y2 + (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 56, -Math.random() * 44, 0.32 + Math.random() * 0.15, 1.4);
      break;
  }
}
// Polvere a terra (mezzo che esce, edificio che si posa).
function dust(x, y, r, n) {
  n = Math.max(1, Math.round(n * fxq.q.dens));
  for (let i = 0; i < n; i++) { const a = Math.random() * 7; addP('dust', x + Math.cos(a) * r, y + Math.sin(a) * r * 0.7, Math.cos(a) * 22, Math.sin(a) * 16, 0.8 + Math.random() * 0.5, 3 + Math.random() * 2); }
}
// Mezzo appena consegnato: esce dalla porta della fabbrica con una breve dissolvenza.
export function unitSpawned(d) {
  if (d.id == null) return;
  fxs.spawns.set(d.id, clock());
  if (d.x != null && (d.owner === P || seenAt(d.x, d.y)) && nearView(d.x, d.y, 40)) dust(d.x, d.y - 10, 4, reducedMotion() ? 2 : 5);
}
// Cantiere appena piazzato: «si posa» sul terreno.
export function structPlaced(d) { if (d.id != null && !fxs.settle.has(d.id)) fxs.settle.set(d.id, { t0: clock(), dust: false }); }
export function structBuilt(d) {
  const s = ent(d.id); if (!s || (s.owner !== P && !canSee(P, s)) || !nearView(s.x, s.y, 60)) return;
  dust(s.x, s.y, s.w * TILE * 0.45, reducedMotion() ? 3 : 8);
}
// Segno dell'ordine: frecce che convergono sul punto.
export function mark(x, y, c) { fxs.fx.push({ k: 'mark', x, y, life: 0.65, max: 0.65, c }); }
// Nuova mappa o partita caricata (evento «world» del motore): via tutto lo stato visivo della partita precedente.
// I tempi di S ripartono da capo, quindi un segnale o un'animazione rimasti avrebbero un'età senza senso.
export function resetFx() {
  fxs.parts.length = 0; fxs.fx.length = 0; fxs.pings.length = 0; fxs.wrecks.length = 0;
  fxs.settle.clear(); fxs.spawns.clear(); fxs.shake = 0; fxs.boxSel = null;
  trackLast.clear(); trackFade = 0; trackPrune = 0;
  if (trackG) { trackG.setTransform(1, 0, 0, 1, 0, 0); trackG.clearRect(0, 0, trackC.width, trackC.height); }
  trackDirty = false;
  barBg.length = 0; barCol.clear(); burnList.length = 0;
}

/* ---------- tracce di cingoli e ruote ---------- */
// Livello a parte, a metà risoluzione, che sbiadisce piano: la tela del terreno resta intatta.
const TK = 0.5;
let trackC = null, trackG = null, trackFade = 0, trackPrune = 0, trackDirty = false;
const trackLast = new Map();
function initTracks() {
  trackC = document.createElement('canvas'); trackC.width = MW * TILE * TK; trackC.height = MH * TILE * TK;
  trackG = trackC.getContext('2d'); trackLast.clear();
}
function wake(u) {
  const c = Math.cos(u.ang), s = Math.sin(u.ang), bx = u.x - c * 10, by = u.y - s * 10;
  for (const side of [-1, 1]) addP('wake', bx, by, -s * side * 16 - c * 6, c * side * 16 - s * 6, 1.1, 2);
}
// In media qualità le impronte sono più rade (e più lunghe, per non lasciare buchi); in bassa non ci sono.
function stampTracks(dt) {
  const step = fxq.q.tracks;
  if (!trackG) return;
  if (!step) { if (trackDirty) { trackDirty = false; trackG.setTransform(1, 0, 0, 1, 0, 0); trackG.clearRect(0, 0, trackC.width, trackC.height); } return; }
  if ((trackFade += dt) > 1) {
    trackFade = 0; trackG.setTransform(1, 0, 0, 1, 0, 0);
    trackG.globalCompositeOperation = 'destination-out'; trackG.fillStyle = 'rgba(0,0,0,0.1)';
    trackG.fillRect(0, 0, trackC.width, trackC.height); trackG.globalCompositeOperation = 'source-over';
  }
  if ((trackPrune += dt) > 5) { trackPrune = 0; for (const id of trackLast.keys()) if (!ent(id)) trackLast.delete(id); }
  for (const u of S.ents) {
    if (u.kind !== 'unit' || u.dead) continue;
    let l = trackLast.get(u.id);
    if (!l) { trackLast.set(u.id, [u.x, u.y]); continue; }
    const dx = u.x - l[0], dy = u.y - l[1], d2 = dx * dx + dy * dy;
    if (d2 < step * step) continue;
    l[0] = u.x; l[1] = u.y;
    if (d2 > 1600 || !canSee(P, u)) continue;
    const p = u.builder ? 'W' : u.d.p, water = terr[ftile(u.x) + ftile(u.y) * MW] === WATER;
    if (p === 'V') { if (water && nearView(u.x, u.y, 40)) wake(u); continue; }
    if (water) continue;
    const c = Math.cos(u.ang) * TK, s = Math.sin(u.ang) * TK, W = u.builder ? 12 : CHASSIS[u.d.c].size[1];
    const len = step > 5 ? Math.min(Math.sqrt(d2), 2 * step) + 1 : 6, bx = 3 - len;
    trackG.setTransform(c, s, -s, c, u.x * TK, u.y * TK); trackDirty = true;
    if (p === 'TR') {
      trackG.fillStyle = 'rgba(26,22,14,0.38)';
      trackG.fillRect(bx, -W / 2 - 4.5, len, 6); trackG.fillRect(bx, W / 2 - 1.5, len, 6);
    } else if (p === 'T' || p === 'HT') {
      trackG.fillStyle = p === 'T' ? 'rgba(26,22,14,0.34)' : 'rgba(26,22,14,0.28)';
      trackG.fillRect(bx, -W / 2 - 3, len, 4); trackG.fillRect(bx, W / 2 - 1, len, 4);
    } else {
      trackG.fillStyle = 'rgba(26,22,14,0.22)';
      trackG.fillRect(bx, -W / 2 - 2, len, 2.2); trackG.fillRect(bx, W / 2 - 0.2, len, 2.2);
    }
  }
}

export function updParts(dt) {
  const parts = fxs.parts, damp = Math.exp(-dt * 5);
  let j = 0;
  for (const p of parts) {
    p.life -= dt; if (p.life <= 0) continue;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.k === 'debris') {
      p.z += p.vz * dt; p.vz -= 340 * dt;
      if (p.z < 0) { p.z = 0; p.vz = -p.vz * 0.3; p.vx *= 0.5; p.vy *= 0.5; }
    } else if (p.k === 'fire' || p.k === 'spark' || p.k === 'rspark' || p.k === 'wake' || p.k === 'dust') { p.vx *= damp; p.vy *= damp; }
    parts[j++] = p;
  }
  parts.length = j;
  j = 0; for (const f of fxs.fx) { f.life -= dt; if (f.life > 0) fxs.fx[j++] = f; } fxs.fx.length = j;
  fxs.shake = fxs.shake > 0.05 ? fxs.shake * Math.exp(-dt * 9) : 0;
  if (!S) return;
  const q = (reducedMotion() ? 0.5 : 1) * fxq.q.dmg;
  // relitti: bruciano, poi fumano e spariscono
  j = 0;
  for (const w of fxs.wrecks) {
    w.t += dt; if (w.t >= w.life) continue;
    fxs.wrecks[j++] = w;
    if (!nearView(w.x, w.y, 40)) continue;
    const burning = w.t < w.life - 2.5;
    if (burning && Math.random() < dt * 9 * q) addP('fire', w.x + (Math.random() - 0.5) * 8, w.y + (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 8, -12 - Math.random() * 12, 0.45, 2.2);
    if (Math.random() < dt * (burning ? 5 : 2) * q) addP('smoke', w.x, w.y, 4 + Math.random() * 5, -8 - Math.random() * 8, 1.8, 3);
  }
  fxs.wrecks.length = j;
  // mezzi ed edifici danneggiati: fumo sotto metà dei punti struttura, fuoco sotto un quarto
  for (const e of S.ents) {
    if (e.dead || e.hp >= e.max * 0.5 || (e.kind === 'struct' && e.built < 1)) continue;
    if (!nearView(e.x, e.y, 40) || (e.owner !== P && !canSee(P, e))) continue;
    const big = e.kind === 'struct';
    const ox = big ? (Math.random() - 0.5) * e.w * TILE * 0.6 : (Math.random() - 0.5) * 4, oy = big ? (Math.random() - 0.5) * e.h * TILE * 0.6 : (Math.random() - 0.5) * 4;
    if (Math.random() < dt * (big ? 6 : 3.5) * q) addP('smoke', e.x + ox, e.y + oy, 4 + Math.random() * 4, -8 - Math.random() * 8, 1.6, big ? 4 : 2.6);
    if (e.hp < e.max * 0.25 && Math.random() < dt * (big ? 10 : 7) * q) addP('fire', e.x + ox, e.y + oy, (Math.random() - 0.5) * 8, -10 - Math.random() * 12, 0.45, big ? 3 : 2);
  }
  stampTracks(dt);
  const now = clock();
  for (const [id, t0] of fxs.spawns) if (now - t0 > 1.5) fxs.spawns.delete(id);
  for (const [id, v] of fxs.settle) if (now - v.t0 > 1.5) fxs.settle.delete(id);
}

/* ---------- sagome ---------- */
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
const DK = '#2a2925', STEEL = '#4b4a40', BORE = '#121210';
// Distanza della bocca dell'arma dal perno della torretta (unità del disegno, scala 1): serve all'anteprima.
export const WEAPON_REACH = { MG: 11, HMG: 15.6, CN: 16.5, FL: 13.6, RP: 14.5, CN75: 22.5, RK: 7, AT: 12.6, MO: 11, CN105: 29.5, HW: 27.5, MRL: 10.5 };
// Scala della torretta secondo il telaio.
const TURRET_SC = { L: 1, M: 1.1, H: 1.25, X: 1.4 };
// Torretta o lanciatore dell'arma wk, visti dall'alto e rivolti verso +x; ogni arma ha una sagoma propria.
function drawWeapon(g, wk, col, s) {
  g.save(); g.scale(s, s); g.lineWidth = 0.85;
  const body = path => { g.fillStyle = col.body; path(); g.fill(); g.strokeStyle = col.dark; g.stroke(); };
  const circle = (x, y, r) => () => { g.beginPath(); g.arc(x, y, r, 0, 7); };
  const dot = (x, y, r, c) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
  switch (wk) {
    case 'MG': // due canne sottili
      g.fillStyle = DK; g.fillRect(2, -2.2, 9, 1.5); g.fillRect(2, 0.7, 9, 1.5);
      body(circle(0, 0, 4));
      break;
    case 'HMG': // una canna spessa con manicotto forato, cassetta delle munizioni sul fianco
      g.fillStyle = '#5d5b45'; rr(g, -3, -6.6, 5.6, 2.8, 0.6); g.fill();
      g.fillStyle = DK; g.fillRect(3, -1.2, 11.5, 2.4); g.fillRect(13.8, -1.9, 1.8, 3.8);
      g.fillStyle = '#3b3a33'; g.fillRect(4, -1.9, 6.4, 3.8);
      g.fillStyle = BORE; for (const x of [4.8, 6.6, 8.4]) g.fillRect(x, -0.6, 1, 1.2);
      body(() => rr(g, -4.2, -4.2, 8.4, 8.4, 2));
      break;
    case 'CN':
      g.fillStyle = DK; g.fillRect(3, -1.4, 12, 2.8); g.fillRect(14, -2, 2.5, 4);
      body(() => rr(g, -5, -4.5, 10, 9, 2));
      break;
    case 'CN75': // torretta più grande, mantelletto, canna lunga con freno di bocca
      g.fillStyle = DK; g.fillRect(5, -1.6, 15, 3.2); g.fillRect(19.5, -2.5, 3, 5);
      g.fillStyle = BORE; g.fillRect(20.5, -2.5, 0.9, 5);
      g.fillStyle = col.dark; g.fillRect(4.6, -3.1, 3, 6.2);
      body(() => rr(g, -6.6, -5.7, 12.6, 11.4, 2.6));
      dot(-2.6, 2.4, 2, col.dark);
      break;
    case 'CN105': // torretta a cuneo con cesta posteriore, canna molto lunga con evacuatore dei fumi
      g.fillStyle = STEEL; rr(g, -11.5, -5, 4.5, 10, 1); g.fill();
      g.fillStyle = DK; g.fillRect(7, -1.7, 20, 3.4); g.beginPath(); g.ellipse(17, 0, 2.7, 2.6, 0, 0, 7); g.fill();
      g.fillRect(26.4, -2.8, 3.2, 5.6); g.fillStyle = BORE; g.fillRect(27.5, -2.8, 0.9, 5.6);
      g.fillStyle = col.dark; g.fillRect(6, -3.5, 3, 7);
      body(() => { g.beginPath(); g.moveTo(-8, -6.6); g.lineTo(4.5, -6.6); g.lineTo(8, -3.6); g.lineTo(8, 3.6); g.lineTo(4.5, 6.6); g.lineTo(-8, 6.6); g.closePath(); });
      dot(-3.6, -2.7, 2.1, col.dark); dot(-3, 3.2, 1.4, col.dark);
      break;
    case 'FL': // due serbatoi dietro, tubo, ugello svasato con la fiammella pilota
      for (const y of [-4.7, 1.1]) { g.fillStyle = '#7d6f45'; rr(g, -8.5, y, 7.5, 3.6, 1.8); g.fill(); g.strokeStyle = '#3d3522'; g.stroke(); g.fillStyle = '#4f472c'; g.fillRect(-5.2, y, 1, 3.6); }
      g.fillStyle = DK; g.fillRect(2, -1, 9, 2);
      g.beginPath(); g.moveTo(10.5, -1.1); g.lineTo(13, -2); g.lineTo(13, 2); g.lineTo(10.5, 1.1); g.closePath(); g.fill();
      body(circle(0.5, 0, 3.6));
      dot(13.7, 0, 0.95, '#ff9a3c');
      break;
    case 'RP': // gru: braccio a traliccio con gancio, cassetta con la croce verde
      body(circle(0, 0, 4));
      g.strokeStyle = '#d6c98e'; g.lineWidth = 0.9; g.beginPath();
      g.moveTo(1, -1.5); g.lineTo(12.6, -0.8); g.moveTo(1, 1.5); g.lineTo(12.6, 0.8);
      for (let x = 1; x < 12; x += 2.3) { g.moveTo(x, -1.4); g.lineTo(x + 2.3, 1.3); }
      g.stroke();
      g.strokeStyle = DK; g.lineWidth = 0.8; g.beginPath(); g.arc(13.4, 0, 1.2, 0, 7); g.stroke();
      g.fillStyle = '#e6e1d0'; rr(g, -8, -3.1, 5.6, 6.2, 0.8); g.fill();
      g.fillStyle = '#3f9a5a'; g.fillRect(-5.85, -2.3, 1.3, 4.6); g.fillRect(-7.5, -0.65, 4.6, 1.3);
      break;
    case 'RK':
      g.fillStyle = STEEL; rr(g, -4, -5, 11, 10, 1.5); g.fill(); g.strokeStyle = col.dark; g.stroke();
      g.fillStyle = DK; for (const yy of [-2.6, 0, 2.6]) { g.beginPath(); g.arc(5, yy, 1.1, 0, 7); g.fill(); }
      g.fillStyle = col.body; g.fillRect(-4, -5, 3, 10);
      break;
    case 'MRL': // cassone largo con sei tubi affiancati
      body(() => rr(g, -9.5, -5, 5, 10, 1.2));
      g.fillStyle = STEEL; rr(g, -6, -7, 16.5, 14, 1.4); g.fill(); g.strokeStyle = col.dark; g.stroke();
      for (let i = 0; i < 6; i++) { const y = -5.7 + i * 2.28; g.fillStyle = '#35342b'; g.fillRect(-5, y, 15, 1.7); dot(9.6, y + 0.85, 0.75, BORE); }
      g.fillStyle = col.body; g.fillRect(-6, -7, 2.2, 14);
      break;
    case 'AT': // rampa con il missile pronto: corpo chiaro, ogiva scura, alette; mirino sul fianco
      body(circle(-1, 0, 4));
      g.fillStyle = STEEL; g.fillRect(-4.5, -3.3, 15.5, 1.1); g.fillRect(-4.5, 2.2, 15.5, 1.1);
      g.fillStyle = '#8f8a74'; for (const k of [-1, 1]) { g.beginPath(); g.moveTo(-3.2, k * 1.2); g.lineTo(-0.8, k * 1.2); g.lineTo(-3.6, k * 3); g.closePath(); g.fill(); }
      g.fillStyle = '#dcd8c4'; rr(g, -3.2, -1.3, 13.4, 2.6, 1.2); g.fill();
      g.fillStyle = '#b4472c'; g.beginPath(); g.moveTo(10, -1.3); g.lineTo(12.6, 0); g.lineTo(10, 1.3); g.closePath(); g.fill();
      g.fillStyle = DK; g.fillRect(-4.5, -6, 3.6, 2.4);
      break;
    case 'MO':
      body(circle(0, 0, 5));
      g.fillStyle = DK; g.fillRect(-1, -2.6, 10, 5.2); dot(9, 0, 2, BORE);
      break;
    case 'HW': // affusto largo con vomeri, scudo, canna lunga con recuperatore e freno di bocca a due deflettori
      g.fillStyle = '#3a392f'; g.fillRect(-12, -5, 3.4, 2.2); g.fillRect(-12, 2.8, 3.4, 2.2);
      g.fillStyle = STEEL; rr(g, -9.5, -6.6, 12.5, 13.2, 1.5); g.fill(); g.strokeStyle = col.dark; g.stroke();
      g.fillStyle = DK; g.fillRect(-2, -1.4, 26.5, 2.8);
      g.fillStyle = '#3d3c34'; g.fillRect(0, -2.6, 10, 1.3); g.fillRect(0, 1.3, 10, 1.3);
      g.fillStyle = DK; g.fillRect(24, -2.7, 1.3, 5.4); g.fillRect(26.3, -2.7, 1.3, 5.4); g.fillRect(24, -1, 3.6, 2);
      body(() => rr(g, -4.5, -5.2, 6.5, 10.4, 1.5));
      break;
  }
  g.fillStyle = col.light; g.beginPath(); g.arc(-1, -1, 1.1, 0, 7); g.fill();
  g.restore();
}
export function drawVehicle(g, d, col, ang, tang, moving, t) {
  g.save(); g.rotate(ang); drawHull(g, d, col, moving ? (t * 24) : 0); g.restore();
  g.save(); g.rotate(tang); drawWeapon(g, d.w, col, TURRET_SC[d.c] || 1); g.restore();
}
// Scafo del mezzo rivolto verso +x: ombra, ruote o cingoli, carrozzeria. tread: avanzamento dei cingoli in pixel.
function drawHull(g, d, col, tread) {
  const C = CHASSIS[d.c], L = C.size[0], W = C.size[1], tr = '#26271f', X = d.c === 'X';
  g.fillStyle = 'rgba(0,0,0,0.3)'; rr(g, -L / 2 + 2, -W / 2 + 3, L + 1, W + 1, 3); g.fill();
  if (d.p === 'W') {
    g.fillStyle = tr; const xs = L > 24 ? [-L / 2 + 1, -L / 2 + 7.5, L / 2 - 12.5, L / 2 - 6] : L > 16 ? [-L / 2 + 1, -2.5, L / 2 - 6] : [-L / 2 + 1, L / 2 - 6];
    for (const sx of xs) { g.fillRect(sx, -W / 2 - 2, 5, 3); g.fillRect(sx, W / 2 - 1, 5, 3); }
  } else if (d.p === 'HT') {
    g.fillStyle = tr; g.fillRect(L / 2 - 6, -W / 2 - 2, 5, 3); g.fillRect(L / 2 - 6, W / 2 - 1, 5, 3);
    g.fillRect(-L / 2 - 0.5, -W / 2 - 2.5, L * 0.6, 3.5); g.fillRect(-L / 2 - 0.5, W / 2 - 1, L * 0.6, 3.5);
  } else if (d.p === 'T') {
    g.fillStyle = tr; g.fillRect(-L / 2 - 1, -W / 2 - 3, L + 2, 4); g.fillRect(-L / 2 - 1, W / 2 - 1, L + 2, 4);
    g.strokeStyle = '#45463b'; g.lineWidth = 1; const off = tread % 3; g.beginPath();
    for (let x = -L / 2 + off; x < L / 2; x += 3) { g.moveTo(x, -W / 2 - 3); g.lineTo(x, -W / 2 + 1); g.moveTo(x, W / 2 - 1); g.lineTo(x, W / 2 + 3); }
    g.stroke();
  } else if (d.p === 'TR') {
    // cingoli rinforzati: larghi, a piastre distanziate, con la guida centrale scura
    const x0 = -L / 2 - 2, len = L + 4, off = tread % 3.4;
    g.fillStyle = tr; g.fillRect(x0, -W / 2 - 4.5, len, 6); g.fillRect(x0, W / 2 - 1.5, len, 6);
    g.fillStyle = '#4a4b3f';
    for (let x = x0 + off; x < x0 + len - 2; x += 3.4) { g.fillRect(x, -W / 2 - 4.2, 2.1, 5.4); g.fillRect(x, W / 2 - 1.2, 2.1, 5.4); }
    g.fillStyle = '#18190f'; g.fillRect(x0, -W / 2 - 1.9, len, 0.8); g.fillRect(x0, W / 2 + 1.1, len, 0.8);
  } else if (d.p === 'V') {
    g.fillStyle = '#2d302b'; g.beginPath(); g.ellipse(0, 0, L / 2 + 3, W / 2 + 3, 0, 0, 7); g.fill();
    g.strokeStyle = 'rgba(210,220,205,0.3)'; g.lineWidth = 1; g.stroke();
    g.fillStyle = '#3a3d36'; g.fillRect(-L / 2 - 2, -3, 3, 6);
  }
  g.fillStyle = col.body; rr(g, -L / 2, -W / 2, L, W, 2.5); g.fill(); g.strokeStyle = col.dark; g.lineWidth = 1; g.stroke();
  if (X) {
    // Mammut: gonne corazzate sui fianchi, griglia del motore dietro, piastra frontale a cuneo, bulloni
    g.fillStyle = col.dark; g.globalAlpha = 0.5; g.fillRect(-L / 2 + 1, -W / 2 + 0.8, L - 2, 2.2); g.fillRect(-L / 2 + 1, W / 2 - 3, L - 2, 2.2);
    g.globalAlpha = 0.8; g.strokeStyle = col.dark; g.lineWidth = 0.8; g.beginPath();
    for (let y = -W / 2 + 4.6; y <= W / 2 - 4.5; y += 1.7) { g.moveTo(-L / 2 + 2.2, y); g.lineTo(-L / 2 + 7.5, y); }
    g.moveTo(L / 2 - 6.5, -W / 2 + 3.2); g.lineTo(L / 2 - 1.8, -W / 2 + 6.2); g.lineTo(L / 2 - 1.8, W / 2 - 6.2); g.lineTo(L / 2 - 6.5, W / 2 - 3.2);
    g.stroke();
    g.fillStyle = col.light; g.globalAlpha = 0.45; g.beginPath(); g.moveTo(L / 2 - 6.5, -W / 2 + 3.2); g.lineTo(L / 2 - 1.8, -W / 2 + 6.2); g.lineTo(L / 2 - 1.8, W / 2 - 6.2); g.lineTo(L / 2 - 6.5, W / 2 - 3.2); g.lineTo(L / 2 - 1, W / 2 - 3.2); g.lineTo(L / 2 - 1, -W / 2 + 3.2); g.closePath(); g.fill();
    g.globalAlpha = 0.9; g.fillStyle = col.dark;
    for (const x of [-L / 2 + 10, -2, 6]) for (const y of [-W / 2 + 1.9, W / 2 - 1.9]) { g.beginPath(); g.arc(x, y, 0.55, 0, 7); g.fill(); }
    g.globalAlpha = 1;
  } else {
    g.fillStyle = col.dark; g.globalAlpha = 0.5; g.fillRect(-L / 2 + 1.5, -W / 2 + 2, 3, W - 4);
    g.fillStyle = col.light; g.globalAlpha = 0.4; g.fillRect(L / 2 - 4, -W / 2 + 1.5, 2.5, W - 3); g.globalAlpha = 1;
  }
}
/* ---------- sagome già pronte ---------- */
// Scafi (telaio + propulsione + colore, con alcune fasi dei cingoli) e torrette (arma + telaio + colore) disegnati una
// volta su tele fuori schermo alla risoluzione dello schermo, poi copiati ruotati: pochi comandi per mezzo.
// Le tele sono ritagliate sull'ingombro del disegno: meno pixel trasparenti da copiare per ogni mezzo.
const sprites = new Map(), TREAD_PH = 8;
// Ingombro di ogni torretta a scala 1 [x0, y0, x1, y1], con la canna verso +x.
const WEAPON_BOX = {
  MG: [-4.5, -4.5, 11.5, 4.5], HMG: [-4.7, -7.1, 16, 4.7], CN: [-5.5, -5, 17, 5], CN75: [-7.1, -6.2, 23, 6.2],
  CN105: [-12, -7.1, 30, 7.1], FL: [-9, -5.2, 15.2, 5.2], RP: [-8.5, -4.5, 15.1, 4.5], RK: [-4.5, -5.5, 7.5, 5.5],
  MRL: [-10, -7.5, 11, 7.5], AT: [-5.5, -6.5, 13.1, 4.5], MO: [-5.5, -5.5, 11.5, 5.5], HW: [-12.5, -7.1, 28.1, 7.1],
};
function sprite(key, k, x0, y0, x1, y1, draw) {
  let s = sprites.get(key);
  if (!s) {
    if (sprites.size > 600) sprites.clear();
    const c = document.createElement('canvas'); c.width = Math.ceil((x1 - x0) * k); c.height = Math.ceil((y1 - y0) * k);
    const g = c.getContext('2d'); g.setTransform(k, 0, 0, k, -x0 * k, -y0 * k); draw(g);
    s = { c, x: x0, y: y0, w: c.width / k, h: c.height / k }; sprites.set(key, s);
  }
  return s;
}
function hullSprite(d, owner, moving, t, k) {
  const C = CHASSIS[d.c], per = d.p === 'TR' ? 3.4 : 3, anim = moving && (d.p === 'T' || d.p === 'TR');
  const ph = anim ? Math.floor(((t * 24) % per) / per * TREAD_PH) % TREAD_PH : 0, hx = C.size[0] / 2 + 4, hy = C.size[1] / 2 + 5.5;
  return sprite(`h${d.c}${d.p}${owner}:${ph}:${k}`, k, -hx, -hy, hx, hy, g => drawHull(g, d, PAL[owner], ph * per / TREAD_PH));
}
function turretSprite(d, owner, k) {
  const sc = TURRET_SC[d.c] || 1, b = WEAPON_BOX[d.w] || [-14, -9, 16, 9], m = 1;
  return sprite(`t${d.w}${d.c}${owner}:${k}`, k, (b[0] - m) * sc, (b[1] - m) * sc, (b[2] + m) * sc, (b[3] + m) * sc, g => drawWeapon(g, d.w, PAL[owner], sc));
}
// Quanto si allunga il mezzo dal centro, dietro e davanti (con la canna), per inquadrarlo nell'anteprima.
export function vehicleExtent(d) {
  const L = CHASSIS[d.c].size[0];
  return { back: L / 2 + 3, front: Math.max(L / 2 + 3, (WEAPON_REACH[d.w] || 12) * (TURRET_SC[d.c] || 1)) };
}
function drawTruck(g, col, ang, working, t) {
  g.save(); g.rotate(ang);
  g.fillStyle = 'rgba(0,0,0,0.3)'; rr(g, -8, -4, 20, 11, 2); g.fill();
  g.fillStyle = '#26271f'; for (const x of [-8, -3, 5]) { g.fillRect(x, -7, 4, 2.5); g.fillRect(x, 4.5, 4, 2.5); }
  g.fillStyle = '#6c6a5c'; rr(g, -10, -5, 13, 10, 1.5); g.fill(); g.strokeStyle = '#3d3b33'; g.lineWidth = 1; g.stroke();
  g.fillStyle = col.body; rr(g, 3, -5, 7.5, 10, 2); g.fill(); g.strokeStyle = col.dark; g.stroke();
  g.fillStyle = '#a9bcbc'; g.fillRect(8.5, -3.5, 1.6, 7);
  g.save(); g.translate(-5, 0); g.rotate(working ? Math.sin(t * 4) * 0.7 : 0.25);
  g.fillStyle = col.light; g.fillRect(0, -1.2, 12, 2.4); g.fillStyle = '#2a2925'; g.fillRect(11, -2, 2, 4);
  g.restore();
  g.fillStyle = '#2a2925'; g.beginPath(); g.arc(-5, 0, 2.2, 0, 7); g.fill();
  g.restore();
}
function pad(g, x0, y0, w, h) {
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x0 + 4, y0 + 5, w - 4, h - 4);
  g.fillStyle = '#6e6a5b'; g.fillRect(x0 + 2, y0 + 2, w - 4, h - 4);
  g.strokeStyle = '#47443a'; g.lineWidth = 1; g.strokeRect(x0 + 2.5, y0 + 2.5, w - 5, h - 5);
}
function drawStructBody(g, s, x0, y0, w, h, col, t, live) {
  const cx = x0 + w / 2, cy = y0 + h / 2;
  switch (s.type) {
    case 'hq': {
      pad(g, x0, y0, w, h);
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x0 + 16, y0 + 17, w - 28, h - 32);
      g.fillStyle = col.body; g.fillRect(x0 + 12, y0 + 12, w - 30, h - 32); g.strokeStyle = col.dark; g.lineWidth = 1.5; g.strokeRect(x0 + 12, y0 + 12, w - 30, h - 32);
      g.strokeStyle = col.dark; g.globalAlpha = 0.45; g.lineWidth = 1;
      for (let i = 1; i < 4; i++) { const xx = x0 + 12 + i * (w - 30) / 4; g.beginPath(); g.moveTo(xx, y0 + 12); g.lineTo(xx, y0 + h - 20); g.stroke(); }
      g.globalAlpha = 1;
      g.strokeStyle = col.light; g.lineWidth = 3; const ex = x0 + 12 + (w - 30) / 2, ey = y0 + 12 + (h - 32) / 2;
      g.beginPath(); g.moveTo(ex - 10, ey - 3); g.lineTo(ex, ey + 5); g.lineTo(ex + 10, ey - 3); g.stroke();
      g.beginPath(); g.moveTo(ex - 10, ey - 11); g.lineTo(ex, ey - 3); g.lineTo(ex + 10, ey - 11); g.stroke();
      const rx = x0 + w - 13, ry = y0 + 20;
      g.fillStyle = '#4f4d44'; g.beginPath(); g.arc(rx, ry, 8, 0, 7); g.fill();
      g.save(); g.translate(rx, ry); g.rotate((live ? t * 1.4 : 0) + s.phase);
      g.fillStyle = '#d8d3c1'; g.beginPath(); g.ellipse(0, 0, 3, 9, 0, 0, 7); g.fill(); g.fillStyle = '#33322c'; g.fillRect(0, -1, 7, 2); g.restore();
      g.fillStyle = '#33322c'; g.beginPath(); g.arc(x0 + 14, y0 + h - 12, 3.5, 0, 7); g.fill();
      g.strokeStyle = '#33322c'; g.lineWidth = 1; g.beginPath(); g.moveTo(x0 + 14, y0 + h - 12); g.lineTo(x0 + 26, y0 + h - 8); g.stroke();
      g.fillStyle = '#2a2925'; g.fillRect(cx - 14, y0 + h - 20, 28, 7);
      if (live && Math.sin(t * 4 + s.phase) > 0.5) { g.fillStyle = col.light; g.beginPath(); g.arc(x0 + 8, y0 + 8, 2, 0, 7); g.fill(); }
      break;
    }
    case 'pump': {
      g.fillStyle = 'rgba(18,15,11,0.9)'; g.beginPath(); g.ellipse(cx, cy, 14, 12, 0, 0, 7); g.fill();
      g.fillStyle = '#6e6a5b'; rr(g, x0 + 6, y0 + 6, 20, 20, 2); g.fill(); g.strokeStyle = '#47443a'; g.lineWidth = 1; g.stroke();
      g.fillStyle = col.body; g.beginPath(); g.arc(x0 + 11, y0 + 21, 4.5, 0, 7); g.fill(); g.strokeStyle = col.dark; g.stroke();
      const k = live ? Math.sin(t * 2.6 + s.phase) : 0;
      g.save(); g.translate(cx + 1, cy - 2); g.rotate(-0.65);
      g.fillStyle = '#33322c'; g.fillRect(-2.5, -2.5, 5, 5);
      g.fillStyle = col.light; g.fillRect(-9, -1.6, 18 + k * 3, 3.2);
      g.fillStyle = col.dark; g.fillRect(8 + k * 3, -3.5, 3.5, 7);
      g.restore();
      break;
    }
    case 'factory': {
      pad(g, x0, y0, w, h);
      g.fillStyle = '#7b776a'; g.fillRect(x0 + 6, y0 + 6, w - 12, h - 20);
      g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1; g.beginPath();
      for (let xx = x0 + 9; xx < x0 + w - 6; xx += 4) { g.moveTo(xx + 0.5, y0 + 12); g.lineTo(xx + 0.5, y0 + h - 14); }
      g.stroke();
      g.fillStyle = col.body; g.fillRect(x0 + 6, y0 + 6, w - 12, 6);
      g.fillStyle = '#2a2925'; g.fillRect(cx - 16, y0 + h - 15, 32, 10);
      for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#2a2925' : col.light; g.fillRect(cx - 16 + i * 4, y0 + h - 17, 4, 2); }
      g.fillStyle = '#4a4840'; g.beginPath(); g.arc(x0 + w - 16, y0 + 20, 6.5, 0, 7); g.fill();
      g.fillStyle = '#191814'; g.beginPath(); g.arc(x0 + w - 16, y0 + 20, 3.5, 0, 7); g.fill();
      if (live && s.queue.length && Math.sin(t * 6) > 0) { g.fillStyle = '#f0b04a'; g.beginPath(); g.arc(cx - 19, y0 + h - 10, 2, 0, 7); g.arc(cx + 19, y0 + h - 10, 2, 0, 7); g.fill(); }
      break;
    }
    case 'lab': {
      pad(g, x0, y0, w, h);
      g.fillStyle = '#86837a'; g.fillRect(x0 + 7, y0 + 7, w - 14, h - 14);
      const gr = g.createRadialGradient(cx - 5, cy - 5, 2, cx, cy, 17);
      gr.addColorStop(0, '#eef1ee'); gr.addColorStop(1, '#7f8b8c');
      g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, 15, 0, 7); g.fill();
      g.strokeStyle = col.body; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, 16, 0, 7); g.stroke();
      g.strokeStyle = 'rgba(60,70,70,0.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(cx - 15, cy); g.lineTo(cx + 15, cy); g.stroke();
      g.fillStyle = '#33322c'; g.fillRect(x0 + w - 12, y0 + 8, 3, 3);
      if (live && s.rs && Math.sin(t * 5) > 0) { g.fillStyle = '#9fd6c8'; g.beginPath(); g.arc(x0 + w - 10.5, y0 + 9.5, 2, 0, 7); g.fill(); }
      break;
    }
    case 'tower': {
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.arc(cx + 2, cy + 3, 14, 0, 7); g.fill();
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; g.save(); g.translate(cx + Math.cos(a) * 11, cy + Math.sin(a) * 11); g.rotate(a + Math.PI / 2); g.fillStyle = i % 2 ? '#8f8566' : '#9c9271'; rr(g, -4, -2.5, 8, 5, 2); g.fill(); g.restore(); }
      g.fillStyle = '#55524a'; g.beginPath(); g.arc(cx, cy, 7, 0, 7); g.fill();
      const tw = towerWeapon(s.owner).key;
      g.save(); g.translate(cx, cy); g.rotate(s.tang); drawWeapon(g, tw, col, tw === 'CN75' ? 1 : 1.15); g.restore();
      break;
    }
    case 'bunker': {
      // bunker pesante: lastra di cemento smussata, blocco rialzato con feritoie sui quattro lati, cannone 75 in cupola
      const oct = (i, k) => {
        g.beginPath(); g.moveTo(x0 + i + k, y0 + i); g.lineTo(x0 + w - i - k, y0 + i); g.lineTo(x0 + w - i, y0 + i + k); g.lineTo(x0 + w - i, y0 + h - i - k);
        g.lineTo(x0 + w - i - k, y0 + h - i); g.lineTo(x0 + i + k, y0 + h - i); g.lineTo(x0 + i, y0 + h - i - k); g.lineTo(x0 + i, y0 + i + k); g.closePath();
      };
      g.save(); g.translate(3, 4); g.fillStyle = 'rgba(0,0,0,0.35)'; oct(3, 10); g.fill(); g.restore();
      g.fillStyle = '#827f6c'; oct(3, 10); g.fill(); g.strokeStyle = '#4b493e'; g.lineWidth = 1.2; g.stroke();
      g.strokeStyle = 'rgba(40,38,30,0.25)'; g.lineWidth = 1; g.beginPath();
      for (let yy = y0 + 9; yy < y0 + h - 5; yy += 6) { g.moveTo(x0 + 5, yy + 0.5); g.lineTo(x0 + w - 5, yy + 0.5); }
      g.stroke();
      g.fillStyle = 'rgba(255,250,230,0.1)'; g.beginPath(); g.moveTo(x0 + 13, y0 + 3); g.lineTo(x0 + w - 13, y0 + 3); g.lineTo(x0 + w - 18, y0 + 8); g.lineTo(x0 + 18, y0 + 8); g.closePath(); g.fill();
      g.fillStyle = '#99967f'; oct(11, 7); g.fill(); g.strokeStyle = col.body; g.lineWidth = 1.8; g.stroke();
      g.fillStyle = '#16150f';
      g.fillRect(cx - 7, y0 + 13.5, 14, 2.6); g.fillRect(cx - 7, y0 + h - 16.1, 14, 2.6); g.fillRect(x0 + 13.5, cy - 7, 2.6, 14); g.fillRect(x0 + w - 16.1, cy - 7, 2.6, 14);
      g.fillStyle = '#5f5c50'; g.beginPath(); g.arc(cx, cy, 10, 0, 7); g.fill(); g.strokeStyle = '#3f3d34'; g.lineWidth = 1; g.stroke();
      g.save(); g.translate(cx, cy); g.rotate(s.tang); drawWeapon(g, 'CN75', col, 1.1); g.restore();
      break;
    }
    case 'depot': {
      pad(g, x0, y0, w, h);
      g.setLineDash([5, 4]); g.strokeStyle = col.light; g.lineWidth = 2; g.strokeRect(x0 + 9, y0 + 9, w - 18, h - 18); g.setLineDash([]);
      g.fillStyle = col.body; g.fillRect(cx - 9, cy - 2.5, 18, 5); g.fillRect(cx - 2.5, cy - 9, 5, 18);
      g.save(); g.translate(x0 + 10, y0 + 10); g.rotate((live ? t * 0.5 : 0) + s.phase);
      g.fillStyle = '#33322c'; g.beginPath(); g.arc(0, 0, 4, 0, 7); g.fill(); g.fillStyle = col.light; g.fillRect(0, -1.5, 20, 3); g.restore();
      break;
    }
  }
}
function drawStruct(g, s, t) {
  const x0 = s.tx * TILE, y0 = s.ty * TILE, w = s.w * TILE, h = s.h * TILE, col = PAL[s.owner];
  if (s.built < 1) {
    g.fillStyle = 'rgba(25,25,20,0.35)'; g.fillRect(x0 + 2, y0 + 2, w - 4, h - 4);
    g.save(); g.beginPath(); g.rect(x0, y0 + h * (1 - s.built), w, h * s.built); g.clip(); g.globalAlpha = 0.85; drawStructBody(g, s, x0, y0, w, h, col, t, false); g.restore();
    g.setLineDash([4, 3]); g.strokeStyle = col.light; g.lineWidth = 1; g.strokeRect(x0 + 2.5, y0 + 2.5, w - 5, h - 5); g.setLineDash([]);
    g.strokeStyle = 'rgba(230,220,190,0.25)'; g.beginPath(); g.moveTo(x0 + 3, y0 + 3); g.lineTo(x0 + w - 3, y0 + h - 3); g.moveTo(x0 + w - 3, y0 + 3); g.lineTo(x0 + 3, y0 + h - 3); g.stroke();
    // impalcatura che sale con il cantiere
    const hy = y0 + h * (1 - s.built), top = Math.max(y0 + 3, hy - 6);
    g.strokeStyle = 'rgba(214,198,150,0.7)'; g.lineWidth = 1.2; g.beginPath();
    for (const xx of [x0 + 4, x0 + w / 2, x0 + w - 4]) { g.moveTo(xx, y0 + h - 3); g.lineTo(xx, top); }
    g.moveTo(x0 + 3, top + 1); g.lineTo(x0 + w - 3, top + 1); g.moveTo(x0 + 3, (top + y0 + h) / 2); g.lineTo(x0 + w - 3, (top + y0 + h) / 2);
    g.stroke();
    return;
  }
  drawStructBody(g, s, x0, y0, w, h, col, t, true);
}
// k: scala delle sagome già pronte (0 = disegno diretto).
function drawUnit(g, u, t, ct, k) {
  const t0 = fxs.spawns.get(u.id), a = t0 == null ? 9 : ct - t0;
  let x = u.x, y = u.y;
  if (a < 0.6) {
    // mezzo appena uscito dalla fabbrica: arriva dalla porta e compare in dissolvenza
    const f = Math.max(0, a / 0.6), back = reducedMotion() ? 0 : 14 * (1 - f) * (1 - f);
    g.globalAlpha = 0.15 + 0.85 * f; x -= Math.cos(u.ang) * back; y -= Math.sin(u.ang) * back;
  }
  const sc = TF[0], ex = sc * x + TF[1], ey = sc * y + TF[2];
  if (u.builder || !k) {
    g.save(); g.setTransform(sc, 0, 0, sc, ex, ey);
    if (u.builder) drawTruck(g, PAL[u.owner], u.ang, u.working, t);
    else drawVehicle(g, u.d, PAL[u.owner], u.ang, u.tang, u.moving, t);
    g.restore();
  } else {
    let c = Math.cos(u.ang) * sc, s = Math.sin(u.ang) * sc;
    const h = hullSprite(u.d, u.owner, u.moving, t, k);
    g.setTransform(c, s, -s, c, ex, ey); g.drawImage(h.c, h.x, h.y, h.w, h.h);
    c = Math.cos(u.tang) * sc; s = Math.sin(u.tang) * sc;
    const w = turretSprite(u.d, u.owner, k);
    g.setTransform(c, s, -s, c, ex, ey); g.drawImage(w.c, w.x, w.y, w.w, w.h);
  }
  g.globalAlpha = 1;
}
// Segno dell'ordine: quattro frecce che si stringono sul punto, poi svaniscono.
function drawMark(g, f, rm) {
  const k = f.life / f.max, p = 1 - k, e = 1 - (1 - Math.min(1, p / 0.55)) ** 3, d = rm ? 7 : 20 - 14 * e;
  g.strokeStyle = f.c; g.lineWidth = 2; g.globalAlpha = k < 0.35 ? k / 0.35 : 1;
  g.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4, cx = f.x + Math.cos(a) * d, cy = f.y + Math.sin(a) * d;
    g.moveTo(cx + Math.cos(a + 0.75) * 5, cy + Math.sin(a + 0.75) * 5); g.lineTo(cx, cy); g.lineTo(cx + Math.cos(a - 0.75) * 5, cy + Math.sin(a - 0.75) * 5);
  }
  g.stroke();
  if (p > 0.45) { g.lineWidth = 1.5; g.beginPath(); g.arc(f.x, f.y, 2 + 6 * (p - 0.45), 0, 7); g.stroke(); }
  g.globalAlpha = 1;
}
export function hpColor(f) { return f > 0.6 ? '#93a85c' : f > 0.3 ? '#e2b84a' : '#d0533f'; }
function bar(g, x, y, w, f) {
  g.fillStyle = 'rgba(0,0,0,0.65)'; g.fillRect(x - 1, y - 1, w + 2, 5);
  g.fillStyle = hpColor(f); g.fillRect(x, y, w * clamp(f, 0, 1), 3);
}
// In media e bassa qualità le barre dei mezzi si raccolgono e si disegnano con quattro riempimenti in tutto.
const barBg = [], barCol = new Map();
function barLater(x, y, w, f) {
  barBg.push(x - 1, y - 1, w + 2, 5);
  const c = hpColor(f); let a = barCol.get(c); if (!a) barCol.set(c, a = []);
  a.push(x, y, w * clamp(f, 0, 1), 3);
}
function fillRects(g, style, a) {
  if (!a.length) return;
  g.fillStyle = style; g.beginPath();
  for (let i = 0; i < a.length; i += 4) g.rect(a[i], a[i + 1], a[i + 2], a[i + 3]);
  g.fill(); a.length = 0;
}
function brackets(g, x, y, w, h, c) {
  const l = Math.min(6, w / 3); g.strokeStyle = c; g.lineWidth = 1.5; g.beginPath();
  g.moveTo(x, y + l); g.lineTo(x, y); g.lineTo(x + l, y); g.moveTo(x + w - l, y); g.lineTo(x + w, y); g.lineTo(x + w, y + l);
  g.moveTo(x + w, y + h - l); g.lineTo(x + w, y + h); g.lineTo(x + w - l, y + h); g.moveTo(x + l, y + h); g.lineTo(x, y + h); g.lineTo(x, y + h - l);
  g.stroke();
}

/* ---------- fotogramma ---------- */
const FIRE_C = ['#c4502a', '#ff9a3c', '#ffd27a'];
const burnList = [], selSet = new Set();
function drawParts(g, inView) {
  for (const p of fxs.parts) {
    if (!inView(p.x, p.y, 20)) continue;
    const k = p.life / p.max;
    switch (p.k) {
      case 'smoke': g.globalAlpha = 0.42 * k; g.fillStyle = '#46443c'; g.beginPath(); g.arc(p.x, p.y, p.s * (2 - k), 0, 7); g.fill(); break;
      case 'dust': g.globalAlpha = 0.32 * k; g.fillStyle = '#7d6c50'; g.beginPath(); g.arc(p.x, p.y, p.s * (2.2 - k), 0, 7); g.fill(); break;
      case 'fire': g.globalAlpha = k; g.fillStyle = FIRE_C[k > 0.66 ? 2 : k > 0.33 ? 1 : 0]; g.beginPath(); g.arc(p.x, p.y, p.s * k + 0.5, 0, 7); g.fill(); break;
      case 'spark': g.globalAlpha = k; g.fillStyle = '#ffe696'; g.fillRect(p.x, p.y, p.s, p.s); break;
      case 'rspark': g.globalAlpha = k; g.fillStyle = k > 0.5 ? '#e4fff2' : '#7fe6c0'; g.fillRect(p.x, p.y, p.s, p.s); break;
      case 'debris':
        g.globalAlpha = Math.min(1, k * 2);
        if (p.z > 1) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(p.x, p.y, p.s, p.s); }
        g.fillStyle = '#28261f'; g.fillRect(p.x, p.y - p.z, p.s, p.s); break;
      case 'spray': g.globalAlpha = 0.5 * k; g.fillStyle = '#c8e1e6'; g.beginPath(); g.arc(p.x, p.y, p.s * (1.6 - k), 0, 7); g.fill(); break;
      case 'wake': g.globalAlpha = 0.4 * k; g.strokeStyle = '#d2e6e8'; g.lineWidth = 1; g.beginPath(); g.arc(p.x, p.y, p.s * (3 - 2 * k), 0, 7); g.stroke(); break;
    }
  }
  g.globalAlpha = 1;
}
// Trasformazione del mondo del fotogramma [scala, scostamento x, scostamento y]: le sagome ruotate si piazzano con
// setTransform (at) e si torna al mondo con home, senza save/restore per ogni oggetto.
const TF = [1, 0, 0];
function at(g, x, y, a, k = 1) { const m = TF[0] * k, c = Math.cos(a) * m, s = Math.sin(a) * m; g.setTransform(c, s, -s, c, TF[0] * x + TF[1], TF[0] * y + TF[2]); }
const home = g => g.setTransform(TF[0], 0, 0, TF[0], TF[1], TF[2]);
function drawWreck(g, w) {
  const fade = Math.min(1, (w.life - w.t) / 1.5), burning = w.t < w.life - 2.5;
  at(g, w.x, w.y, w.a); g.globalAlpha = fade;
  g.fillStyle = 'rgba(10,9,7,0.5)'; g.beginPath(); g.ellipse(0, 0, 12, 8, 0, 0, 7); g.fill();
  g.fillStyle = '#211e19'; rr(g, -8, -5, 16, 10, 2); g.fill();
  g.fillStyle = '#34302a'; g.fillRect(-3, -3, 7, 6); g.fillStyle = '#16140f'; g.fillRect(3, -1, 8, 2);
  home(g); g.globalAlpha = 1;
  if (burning) burnList.push(w);
}
function drawMuzzle(g, f) {
  const k = f.life / f.max, sc = f.sc || 1;
  at(g, f.x, f.y, f.a, sc); g.globalAlpha = k;
  if (f.st === 'mg') {
    g.fillStyle = '#ffe9a6';
    for (const yy of [-1.6, 1.6]) { g.beginPath(); g.moveTo(-1, yy); g.lineTo(3, yy - 1.3); g.lineTo(9, yy); g.lineTo(3, yy + 1.3); g.closePath(); g.fill(); }
  } else if (f.st === 'hmg') {
    g.fillStyle = '#ffe9a6'; g.beginPath(); g.moveTo(-1, 0); g.lineTo(4, -2.4); g.lineTo(12, 0); g.lineTo(4, 2.4); g.closePath(); g.fill();
    g.fillStyle = '#ffc266'; g.beginPath(); g.moveTo(2, 0); g.lineTo(3.5, -5); g.lineTo(5, 0); g.lineTo(3.5, 5); g.closePath(); g.fill();
  } else if (f.st === 'cn') {
    g.fillStyle = '#fff1c4'; g.beginPath(); g.moveTo(-2, 0); g.lineTo(4, -3.5); g.lineTo(15, 0); g.lineTo(4, 3.5); g.closePath(); g.fill();
    g.fillStyle = '#ffc266'; g.beginPath(); g.moveTo(1, 0); g.lineTo(3, -9); g.lineTo(6, 0); g.lineTo(3, 9); g.closePath(); g.fill();
  } else if (f.st === 'rk') {
    g.fillStyle = '#ffb347'; g.beginPath(); g.moveTo(-16, 0); g.lineTo(-6, -3); g.lineTo(-2, 0); g.lineTo(-6, 3); g.closePath(); g.fill();
    g.fillStyle = '#fff0c0'; g.beginPath(); g.arc(1, 0, 2.5, 0, 7); g.fill();
  } else if (f.st === 'fl') {
    g.fillStyle = '#ff9a3c'; g.beginPath(); g.ellipse(3, 0, 5, 3, 0, 0, 7); g.fill();
  } else {
    g.fillStyle = '#ffd890'; g.beginPath(); g.arc(1, 0, 4 * k + 1, 0, 7); g.fill();
  }
  home(g); g.globalAlpha = 1;
  return (f.st === 'mg' ? 9 : f.st === 'hmg' ? 12 : f.st === 'cn' ? 22 : f.st === 'rk' ? 16 : 12) * sc;
}
// Scia sottile di un proiettile: gli ultimi punti del suo percorso, sempre più trasparenti verso la coda.
const trails = new WeakMap();
function drawTrail(g, p, x, y, rgb, lw, max) {
  let pts = trails.get(p);
  if (!pts) { pts = []; trails.set(p, pts); }
  const l = pts[pts.length - 1];
  if (!l || Math.abs(l[0] - x) + Math.abs(l[1] - y) > 3) { pts.push([x, y]); if (pts.length > max) pts.shift(); }
  // tre tratti di trasparenza crescente verso la testa: pochi stroke anche con molti colpi in volo
  g.lineWidth = lw; const n = pts.length;
  for (let b = 0; b < 3; b++) {
    const i0 = Math.floor(b * (n - 1) / 3), i1 = b === 2 ? n - 1 : Math.floor((b + 1) * (n - 1) / 3); if (i1 <= i0 && b < 2) continue;
    g.strokeStyle = rgb + (0.18 * (b + 1)).toFixed(2) + ')'; g.beginPath(); g.moveTo(pts[i0][0], pts[i0][1]);
    for (let i = i0 + 1; i <= i1; i++) g.lineTo(pts[i][0], pts[i][1]);
    if (b === 2) g.lineTo(x, y);
    g.stroke();
  }
}
// Getto del lanciafiamme (modalità additiva): tre lingue sovrapposte che si allungano verso il bersaglio e tremano.
function drawFlame(g, f, t) {
  const k = f.life / f.max, ext = Math.min(1, (1 - k) / 0.2), dx = f.x2 - f.x1, dy = f.y2 - f.y1, d = Math.hypot(dx, dy) || 1;
  const len = d * ext, fl = 1 + 0.2 * Math.sin(t * 47 + f.ph), wEnd = Math.min(f.r * 0.6, 5 + len * 0.28) * fl, al = Math.min(1, k * 2.4);
  g.save(); g.translate(f.x1, f.y1); g.rotate(Math.atan2(dy, dx));
  const tongue = (w0, w1, l, c, a) => {
    g.globalAlpha = a; g.fillStyle = c; g.beginPath(); g.moveTo(0, -w0);
    g.quadraticCurveTo(l * 0.55, -w1 * 1.15, l, -w1 * 0.55); g.quadraticCurveTo(l + w1 * 0.9, 0, l, w1 * 0.55);
    g.quadraticCurveTo(l * 0.55, w1 * 1.15, 0, w0); g.closePath(); g.fill();
  };
  tongue(1.8, wEnd, len, '#c4502a', 0.6 * al);
  tongue(1.2, wEnd * 0.62, len * 0.86, '#ff9a3c', 0.7 * al);
  tongue(0.6, wEnd * 0.3, len * 0.6, '#ffe6a0', 0.85 * al);
  g.restore();
  glow(g, f.x2, f.y2, f.r * 0.95 * fl, 0.5 * al);
  glow(g, f.x1, f.y1, 9, 0.5 * al);
}
// Raggio del modulo riparazione (modalità additiva): arco tremolante dal braccio della gru al mezzo riparato.
function drawRepair(g, f) {
  const k = f.life / f.max, dx = f.x2 - f.x1, dy = f.y2 - f.y1, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
  const sx = f.x1 + ux * Math.min(12, d * 0.4), sy = f.y1 + uy * Math.min(12, d * 0.4), n = 6;
  g.beginPath(); g.moveTo(sx, sy);
  for (let i = 1; i < n; i++) { const q = i / n, j = (Math.random() - 0.5) * 5; g.lineTo(sx + (f.x2 - sx) * q - uy * j, sy + (f.y2 - sy) * q + ux * j); }
  g.lineTo(f.x2, f.y2);
  g.globalAlpha = 1; g.strokeStyle = `rgba(70,200,160,${0.35 * k})`; g.lineWidth = 3; g.stroke();
  g.strokeStyle = `rgba(210,255,235,${0.9 * k})`; g.lineWidth = 1; g.stroke();
  glow(g, f.x2, f.y2, 9, 0.7 * k, glowR); glow(g, sx, sy, 5, 0.5 * k, glowR);
}
export function render(now) {
  const t = now / 1000, ct = clock(), g = ctx, z = cam.z, { dpr, cw, ch } = view, rm = reducedMotion();
  // stato della tela da capo: un fotogramma interrotto da un errore non deve lasciare trasparenze o fusioni
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.fillStyle = '#0c0e0d'; g.fillRect(0, 0, cv.width, cv.height);
  if (!S || !terrC) return;
  const sh = rm ? 0 : fxs.shake, ox = sh ? (Math.random() - 0.5) * 2 * sh : 0, oy = sh ? (Math.random() - 0.5) * 2 * sh : 0;
  TF[0] = dpr * z; TF[1] = (-cam.x * z + ox) * dpr; TF[2] = (-cam.y * z + oy) * dpr; home(g);
  const vw = cw / z, vh = ch / z;
  const x0 = Math.max(0, cam.x), y0 = Math.max(0, cam.y), x1 = Math.min(MW * TILE, cam.x + vw), y1 = Math.min(MH * TILE, cam.y + vh);
  g.imageSmoothingEnabled = z < 1;
  if (x1 > x0 && y1 > y0) {
    g.drawImage(terrC, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
    if (trackC && fxq.q.tracks) { g.imageSmoothingEnabled = true; g.drawImage(trackC, x0 * TK, y0 * TK, (x1 - x0) * TK, (y1 - y0) * TK, x0, y0, x1 - x0, y1 - y0); }
  }
  const inView = (x, y, m) => x > cam.x - m && x < cam.x + vw + m && y > cam.y - m && y < cam.y + vh + m;
  for (const d of deposits) {
    const i = d.x + d.y * MW; if (occ[i]) continue;
    const cx = (d.x + 0.5) * TILE, cy = (d.y + 0.5) * TILE; if (!inView(cx, cy, 30)) continue;
    g.fillStyle = 'rgba(16,13,10,0.92)'; g.beginPath(); g.ellipse(cx, cy, 12, 9.5, 0.4, 0, 7); g.fill();
    g.fillStyle = 'rgba(120,95,150,0.22)'; g.beginPath(); g.ellipse(cx - 3, cy - 2, 5, 2.5, 0.4, 0, 7); g.fill();
    const b = (t * 0.7 + d.x * 0.37) % 1; g.strokeStyle = `rgba(200,190,160,${0.4 * (1 - b)})`; g.lineWidth = 1; g.beginPath(); g.arc(cx + 3, cy + 1, 1 + b * 4, 0, 7); g.stroke();
  }
  burnList.length = 0;
  for (const w of fxs.wrecks) if (inView(w.x, w.y, 20)) drawWreck(g, w);
  for (const e of S.ents) {
    if (e.kind !== 'struct' || e.dead || !(e.owner === P || e.seen) || !inView(e.x, e.y, 110)) continue;
    const st = fxs.settle.get(e.id), a = st ? ct - st.t0 : 9;
    if (a < 0.45) {
      // edificio che si posa: scende dall'alto e si assesta
      const k = Math.max(0, a / 0.45), off = rm ? 0 : -16 * (1 - k) * (1 - k), sc = rm ? 1 : 1 + 0.12 * (1 - k);
      if (a >= 0.3 && !st.dust) { st.dust = true; if (e.owner === P || canSee(P, e)) dust(e.x, e.y, e.w * TILE * 0.45, rm ? 2 : 7); }
      g.save(); g.globalAlpha = 0.35 + 0.65 * k; g.translate(e.x, e.y + off); g.scale(sc, sc); g.translate(-e.x, -e.y);
      drawStruct(g, e, t); g.restore(); g.globalAlpha = 1;
    } else drawStruct(g, e, t);
    if (e.hp < e.max * 0.25 && e.built >= 1 && (e.owner === P || canSee(P, e))) burnList.push(e);
  }
  for (const id of ui.sel) {
    const s = ent(id);
    if (s && s.kind === 'struct' && s.owner === P && s.rally) {
      g.setLineDash([5, 5]); g.strokeStyle = 'rgba(240,194,122,0.7)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(s.rally[0], s.rally[1]); g.stroke(); g.setLineDash([]);
      g.fillStyle = '#f0c27a'; g.fillRect(s.rally[0], s.rally[1] - 12, 1.5, 12); g.beginPath(); g.moveTo(s.rally[0] + 1.5, s.rally[1] - 12); g.lineTo(s.rally[0] + 9, s.rally[1] - 9); g.lineTo(s.rally[0] + 1.5, s.rally[1] - 6); g.fill();
    } else if (s && s.kind === 'unit' && !s.dead && inView(s.x, s.y, 30) && canSee(P, s)) {
      // anello di selezione che pulsa sotto il mezzo
      const pu = rm ? 0 : Math.sin(t * 5 + s.id), r = s.rad + 5 + pu * 1.5;
      g.strokeStyle = s.owner === P ? '#f2e6c9' : '#e79a8f'; g.globalAlpha = 0.45 + 0.25 * pu; g.lineWidth = 1.5;
      g.beginPath(); g.ellipse(s.x, s.y + 1, r, r * 0.82, 0, 0, 7); g.stroke(); g.globalAlpha = 1;
    }
  }
  // mezzi: trasformazione calcolata a mano (niente save/restore per mezzo), sagome già pronte se attive
  const kq = Math.ceil(dpr * z * 4) / 4;
  g.imageSmoothingEnabled = true;
  for (const e of S.ents) {
    if (e.kind !== 'unit' || e.dead || !inView(e.x, e.y, 30) || !canSee(P, e)) continue;
    drawUnit(g, e, t, ct, kq);
    if (e.hp < e.max * 0.25) burnList.push(e);
  }
  home(g);
  for (const p of proj) {
    if (!inView(p.x, p.y - (p.h || 0), 40)) continue;
    if (p.k === 'mortar') {
      if (!vis[ftile(p.x) + ftile(p.y) * MW] && p.owner !== P) continue;
      if (p.wk === 'HW') {
        // granata dell'obice: parabola alta, ombra che si allarga mentre sale, scia di fumo chiaro
        const hk = Math.min(1, p.h / 110);
        g.fillStyle = `rgba(0,0,0,${0.4 - 0.22 * hk})`; g.beginPath(); g.arc(p.x, p.y, 2.6 + 3 * hk, 0, 7); g.fill();
        drawTrail(g, p, p.x, p.y - p.h, 'rgba(225,220,200,', 1.6, 18);
        g.fillStyle = '#25241f'; g.beginPath(); g.arc(p.x, p.y - p.h, 3.4, 0, 7); g.fill();
        g.fillStyle = 'rgba(255,240,200,0.35)'; g.beginPath(); g.arc(p.x - 1, p.y - p.h - 1, 1.2, 0, 7); g.fill();
      } else {
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.arc(p.x, p.y, 2.5, 0, 7); g.fill();
        g.fillStyle = '#2a2925'; g.beginPath(); g.arc(p.x, p.y - p.h, 2.6, 0, 7); g.fill();
      }
    } else if (p.k === 'shell') { g.fillStyle = '#fbe3a8'; g.beginPath(); g.arc(p.x, p.y, p.wk === 'CN105' ? 2.9 : p.wk === 'CN75' ? 2.5 : 2, 0, 7); g.fill(); }
    else if (p.k === 'missile') {
      // missile filoguidato: scia sottile e chiara, corpo con alette, fiamma del motore
      drawTrail(g, p, p.x, p.y, 'rgba(235,232,215,', 1, 16);
      at(g, p.x, p.y, p.a);
      g.fillStyle = '#ffb347'; g.beginPath(); g.moveTo(-5, -1); g.lineTo(-9 - Math.random() * 3, 0); g.lineTo(-5, 1); g.closePath(); g.fill();
      g.fillStyle = '#8f8a74'; g.fillRect(-5, -2.4, 2, 4.8);
      g.fillStyle = '#e4e0cc'; g.fillRect(-5, -1.2, 9, 2.4); g.fillStyle = '#b4472c'; g.beginPath(); g.moveTo(4, -1.2); g.lineTo(6.5, 0); g.lineTo(4, 1.2); g.closePath(); g.fill();
      home(g);
    } else {
      const big = p.wk === 'MRL' ? 1.25 : 1;
      at(g, p.x, p.y, p.a, big); g.fillStyle = '#d9d3c0'; g.fillRect(-4, -1, 7, 2); g.fillStyle = '#ffb347'; g.fillRect(-6, -1, 2, 2); home(g);
    }
  }
  drawParts(g, inView);
  // luci additive: lampi delle esplosioni, vampe, fuochi
  g.globalCompositeOperation = 'lighter';
  // in bassa qualità: niente alone sulle vampe delle armi leggere né sui mezzi in fiamme
  const full = fxq.q.glow;
  for (const f of fxs.fx) {
    if (f.k === 'light') { if (inView(f.x, f.y, f.s * 1.2)) { const k = f.life / f.max; glow(g, f.x, f.y, f.s * (0.7 + 0.5 * (1 - k)), k); } }
    else if (f.k === 'muzzle' && inView(f.x, f.y, 30)) { const r = drawMuzzle(g, f); if (full || f.st === 'cn' || f.st === 'rk') glow(g, f.x, f.y, r, 0.7 * f.life / f.max); }
    else if (f.k === 'flame' && inView(f.x2, f.y2, 60)) drawFlame(g, f, t);
    else if (f.k === 'repair' && inView(f.x2, f.y2, 40)) drawRepair(g, f);
  }
  for (const b of burnList) if (full || b.kind === 'struct') glow(g, b.x, b.y, b.kind === 'struct' ? 26 : 14, 0.32 + 0.12 * Math.sin(t * 13 + (b.id || b.ph || 0)));
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  for (const f of fxs.fx) {
    const k = f.life / f.max;
    if ((f.k === 'ring' || f.k === 'shock') && !inView(f.x, f.y, 60)) continue;
    if (f.k === 'tracer') { g.strokeStyle = `rgba(255,224,140,${0.9 * k})`; g.lineWidth = 1.2; g.beginPath(); g.moveTo(f.x1, f.y1); g.lineTo(f.x2, f.y2); g.stroke(); }
    else if (f.k === 'ring') { g.strokeStyle = `rgba(255,190,110,${0.8 * k})`; g.lineWidth = 2; g.beginPath(); g.arc(f.x, f.y, f.s * (1.4 - k), 0, 7); g.stroke(); }
    else if (f.k === 'shock') { g.strokeStyle = `rgba(255,248,225,${0.55 * k})`; g.lineWidth = 1 + 2 * k; g.beginPath(); g.arc(f.x, f.y, f.s * (0.3 + 1.9 * (1 - k)), 0, 7); g.stroke(); }
  }
  g.imageSmoothingEnabled = true;
  drawFog(g);
  for (const f of fxs.fx) if (f.k === 'mark') drawMark(g, f, rm);
  selSet.clear(); for (const id of ui.sel) selSet.add(id);
  const batchBars = fxq.level < 2;
  for (const e of S.ents) {
    if (e.dead || !inView(e.x, e.y, e.kind === 'unit' ? 30 : 100)) continue;
    const isSel = selSet.has(e.id);
    if (e.owner !== P && !canSee(P, e)) continue;
    if (!isSel && e.hp >= e.max && (e.kind !== 'struct' || e.built >= 1)) continue;
    if (e.kind === 'unit') {
      const r = e.rad + 4;
      if (isSel) brackets(g, e.x - r, e.y - r, r * 2, r * 2, e.owner === P ? '#f2e6c9' : '#e79a8f');
      if (batchBars) barLater(e.x - 11, e.y - r - 6, 22, e.hp / e.max); else bar(g, e.x - 11, e.y - r - 6, 22, e.hp / e.max);
    } else {
      const xs = e.tx * TILE, ys = e.ty * TILE, w = e.w * TILE, h = e.h * TILE;
      if (isSel) brackets(g, xs + 1, ys + 1, w - 2, h - 2, e.owner === P ? '#f2e6c9' : '#e79a8f');
      bar(g, xs + 6, ys - 6, w - 12, e.hp / e.max);
      if (e.built < 1) { g.fillStyle = 'rgba(0,0,0,0.65)'; g.fillRect(xs + 6, ys + h + 2, w - 12, 4); g.fillStyle = '#f0c27a'; g.fillRect(xs + 6, ys + h + 2, (w - 12) * e.built, 3); }
    }
  }
  if (batchBars) { fillRects(g, 'rgba(0,0,0,0.65)', barBg); for (const [c, a] of barCol) fillRects(g, c, a); }
  if (ui.placing && hover.in) {
    const D = STRUCTS[ui.placing], w = screenToWorld(hover.x, hover.y);
    const tx = Math.floor(w.x / TILE - D.w / 2 + 0.5), ty = Math.floor(w.y / TILE - D.h / 2 + 0.5);
    const ok = canPlace(P, ui.placing, tx, ty) && S.res[P] >= D.cost;
    g.fillStyle = ok ? 'rgba(147,200,110,0.32)' : 'rgba(210,80,60,0.35)'; g.fillRect(tx * TILE, ty * TILE, D.w * TILE, D.h * TILE);
    g.strokeStyle = ok ? '#b8dc8c' : '#e07a66'; g.lineWidth = 1.5; g.strokeRect(tx * TILE + 0.5, ty * TILE + 0.5, D.w * TILE - 1, D.h * TILE - 1);
    if (ui.placing === 'pump') for (const d of deposits) if (!occ[d.x + d.y * MW] && explored[d.x + d.y * MW]) { g.strokeStyle = 'rgba(240,194,122,0.7)'; g.setLineDash([3, 3]); g.strokeRect(d.x * TILE + 2, d.y * TILE + 2, TILE - 4, TILE - 4); g.setLineDash([]); }
  }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const b = fxs.boxSel;
  if (b) { const x = Math.min(b.sx, b.x), y = Math.min(b.sy, b.y), w = Math.abs(b.x - b.sx), h = Math.abs(b.y - b.sy); g.fillStyle = 'rgba(240,194,122,0.08)'; g.fillRect(x, y, w, h); g.strokeStyle = '#f0c27a'; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, w, h); }
  g.font = '600 12px "IBM Plex Sans Condensed", sans-serif';
  if (ui.amove) { g.fillStyle = 'rgba(17,20,18,0.85)'; g.fillRect(8, 8, 206, 24); g.fillStyle = '#e79a8f'; g.fillText('Attacca-muovi: scegli la destinazione', 16, 24); }
  else if (ui.placing) { g.fillStyle = 'rgba(17,20,18,0.85)'; g.fillRect(8, 8, 246, 24); g.fillStyle = '#f0c27a'; g.fillText(`${STRUCTS[ui.placing].name}: scegli il punto (Esc annulla)`, 16, 24); }
}
// Nebbia: solo il rettangolo di caselle coperte vicino alla visuale (più una casella di margine, così la sfumatura
// resta identica); se tutta la visuale è in vista non si disegna niente.
function drawFog(g) {
  const d = fogImg.data, vw = view.cw / cam.z, vh = view.ch / cam.z;
  const tx0 = Math.max(0, Math.floor(cam.x / TILE) - 2), ty0 = Math.max(0, Math.floor(cam.y / TILE) - 2);
  const tx1 = Math.min(MW - 1, Math.floor((cam.x + vw) / TILE) + 2), ty1 = Math.min(MH - 1, Math.floor((cam.y + vh) / TILE) + 2);
  let bx0 = MW, by0 = MH, bx1 = -1, by1 = -1;
  for (let y = ty0; y <= ty1; y++) for (let x = tx0, i = (y * MW + tx0) * 4 + 3; x <= tx1; x++, i += 4) {
    if (!d[i]) continue;
    if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
  }
  if (bx1 < 0) return;
  bx0 = Math.max(0, bx0 - 1); by0 = Math.max(0, by0 - 1); bx1 = Math.min(MW - 1, bx1 + 1); by1 = Math.min(MH - 1, by1 + 1);
  const w = bx1 - bx0 + 1, h = by1 - by0 + 1;
  g.drawImage(fogC, bx0, by0, w, h, bx0 * TILE, by0 * TILE, w * TILE, h * TILE);
}
export function renderMini() {
  if (!S || !mmBase) return;
  const g = mctx, W = mini.width, H = mini.height, sx = W / MW, sy = H / MH;
  g.imageSmoothingEnabled = false; g.drawImage(mmBase, 0, 0, W, H);
  g.imageSmoothingEnabled = true; g.drawImage(fogC, 0, 0, W, H);
  for (const e of S.ents) {
    if (e.dead) continue;
    if (e.kind === 'struct') { if (e.owner !== P && !e.seen) continue; g.fillStyle = PAL[e.owner].dot; g.fillRect(e.tx * sx, e.ty * sy, Math.max(2, e.w * sx), Math.max(2, e.h * sy)); }
    else { if (!canSee(P, e)) continue; g.fillStyle = e.owner === P ? '#f6dca8' : '#ff6f5f'; g.fillRect(e.x / TILE * sx - 1.5, e.y / TILE * sy - 1.5, 3, 3); }
  }
  g.strokeStyle = 'rgba(235,228,200,0.18)'; g.lineWidth = 1;
  for (let i = 1; i < 8; i++) { g.beginPath(); g.moveTo(i * W / 8, 0); g.lineTo(i * W / 8, H); g.moveTo(0, i * H / 8); g.lineTo(W, i * H / 8); g.stroke(); }
  // un segnale vale 4 s; età negativa o non numerica (segnale rimasto da un'altra partita) → scartato
  const pingOk = p => { const a = S.time - p.t; return Number.isFinite(a) && a >= 0 && a < 4 && Number.isFinite(p.x) && Number.isFinite(p.y); };
  fxs.pings = fxs.pings.filter(pingOk);
  for (const p of fxs.pings) { const k = ((S.time - p.t) * 1.5) % 1; g.strokeStyle = `rgba(224,86,74,${1 - k})`; g.lineWidth = 2; g.beginPath(); g.arc(p.x / TILE * sx, p.y / TILE * sy, 4 + k * 12, 0, 7); g.stroke(); }
  g.strokeStyle = '#f2e6c9'; g.lineWidth = 1.5;
  g.strokeRect(cam.x / TILE * sx, cam.y / TILE * sy, view.cw / cam.z / TILE * sx, view.ch / cam.z / TILE * sy);
}
