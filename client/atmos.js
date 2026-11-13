// Atmosfera sopra il terreno: acqua animata (increspature che scorrono e riflesso del cielo con le nuvole, dentro la
// maschera dell'acqua), alberi vivi che ondeggiano al vento e si piegano all'onda d'urto, ombre delle nuvole che
// passano, correzione colore. Ogni parte ha il suo interruttore nel livello di qualità; «riduci movimento» ferma
// nuvole e ondeggiamento. La vignettatura è nel foglio di stile (#vignette), sopra la tela. Solo disegno.
import { TILE, MW, MH, WATER, terr, occ, clamp } from '../engine/index.js';
import { makeNoise2, canopy, hasCanopy, CANOPY_K } from './terrain-bake.js';
import { waterMask, mapObjs, bareAt } from './terrain.js';
import { WIND } from './look.js';

const TREE_NEW = 12;

const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
/* ---------- trame ripetibili ---------- */
// Trame di 256×256 che si ripetono senza cuciture (rumore sfumato con le sue copie spostate di un periodo). Si calcolano a righe,
// TEX_ROWS per fotogramma: finché non sono pronte la parte che le usa non si disegna (nessun fotogramma lungo).
const TEX_ROWS = 16;
const tex = new Map();
export function tileTex(key, fn, map) {
  let t = tex.get(key);
  if (!t) { const c = mk(256, 256), g = c.getContext('2d'); t = { c, g, img: g.createImageData(256, 256), y: 0, done: false }; tex.set(key, t); }
  if (t.done) return t.c;
  for (const y1 = Math.min(256, t.y + TEX_ROWS); t.y < y1; t.y++) for (let x = 0; x < 256; x++) {
    const u = x / 256, v = t.y / 256;
    const val = fn(u, v) * (1 - u) * (1 - v) + fn(u - 1, v) * u * (1 - v) + fn(u, v - 1) * (1 - u) * v + fn(u - 1, v - 1) * u * v;
    const [r, gg, b, a] = map(val), i = (x + t.y * 256) * 4; t.img.data[i] = r; t.img.data[i + 1] = gg; t.img.data[i + 2] = b; t.img.data[i + 3] = a;
  }
  if (t.y < 256) return null;
  t.g.putImageData(t.img, 0, 0); t.done = true; t.img = null;
  return t.c;
}
export const nC = makeNoise2(4242), nR = makeNoise2(99);
const cloudTex = () => tileTex('cloud', (u, v) => nC.fbm(u * 3, v * 3, 4), n => [0, 0, 0, clamp((n - 0.5) * 3.2, 0, 1) * 255]);
const skyTex = () => tileTex('sky', (u, v) => nC.fbm(u * 3 + 9, v * 3 + 4, 3), n => [186, 214, 232, clamp((n - 0.42) * 2, 0, 1) * 75]);
const rippleTex = () => tileTex('ripple', (u, v) => Math.sin((v * 34 + nR.fbm(u * 4, v * 4, 3) * 9) * Math.PI), s => [230, 240, 238, s > 0.86 ? (s - 0.86) / 0.14 * 150 : 0]);
// Ripete la trama img (lato S nel mondo, spostata di ox, oy) sul rettangolo del mondo vr.
export function tile(g, img, S, ox, oy, vr) {
  const x0 = Math.floor((vr.x0 - ox) / S) * S + ox, y0 = Math.floor((vr.y0 - oy) / S) * S + oy;
  for (let y = y0; y < vr.y1; y += S) for (let x = x0; x < vr.x1; x += S) g.drawImage(img, x, y, S, S);
}
// Rettangolo del mondo con l'acqua nella visuale (caselle d'acqua più un margine per le rive mosse), o null: la
// passata dell'acqua lavora solo lì.
function waterRect(vr) {
  const tx0 = clamp(Math.floor(vr.x0 / TILE) - 1, 0, MW - 1), ty0 = clamp(Math.floor(vr.y0 / TILE) - 1, 0, MH - 1);
  const tx1 = clamp(Math.floor(vr.x1 / TILE) + 1, 0, MW - 1), ty1 = clamp(Math.floor(vr.y1 / TILE) + 1, 0, MH - 1);
  let x0 = MW, y0 = MH, x1 = -1, y1 = -1;
  for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) if (terr[x + y * MW] === WATER) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  const m = 20;
  return { x0: Math.max(vr.x0, x0 * TILE - m), y0: Math.max(vr.y0, y0 * TILE - m), x1: Math.min(vr.x1, (x1 + 1) * TILE + m), y1: Math.min(vr.y1, (y1 + 1) * TILE + m) };
}

/* ---------- acqua ---------- */
// Su una tela a metà risoluzione dello schermo, solo nel rettangolo con l'acqua: increspature (una o due trame che
// scorrono in versi diversi) e riflesso del cielo, poi solo dentro la maschera dell'acqua; infine sopra il terreno.
// tf: trasformazione del mondo.
let wl = null, wg = null;
export function drawWater(g, cv, tf, vr, t, level) {
  const wr = level ? waterRect(vr) : null; if (!wr) return;
  const mask = waterMask(), R = rippleTex(), sky = skyTex(); if (!mask || !R || !sky) return;
  const sc = 0.5, w = Math.ceil(cv.width * sc), h = Math.ceil(cv.height * sc);
  if (!wl) { wl = mk(w, h); wg = wl.getContext('2d'); }
  if (wl.width !== w || wl.height !== h) { wl.width = w; wl.height = h; }
  // rettangolo in pixel della tela a metà risoluzione
  const px0 = Math.max(0, Math.floor((wr.x0 * tf[0] + tf[1]) * sc)), py0 = Math.max(0, Math.floor((wr.y0 * tf[0] + tf[2]) * sc));
  const px1 = Math.min(w, Math.ceil((wr.x1 * tf[0] + tf[1]) * sc)), py1 = Math.min(h, Math.ceil((wr.y1 * tf[0] + tf[2]) * sc));
  if (px1 <= px0 || py1 <= py0) return;
  const q = wg; q.save(); q.setTransform(1, 0, 0, 1, 0, 0); q.globalCompositeOperation = 'source-over'; q.globalAlpha = 1;
  q.clearRect(px0, py0, px1 - px0, py1 - py0); q.beginPath(); q.rect(px0, py0, px1 - px0, py1 - py0); q.clip();
  q.setTransform(tf[0] * sc, 0, 0, tf[0] * sc, tf[1] * sc, tf[2] * sc);
  q.globalAlpha = 0.5; tile(q, R, 240, (t * 7) % 240, (t * 3) % 240, wr);
  if (level > 1) { q.globalAlpha = 0.3; tile(q, R, 170, (-t * 5) % 170, (t * 6) % 170, wr); }
  q.globalAlpha = 0.9; tile(q, sky, 900, (t * WIND.x * 0.6) % 900, (t * WIND.y * 0.6) % 900, wr);
  q.globalAlpha = 1; q.globalCompositeOperation = 'destination-in'; q.imageSmoothingEnabled = true;
  const mk4 = mask.width / (MW * TILE); q.drawImage(mask, wr.x0 * mk4, wr.y0 * mk4, (wr.x1 - wr.x0) * mk4, (wr.y1 - wr.y0) * mk4, wr.x0, wr.y0, wr.x1 - wr.x0, wr.y1 - wr.y0);
  q.restore();
  const b = g.getTransform(); g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(wl, px0, py0, px1 - px0, py1 - py0, px0 / sc, py0 / sc, (px1 - px0) / sc, (py1 - py0) / sc); g.setTransform(b);
}

/* ---------- nuvole e colore ---------- */
// k: quanto si vedono (1 = cielo sereno; con pioggia e nebbia il cielo è coperto e le ombre delle nuvole svaniscono).
export function drawClouds(g, vr, t, k = 1) {
  const C = cloudTex(); if (!C) return;
  const S = 1500, ox = (t * WIND.x * 0.8) % S, oy = (t * WIND.y * 0.8) % S;
  g.globalAlpha = 0.2 * k; tile(g, C, S, ox, oy, vr); g.globalAlpha = 1;
}
// Correzione colore: luce calda dall'angolo del sole, ombre un po' più fredde (fusione «soft-light»). k: intensità
// (cala con il cielo coperto).
export function grade(g, cv, k = 1) {
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'soft-light'; g.globalAlpha = k;
  const gr = g.createLinearGradient(0, 0, cv.width, cv.height); gr.addColorStop(0, 'rgba(255,214,150,0.32)'); gr.addColorStop(1, 'rgba(70,90,120,0.28)');
  g.fillStyle = gr; g.fillRect(0, 0, cv.width, cv.height); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
}

/* ---------- alberi vivi ---------- */
// Chiome sopra i pezzi di terreno cotti senza chiome: ondeggiano (due onde lente, più il vento) e si piegano lontano
// dalle esplosioni vicine (palle di fuoco e onde d'urto). still: «riduci movimento» (chiome ferme).
export function drawTrees(g, vr, t, fx, still) {
  const ob = mapObjs(); if (!ob) return;
  const booms = still ? [] : fx.filter(f => f.k === 'fball' || f.k === 'shock');
  let made = 0;
  for (const tr of ob.trees) {
    if (tr.cx < vr.x0 - 20 || tr.cx > vr.x1 + 20 || tr.cy < vr.y0 - 20 || tr.cy > vr.y1 + 20 || !bareAt(tr.cx, tr.cy) || occ[Math.floor(tr.cx / TILE) + Math.floor(tr.cy / TILE) * MW]) continue;
    let dx = 0, dy = 0;
    if (!still) {
      dx = Math.sin(t * 1.7 + tr.ph) * 0.6 + Math.sin(t * 0.6 + tr.cx * 0.01) * 0.5 + WIND.x * 0.04; dy = Math.cos(t * 1.3 + tr.ph) * 0.3;
      for (const f of booms) { const ex = tr.cx - f.x, ey = tr.cy - f.y, d = Math.hypot(ex, ey); if (d < 110 && d > 1) { const p = (f.life / f.max) * (1 - d / 110) * 7; dx += ex / d * p; dy += ey / d * p; } }
    }
    // chiome nuove al massimo TREE_NEW per fotogramma (le altre arrivano nei fotogrammi dopo)
    if (!hasCanopy(tr.R, tr.hue, tr.v) && made++ >= TREE_NEW) continue;
    const c = canopy(mk, tr.R, tr.hue, tr.v), s = c.width / CANOPY_K; g.drawImage(c, tr.cx + dx - s / 2, tr.cy + dy - s / 2, s, s);
  }
}
