// Disegno: terreno, edifici, mezzi, effetti, nebbia, minimappa. Legge lo stato del motore senza modificarlo.
import {
  TILE, MW, MH, N, P, GROUND, DIRT, WATER, ROCK, FOREST, CHASSIS, STRUCTS,
  S, terr, deposits, occ, vis, explored, proj, ent, canSee, canPlace, mulberry32, clamp, ftile,
} from '../engine/index.js';
import { ui, cam, view, hover, fxs, PAL } from './state.js';

let cv, ctx, mini, mctx, terrC = null, terrG = null, mmBase = null;
const fogC = document.createElement('canvas'); fogC.width = MW; fogC.height = MH;
const fogG = fogC.getContext('2d'); const fogImg = fogG.createImageData(MW, MH);

export function initRender(canvas, miniCanvas) { cv = canvas; ctx = cv.getContext('2d'); mini = miniCanvas; mctx = mini.getContext('2d'); }

/* ---------- camera ---------- */
export function resize() {
  view.dpr = Math.min(2, window.devicePixelRatio || 1);
  const r = cv.getBoundingClientRect(); view.cw = Math.max(1, r.width); view.ch = Math.max(1, r.height);
  cv.width = Math.round(view.cw * view.dpr); cv.height = Math.round(view.ch * view.dpr);
  const m = mini.getBoundingClientRect(); mini.width = Math.round(Math.max(1, m.width) * view.dpr); mini.height = Math.round(Math.max(1, m.height) * view.dpr);
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
  terrC = c; terrG = g;
  mmBase = document.createElement('canvas'); mmBase.width = MW; mmBase.height = MH;
  const mg = mmBase.getContext('2d'), img = mg.createImageData(MW, MH);
  const mc = { [GROUND]: [86, 98, 62], [DIRT]: [117, 101, 72], [WATER]: [48, 78, 88], [ROCK]: [112, 108, 98], [FOREST]: [52, 68, 38] };
  for (let i = 0; i < N; i++) { const c3 = mc[terr[i]]; img.data[i * 4] = c3[0]; img.data[i * 4 + 1] = c3[1]; img.data[i * 4 + 2] = c3[2]; img.data[i * 4 + 3] = 255; }
  for (const d of deposits) { const i = d.x + d.y * MW; img.data[i * 4] = 20; img.data[i * 4 + 1] = 18; img.data[i * 4 + 2] = 14; }
  mg.putImageData(img, 0, 0);
}
function scorch(x, y, r) {
  if (!terrG) return;
  const gr = terrG.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, 'rgba(14,11,8,0.55)'); gr.addColorStop(1, 'rgba(14,11,8,0)');
  terrG.fillStyle = gr; terrG.beginPath(); terrG.arc(x, y, r, 0, 7); terrG.fill();
}
export function updateFogImage() {
  const d = fogImg.data;
  for (let i = 0; i < N; i++) { d[i * 4] = 12; d[i * 4 + 1] = 14; d[i * 4 + 2] = 13; d[i * 4 + 3] = vis[i] ? 0 : explored[i] ? 125 : 255; }
  fogG.putImageData(fogImg, 0, 0);
}

/* ---------- effetti visivi (dagli eventi "fx" del motore) ---------- */
function boom(x, y, size) {
  const { parts, fx } = fxs;
  fx.push({ k: 'ring', x, y, life: 0.35, max: 0.35, s: 14 * size });
  const n = Math.round(8 * size);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 7, v = 20 + Math.random() * 70 * size;
    parts.push({ k: 'fire', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.35 + Math.random() * 0.3, max: 0.65, s: 2 + Math.random() * 3 * size });
    parts.push({ k: 'smoke', x: x + (Math.random() - 0.5) * 10 * size, y: y + (Math.random() - 0.5) * 10 * size, vx: (Math.random() - 0.5) * 14, vy: -6 - Math.random() * 10, life: 1.2 + Math.random() * 1.2, max: 2.4, s: 4 + Math.random() * 4 * size });
  }
  for (let i = 0; i < n / 2; i++) { const a = Math.random() * 7, v = 60 + Math.random() * 90; parts.push({ k: 'debris', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5, max: 0.5, s: 1.5 }); }
}
export function spawnFx(e) {
  const { parts, fx } = fxs;
  switch (e.k) {
    case 'boom': boom(e.x, e.y, e.size); break;
    case 'scorch': scorch(e.x, e.y, e.r); break;
    case 'flash': fx.push({ k: 'flash', x: e.x, y: e.y, life: 0.06, max: 0.06, s: e.s }); break;
    case 'tracer': fx.push({ k: 'tracer', x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, life: 0.07, max: 0.07 }); break;
    case 'hit':
      fx.push({ k: 'ring', x: e.x, y: e.y, life: 0.2, max: 0.2, s: 8 });
      for (let i = 0; i < 4; i++) parts.push({ k: 'fire', x: e.x, y: e.y, vx: (Math.random() - 0.5) * 80, vy: (Math.random() - 0.5) * 80, life: 0.25, max: 0.25, s: 2 });
      break;
    case 'trail': if (Math.random() < 0.8) parts.push({ k: 'smoke', x: e.x, y: e.y, vx: 0, vy: -4, life: 0.6, max: 0.6, s: 2.2 }); break;
    case 'spark': parts.push({ k: 'spark', x: e.x, y: e.y, vx: (Math.random() - 0.5) * 60, vy: -Math.random() * 50, life: 0.35, max: 0.35, s: 1.5 }); break;
    case 'spray': parts.push({ k: 'spray', x: e.x, y: e.y, vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10, life: 0.6, max: 0.6, s: 3 }); break;
    case 'chimney': parts.push({ k: 'smoke', x: e.x, y: e.y, vx: 6 + Math.random() * 6, vy: -4 - Math.random() * 6, life: 2.4, max: 2.4, s: 4 }); break;
  }
}
export function mark(x, y, c) { fxs.fx.push({ k: 'mark', x, y, life: 0.5, max: 0.5, c }); }
export function updParts(dt) {
  for (const p of fxs.parts) {
    p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.k === 'fire' || p.k === 'debris' || p.k === 'spark') { p.vx *= 0.92; p.vy *= 0.92; }
  }
  fxs.parts = fxs.parts.filter(p => p.life > 0);
  if (fxs.parts.length > 900) fxs.parts.splice(0, fxs.parts.length - 900);
  for (const f of fxs.fx) f.life -= dt;
  fxs.fx = fxs.fx.filter(f => f.life > 0);
}

/* ---------- sagome ---------- */
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function drawWeapon(g, wk, col, s) {
  const dk = '#2a2925';
  if (wk === 'MG') {
    g.fillStyle = dk; g.fillRect(2 * s, -2.2 * s, 9 * s, 1.5 * s); g.fillRect(2 * s, 0.7 * s, 9 * s, 1.5 * s);
    g.fillStyle = col.body; g.beginPath(); g.arc(0, 0, 4 * s, 0, 7); g.fill(); g.strokeStyle = col.dark; g.lineWidth = 1; g.stroke();
  } else if (wk === 'CN') {
    g.fillStyle = dk; g.fillRect(3 * s, -1.4 * s, 12 * s, 2.8 * s); g.fillRect(14 * s, -2 * s, 2.5 * s, 4 * s);
    g.fillStyle = col.body; rr(g, -5 * s, -4.5 * s, 10 * s, 9 * s, 2); g.fill(); g.strokeStyle = col.dark; g.lineWidth = 1; g.stroke();
  } else if (wk === 'RK') {
    g.fillStyle = '#4b4a40'; rr(g, -4 * s, -5 * s, 11 * s, 10 * s, 1.5); g.fill(); g.strokeStyle = col.dark; g.lineWidth = 1; g.stroke();
    g.fillStyle = dk; for (const yy of [-2.6, 0, 2.6]) { g.beginPath(); g.arc(5 * s, yy * s, 1.1 * s, 0, 7); g.fill(); }
    g.fillStyle = col.body; g.fillRect(-4 * s, -5 * s, 3 * s, 10 * s);
  } else if (wk === 'MO') {
    g.fillStyle = col.body; g.beginPath(); g.arc(0, 0, 5 * s, 0, 7); g.fill(); g.strokeStyle = col.dark; g.lineWidth = 1; g.stroke();
    g.fillStyle = dk; g.fillRect(-1 * s, -2.6 * s, 10 * s, 5.2 * s); g.fillStyle = '#121210'; g.beginPath(); g.arc(9 * s, 0, 2 * s, 0, 7); g.fill();
  }
  g.fillStyle = col.light; g.beginPath(); g.arc(-1 * s, -1 * s, 1.1 * s, 0, 7); g.fill();
}
export function drawVehicle(g, d, col, ang, tang, moving, t) {
  const C = CHASSIS[d.c], L = C.size[0], W = C.size[1], tr = '#26271f';
  g.save(); g.rotate(ang);
  g.fillStyle = 'rgba(0,0,0,0.3)'; rr(g, -L / 2 + 2, -W / 2 + 3, L + 1, W + 1, 3); g.fill();
  if (d.p === 'W') {
    g.fillStyle = tr; const xs = L > 16 ? [-L / 2 + 1, -2.5, L / 2 - 6] : [-L / 2 + 1, L / 2 - 6];
    for (const sx of xs) { g.fillRect(sx, -W / 2 - 2, 5, 3); g.fillRect(sx, W / 2 - 1, 5, 3); }
  } else if (d.p === 'HT') {
    g.fillStyle = tr; g.fillRect(L / 2 - 6, -W / 2 - 2, 5, 3); g.fillRect(L / 2 - 6, W / 2 - 1, 5, 3);
    g.fillRect(-L / 2 - 0.5, -W / 2 - 2.5, L * 0.6, 3.5); g.fillRect(-L / 2 - 0.5, W / 2 - 1, L * 0.6, 3.5);
  } else if (d.p === 'T') {
    g.fillStyle = tr; g.fillRect(-L / 2 - 1, -W / 2 - 3, L + 2, 4); g.fillRect(-L / 2 - 1, W / 2 - 1, L + 2, 4);
    g.strokeStyle = '#45463b'; g.lineWidth = 1; const off = moving ? (t * 24) % 3 : 0; g.beginPath();
    for (let x = -L / 2 + off; x < L / 2; x += 3) { g.moveTo(x, -W / 2 - 3); g.lineTo(x, -W / 2 + 1); g.moveTo(x, W / 2 - 1); g.lineTo(x, W / 2 + 3); }
    g.stroke();
  } else if (d.p === 'V') {
    g.fillStyle = '#2d302b'; g.beginPath(); g.ellipse(0, 0, L / 2 + 3, W / 2 + 3, 0, 0, 7); g.fill();
    g.strokeStyle = 'rgba(210,220,205,0.3)'; g.lineWidth = 1; g.stroke();
    g.fillStyle = '#3a3d36'; g.fillRect(-L / 2 - 2, -3, 3, 6);
  }
  g.fillStyle = col.body; rr(g, -L / 2, -W / 2, L, W, 2.5); g.fill(); g.strokeStyle = col.dark; g.lineWidth = 1; g.stroke();
  g.fillStyle = col.dark; g.globalAlpha = 0.5; g.fillRect(-L / 2 + 1.5, -W / 2 + 2, 3, W - 4);
  g.fillStyle = col.light; g.globalAlpha = 0.4; g.fillRect(L / 2 - 4, -W / 2 + 1.5, 2.5, W - 3); g.globalAlpha = 1;
  g.restore();
  g.save(); g.rotate(tang); drawWeapon(g, d.w, col, d.c === 'H' ? 1.25 : d.c === 'M' ? 1.1 : 1); g.restore();
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
      g.save(); g.translate(cx, cy); g.rotate(s.tang); drawWeapon(g, S.tech[s.owner].twCN ? 'CN' : 'MG', col, 1.15); g.restore();
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
    return;
  }
  drawStructBody(g, s, x0, y0, w, h, col, t, true);
}
function drawUnit(g, u, t) {
  g.save(); g.translate(u.x, u.y);
  if (u.builder) drawTruck(g, PAL[u.owner], u.ang, u.working, t);
  else drawVehicle(g, u.d, PAL[u.owner], u.ang, u.tang, u.moving, t);
  g.restore();
}
export function hpColor(f) { return f > 0.6 ? '#93a85c' : f > 0.3 ? '#e2b84a' : '#d0533f'; }
function bar(g, x, y, w, f) {
  g.fillStyle = 'rgba(0,0,0,0.65)'; g.fillRect(x - 1, y - 1, w + 2, 5);
  g.fillStyle = hpColor(f); g.fillRect(x, y, w * clamp(f, 0, 1), 3);
}
function brackets(g, x, y, w, h, c) {
  const l = Math.min(6, w / 3); g.strokeStyle = c; g.lineWidth = 1.5; g.beginPath();
  g.moveTo(x, y + l); g.lineTo(x, y); g.lineTo(x + l, y); g.moveTo(x + w - l, y); g.lineTo(x + w, y); g.lineTo(x + w, y + l);
  g.moveTo(x + w, y + h - l); g.lineTo(x + w, y + h); g.lineTo(x + w - l, y + h); g.moveTo(x + l, y + h); g.lineTo(x, y + h); g.lineTo(x, y + h - l);
  g.stroke();
}

/* ---------- fotogramma ---------- */
export function render(now) {
  const t = now / 1000, g = ctx, z = cam.z, { dpr, cw, ch } = view;
  g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#0c0e0d'; g.fillRect(0, 0, cv.width, cv.height);
  if (!S || !terrC) return;
  g.setTransform(dpr * z, 0, 0, dpr * z, -cam.x * dpr * z, -cam.y * dpr * z);
  const vw = cw / z, vh = ch / z;
  const x0 = Math.max(0, cam.x), y0 = Math.max(0, cam.y), x1 = Math.min(MW * TILE, cam.x + vw), y1 = Math.min(MH * TILE, cam.y + vh);
  g.imageSmoothingEnabled = z < 1;
  if (x1 > x0 && y1 > y0) g.drawImage(terrC, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
  const inView = (x, y, m) => x > cam.x - m && x < cam.x + vw + m && y > cam.y - m && y < cam.y + vh + m;
  for (const d of deposits) {
    const i = d.x + d.y * MW; if (occ[i]) continue;
    const cx = (d.x + 0.5) * TILE, cy = (d.y + 0.5) * TILE; if (!inView(cx, cy, 30)) continue;
    g.fillStyle = 'rgba(16,13,10,0.92)'; g.beginPath(); g.ellipse(cx, cy, 12, 9.5, 0.4, 0, 7); g.fill();
    g.fillStyle = 'rgba(120,95,150,0.22)'; g.beginPath(); g.ellipse(cx - 3, cy - 2, 5, 2.5, 0.4, 0, 7); g.fill();
    const b = (t * 0.7 + d.x * 0.37) % 1; g.strokeStyle = `rgba(200,190,160,${0.4 * (1 - b)})`; g.lineWidth = 1; g.beginPath(); g.arc(cx + 3, cy + 1, 1 + b * 4, 0, 7); g.stroke();
  }
  for (const e of S.ents) if (e.kind === 'struct' && !e.dead && (e.owner === P || e.seen) && inView(e.x, e.y, 110)) drawStruct(g, e, t);
  for (const id of ui.sel) {
    const s = ent(id);
    if (s && s.kind === 'struct' && s.owner === P && s.rally) {
      g.setLineDash([5, 5]); g.strokeStyle = 'rgba(240,194,122,0.7)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(s.rally[0], s.rally[1]); g.stroke(); g.setLineDash([]);
      g.fillStyle = '#f0c27a'; g.fillRect(s.rally[0], s.rally[1] - 12, 1.5, 12); g.beginPath(); g.moveTo(s.rally[0] + 1.5, s.rally[1] - 12); g.lineTo(s.rally[0] + 9, s.rally[1] - 9); g.lineTo(s.rally[0] + 1.5, s.rally[1] - 6); g.fill();
    }
  }
  for (const e of S.ents) if (e.kind === 'unit' && !e.dead && inView(e.x, e.y, 30) && canSee(P, e)) drawUnit(g, e, t);
  for (const p of proj) {
    if (!inView(p.x, p.y, 40)) continue;
    if (p.k === 'mortar') {
      if (!vis[ftile(p.x) + ftile(p.y) * MW] && p.owner !== P) continue;
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.arc(p.x, p.y, 2.5, 0, 7); g.fill();
      g.fillStyle = '#2a2925'; g.beginPath(); g.arc(p.x, p.y - p.h, 2.6, 0, 7); g.fill();
    } else if (p.k === 'shell') { g.fillStyle = '#fbe3a8'; g.beginPath(); g.arc(p.x, p.y, 2, 0, 7); g.fill(); }
    else { g.save(); g.translate(p.x, p.y); g.rotate(p.a); g.fillStyle = '#d9d3c0'; g.fillRect(-4, -1, 7, 2); g.fillStyle = '#ffb347'; g.fillRect(-6, -1, 2, 2); g.restore(); }
  }
  for (const p of fxs.parts) {
    if (!inView(p.x, p.y, 20)) continue;
    const k = p.life / p.max;
    if (p.k === 'smoke') { g.fillStyle = `rgba(70,68,60,${0.42 * k})`; g.beginPath(); g.arc(p.x, p.y, p.s * (2 - k), 0, 7); g.fill(); }
    else if (p.k === 'fire') { g.fillStyle = `rgba(255,${140 + 90 * k | 0},60,${k})`; g.beginPath(); g.arc(p.x, p.y, p.s * k + 0.5, 0, 7); g.fill(); }
    else if (p.k === 'spark') { g.fillStyle = `rgba(255,230,150,${k})`; g.fillRect(p.x, p.y, p.s, p.s); }
    else if (p.k === 'debris') { g.fillStyle = `rgba(40,38,32,${k})`; g.fillRect(p.x, p.y, 2, 2); }
    else if (p.k === 'spray') { g.fillStyle = `rgba(200,225,230,${0.5 * k})`; g.beginPath(); g.arc(p.x, p.y, p.s * (1.6 - k), 0, 7); g.fill(); }
  }
  for (const f of fxs.fx) {
    const k = f.life / f.max;
    if (f.k === 'tracer') { g.strokeStyle = `rgba(255,224,140,${0.9 * k})`; g.lineWidth = 1.2; g.beginPath(); g.moveTo(f.x1, f.y1); g.lineTo(f.x2, f.y2); g.stroke(); }
    else if (f.k === 'flash') { g.fillStyle = `rgba(255,220,130,${k})`; g.beginPath(); g.arc(f.x, f.y, f.s, 0, 7); g.fill(); }
    else if (f.k === 'ring') { g.strokeStyle = `rgba(255,190,110,${0.8 * k})`; g.lineWidth = 2; g.beginPath(); g.arc(f.x, f.y, f.s * (1.4 - k), 0, 7); g.stroke(); }
    else if (f.k === 'mark') { g.strokeStyle = f.c; g.globalAlpha = k; g.lineWidth = 1.5; g.beginPath(); g.arc(f.x, f.y, 4 + 8 * k, 0, 7); g.stroke(); g.globalAlpha = 1; }
  }
  g.imageSmoothingEnabled = true;
  g.drawImage(fogC, 0, 0, MW * TILE, MH * TILE);
  const selSet = new Set(ui.sel);
  for (const e of S.ents) {
    if (e.dead || !inView(e.x, e.y, 100)) continue;
    const isSel = selSet.has(e.id);
    if (e.owner !== P && !canSee(P, e)) continue;
    if (!isSel && e.hp >= e.max && (e.kind !== 'struct' || e.built >= 1)) continue;
    if (e.kind === 'unit') {
      const r = e.rad + 4;
      if (isSel) brackets(g, e.x - r, e.y - r, r * 2, r * 2, e.owner === P ? '#f2e6c9' : '#e79a8f');
      bar(g, e.x - 11, e.y - r - 6, 22, e.hp / e.max);
    } else {
      const xs = e.tx * TILE, ys = e.ty * TILE, w = e.w * TILE, h = e.h * TILE;
      if (isSel) brackets(g, xs + 1, ys + 1, w - 2, h - 2, e.owner === P ? '#f2e6c9' : '#e79a8f');
      bar(g, xs + 6, ys - 6, w - 12, e.hp / e.max);
      if (e.built < 1) { g.fillStyle = 'rgba(0,0,0,0.65)'; g.fillRect(xs + 6, ys + h + 2, w - 12, 4); g.fillStyle = '#f0c27a'; g.fillRect(xs + 6, ys + h + 2, (w - 12) * e.built, 3); }
    }
  }
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
  for (const p of fxs.pings) { const a = S.time - p.t; if (a > 4) continue; const k = (a * 1.5) % 1; g.strokeStyle = `rgba(224,86,74,${1 - k})`; g.lineWidth = 2; g.beginPath(); g.arc(p.x / TILE * sx, p.y / TILE * sy, 4 + k * 12, 0, 7); g.stroke(); }
  fxs.pings = fxs.pings.filter(p => S.time - p.t < 4);
  g.strokeStyle = '#f2e6c9'; g.lineWidth = 1.5;
  g.strokeRect(cam.x / TILE * sx, cam.y / TILE * sy, view.cw / cam.z / TILE * sx, view.ch / cam.z / TILE * sy);
}
