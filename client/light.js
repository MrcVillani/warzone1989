// Luce: aloni già pronti (fuoco, lampo bianco, vampa sul terreno, saldatura, lampade, fari) per le luci additive, e la
// tela della luce delle missioni notturne. Di notte il mondo si moltiplica per una tela a 1/4 di risoluzione: luce
// della luna più fari dei mezzi, lampade e finestre degli edifici, incendi, esplosioni, vampe e colpi in volo.
// Di giorno le esplosioni e gli incendi illuminano il terreno attorno con gli stessi aloni in modalità additiva.
import { TILE, P } from '../engine/index.js';
import { NIGHT } from './look.js';
import { WINDOWS } from './structs.js';
import { unitDims } from './dims.js';
import { neonRGB } from './livery.js';

export function makeGlow(stops, size = 64) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr; g.fillRect(0, 0, size, size); return c;
}
export const GLOW = makeGlow([[0, 'rgba(255,240,200,1)'], [0.22, 'rgba(255,190,100,0.8)'], [0.55, 'rgba(235,120,45,0.28)'], [1, 'rgba(200,80,30,0)']]);
export const GLOW_R = makeGlow([[0, 'rgba(225,255,240,1)'], [0.25, 'rgba(120,235,195,0.75)'], [0.6, 'rgba(60,170,170,0.22)'], [1, 'rgba(40,120,140,0)']]);
export const GLOW_W = makeGlow([[0, 'rgba(255,255,250,1)'], [0.3, 'rgba(255,245,215,0.75)'], [0.7, 'rgba(255,220,160,0.18)'], [1, 'rgba(255,200,140,0)']]);
export const GLOW_G = makeGlow([[0, 'rgba(255,222,160,0.6)'], [0.35, 'rgba(255,180,95,0.3)'], [0.7, 'rgba(240,140,60,0.08)'], [1, 'rgba(220,110,40,0)']]);
// palla di fuoco: cuore chiaro e bordo arancio, poi brace che si spegne nel fumo
export const FB = makeGlow([[0, 'rgba(255,250,225,1)'], [0.35, 'rgba(255,206,110,0.95)'], [0.7, 'rgba(236,120,44,0.85)'], [1, 'rgba(180,70,30,0)']]);
export const FB2 = makeGlow([[0, 'rgba(200,80,32,0.9)'], [0.6, 'rgba(110,60,40,0.6)'], [1, 'rgba(60,48,40,0)']]);
export const LAMP = makeGlow([[0, 'rgba(255,226,170,1)'], [0.35, 'rgba(255,200,130,0.55)'], [1, 'rgba(255,170,90,0)']]);
export const RED = makeGlow([[0, 'rgba(255,90,60,1)'], [1, 'rgba(255,40,20,0)']]);
const COLD = makeGlow([[0, 'rgba(210,225,255,1)'], [0.4, 'rgba(170,190,240,0.4)'], [1, 'rgba(140,160,220,0)']]);
// cono dei fari, rivolto verso +x
const CONE = (() => {
  const c = document.createElement('canvas'); c.width = 128; c.height = 96; const g = c.getContext('2d');
  const gr = g.createRadialGradient(4, 48, 2, 4, 48, 124); gr.addColorStop(0, 'rgba(255,244,214,0.95)'); gr.addColorStop(0.5, 'rgba(255,236,200,0.4)'); gr.addColorStop(1, 'rgba(255,230,190,0)');
  g.fillStyle = gr; g.beginPath(); g.moveTo(4, 44); g.lineTo(128, 6); g.lineTo(128, 90); g.lineTo(4, 52); g.closePath(); g.fill(); return c;
})();
// luce del neon sotto la scocca degli assi, del colore del lato (0 Brigata, 1 Direttorio)
const NEON_LIGHT = [P, 1 - P].map(o => { const [r, g, b] = neonRGB(o); return makeGlow([[0, `rgba(${r},${g},${b},1)`], [0.45, `rgba(${r},${g},${b},0.5)`], [1, `rgba(${r},${g},${b},0)`]]); });
export const glow = (g, x, y, r, a, img = GLOW) => { if (a <= 0.01) return; g.globalAlpha = a > 1 ? 1 : a; g.drawImage(img, x - r, y - r, r * 2, r * 2); };

// Tela della luce della notte. sc: { units: [{ u, x, y, a }], structs, fx, wrecks, ruins, parts, proj, t, vr, tf,
// neon (neon degli assi acceso), lights ([x, y, raggio, intensità] in più: effetti della Macchina di Villo), flash
// (0–1: lampo del colpo grosso, rischiara tutta la scena) }.
let lb = null, lg = null;
export function nightLight(g, cv, sc) {
  const lw = Math.ceil(cv.width / 4), lh = Math.ceil(cv.height / 4), { vr, tf, t } = sc;
  if (!lb) { lb = document.createElement('canvas'); lg = lb.getContext('2d'); }
  if (lb.width !== lw || lb.height !== lh) { lb.width = lw; lb.height = lh; }
  const q = lg; q.setTransform(1, 0, 0, 1, 0, 0); q.globalCompositeOperation = 'source-over'; q.globalAlpha = 1;
  const gr = q.createLinearGradient(0, 0, lw, lh * 0.4), A = NIGHT.amb, B = NIGHT.amb2;
  gr.addColorStop(0, `rgb(${A})`); gr.addColorStop(1, `rgb(${A.map((v, i) => Math.round(v * 0.72 + B[i] * 0.28))})`);
  q.fillStyle = gr; q.fillRect(0, 0, lw, lh);
  q.setTransform(tf[0] / 4, 0, 0, tf[0] / 4, tf[1] / 4, tf[2] / 4); q.globalCompositeOperation = 'lighter';
  const L = (img, x, y, r, a) => { if (x > vr.x0 - r && x < vr.x1 + r && y > vr.y0 - r && y < vr.y1 + r) glow(q, x, y, r, a, img); };
  // fari: cono davanti al mezzo (più lungo per i propri) e un alone attorno
  for (const it of sc.units) {
    const u = it.u, own = u.owner === P, len = own ? 96 : 50, hl = unitDims(u).L * 0.45;
    if (sc.neon && u.rank >= 3) L(NEON_LIGHT[own ? 0 : 1], it.x, it.y, 34, 0.9);
    const c = Math.cos(it.a), s = Math.sin(it.a), x = it.x + c * hl, y = it.y + s * hl, k = tf[0] / 4;
    if (x < vr.x0 - len || x > vr.x1 + len || y < vr.y0 - len || y > vr.y1 + len) continue;
    q.setTransform(c * k, s * k, -s * k, c * k, x * k + tf[1] / 4, y * k + tf[2] / 4);
    q.globalAlpha = own ? 0.75 : 0.35; q.drawImage(CONE, 0, -len * 0.375, len, len * 0.75);
    q.setTransform(k, 0, 0, k, tf[1] / 4, tf[2] / 4);
    L(LAMP, it.x, it.y, 20, 0.25);
  }
  for (const s of sc.structs) {
    const x0 = s.tx * TILE, y0 = s.ty * TILE, w = s.w * TILE, h = s.h * TILE;
    if (s.built < 1) { L(LAMP, x0 + w / 2, y0 + h / 2, 40, 0.35); continue; }
    if (s.owner === P) {
      if (s.type === 'pump') L(RED, x0 + 8, y0 + 8, 10, 0.8);
      else if (s.type === 'tower' || s.type === 'bunker') L(COLD, x0 + w / 2, y0 + h / 2, 40, 0.35);
      else { L(LAMP, x0 - 2, y0 + h + 2, 66, 0.85); L(LAMP, x0 + w + 2, y0 - 2, 52, 0.6); for (const [a, b, c2, d] of WINDOWS[s.type] || []) L(LAMP, x0 + a + c2 / 2, y0 + b + d / 2, 18, 0.5); }
    } else L(LAMP, x0 + w / 2, y0 + h + 4, 40, 0.5);
  }
  for (const f of sc.fx) {
    const k = f.life / f.max;
    if (f.k === 'light') L(GLOW, f.x, f.y, f.s * 4, k * 1.2);
    else if (f.k === 'flashW') L(GLOW_W, f.x, f.y, f.s * 6, k);
    else if (f.k === 'glight' || f.k === 'muzzle') L(GLOW, f.x, f.y, (f.s || 14) * 3.2, 0.9 * k);
    else if (f.k === 'fball') L(GLOW, f.x, f.y, f.R * 9, Math.min(1, k * 1.6));
    else if (f.k === 'mush') L(GLOW, f.x, f.y, 60 * f.s, 0.6 * k * k);
    else if (f.k === 'flame') L(GLOW, f.x2, f.y2, f.r * 3, k);
    else if (f.k === 'repair') L(GLOW_R, f.x2, f.y2, 30, k);
  }
  for (const w of sc.wrecks) { const bf = w.life * (w.burn || 0.3); if (w.t < bf) L(GLOW, w.x, w.y, 72 + 10 * Math.sin(t * 11 + w.ph), 0.85 * (1 - w.t / bf) + 0.3); }
  for (const r of sc.ruins) if (r.t < 6) L(GLOW, r.x, r.y, 110, 0.8 * (1 - r.t / 6) + 0.2);
  for (const e of sc.burning) L(GLOW, e.x, e.y, e.kind === 'struct' ? 90 : 46, 0.55 + 0.15 * Math.sin(t * 13 + e.id));
  for (const p of sc.parts) if (p.k === 'fire') L(GLOW, p.x, p.y, 22, 0.25 * p.life / p.max);
  for (const p of sc.proj) L(GLOW, p.x, p.y - (p.h || 0), p.k === 'shell' ? 26 : 34, 0.55);
  if (sc.lights) for (const l of sc.lights) L(GLOW_W, l[0], l[1], l[2], l[3]);
  if (sc.flash > 0.01) { q.setTransform(1, 0, 0, 1, 0, 0); q.globalAlpha = 1; q.fillStyle = `rgba(255,240,214,${Math.min(1, sc.flash * 1.2).toFixed(3)})`; q.fillRect(0, 0, lw, lh); }
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.imageSmoothingEnabled = true;
  g.globalCompositeOperation = 'multiply'; g.drawImage(lb, 0, 0, cv.width, cv.height); g.globalCompositeOperation = 'source-over';
}
