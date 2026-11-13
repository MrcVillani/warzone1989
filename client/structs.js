// Edifici nello stile «Rilievo»: piazzola di cemento con grana e giunti, tetti in lamiera ondulata con lucernari e
// ruggine (fabbrica), cupola illuminata (laboratorio), comando con antenne e radar, camino della fabbrica che fuma
// (il fumo nasce dall'evento «chimney» del motore), luci di segnalazione che lampeggiano, ombra proiettata dal sole.
// Il corpo fisso si disegna una volta per tipo, lato e scala su una tela fuori schermo; a ogni fotogramma si aggiungono
// le parti che si muovono (radar, bilanciere, gru, porte, torrette) e le luci. Crollo a fasi e macerie. Solo disegno.
import { TILE, mulberry32, clamp, towerWeapon } from '../engine/index.js';
import { PAL } from './state.js';
import { SUN, NIGHT } from './look.js';
import { bevelBox, insignia, shade, towerTurret } from './vehicles.js';
import { doorOpen, recoil, drawSite, makeRubble } from './anim.js';

// Altezza degli edifici (pixel del mondo) per la lunghezza dell'ombra.
const HEIGHT = { hq: 14, factory: 16, lab: 11, tower: 7, bunker: 9, depot: 8, pump: 6 };
function convex(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
// Ombra proiettata: il prisma dell'edificio spostato nella direzione del sole (sotto tutto il resto).
export function structShadow(g, s) {
  const x0 = s.tx * TILE + 3, y0 = s.ty * TILE + 3, x1 = (s.tx + s.w) * TILE - 3, y1 = (s.ty + s.h) * TILE - 3;
  const h = (HEIGHT[s.type] || 8) * SUN.len * (s.built < 1 ? s.built : 1), dx = SUN.sx * h, dy = SUN.sy * h;
  const pts = convex([[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0 + dx, y0 + dy], [x1 + dx, y0 + dy], [x1 + dx, y1 + dy], [x0 + dx, y1 + dy]]);
  g.fillStyle = 'rgba(6,8,6,0.42)'; g.beginPath(); pts.forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b))); g.closePath(); g.fill();
}
// Cemento con grana, giunti e macchie.
function concrete(g, x, y, w, h, base, r) {
  g.fillStyle = base; g.fillRect(x, y, w, h);
  for (let i = 0; i < w * h / 6; i++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,240,0.07)'; g.fillRect(x + r() * w, y + r() * h, 1, 1); }
  g.strokeStyle = 'rgba(0,0,0,0.14)'; g.lineWidth = 0.5; g.beginPath();
  for (let xx = x + 16; xx < x + w; xx += 16) { g.moveTo(xx, y); g.lineTo(xx, y + h); }
  for (let yy = y + 16; yy < y + h; yy += 16) { g.moveTo(x, yy); g.lineTo(x + w, yy); }
  g.stroke();
  for (let i = 0; i < 2; i++) { g.fillStyle = 'rgba(20,16,10,0.12)'; g.beginPath(); g.ellipse(x + r() * w, y + r() * h, 3 + r() * 5, 2 + r() * 3, r() * 3, 0, 7); g.fill(); }
}
// Corpo fisso dell'edificio in coordinate locali (0, 0 in alto a sinistra).
function body(g, type, owner, w, h) {
  const col = PAL[owner], ll = [-SUN.sx, -SUN.sy, SUN.el], r = mulberry32(type.length * 31 + owner * 7);
  if (type !== 'pump' && type !== 'tower') { bevelBox(g, 2, 2, w - 4, h - 4, 2, '#77725f', ll); concrete(g, 4, 4, w - 8, h - 8, '#7a7562', r); }
  switch (type) {
    case 'hq': {
      bevelBox(g, 10, 10, w - 28, h - 30, 3, col.body, ll);
      g.strokeStyle = 'rgba(40,26,8,0.3)'; g.lineWidth = 0.6; g.beginPath(); for (let i = 1; i < 6; i++) { const x = 13 + i * (w - 34) / 6; g.moveTo(x, 13); g.lineTo(x, h - 23); } g.stroke();
      insignia(g, owner, 10 + (w - 28) / 2, 10 + (h - 30) / 2, 7);
      for (const [x, y] of [[16, 16], [16, h - 30]]) {
        bevelBox(g, x, y, 8, 6, 1, '#8c897c', ll); g.fillStyle = '#2a2925'; g.beginPath(); g.arc(x + 4, y + 3, 2.2, 0, 7); g.fill();
        g.strokeStyle = '#6a675c'; g.lineWidth = 0.5; g.beginPath(); g.moveTo(x + 2, y + 3); g.lineTo(x + 6, y + 3); g.moveTo(x + 4, y + 1); g.lineTo(x + 4, y + 5); g.stroke();
      }
      g.fillStyle = '#4f4d44'; g.beginPath(); g.arc(w - 12, 19, 8, 0, 7); g.fill();
      g.fillStyle = '#2a2925'; g.fillRect(w / 2 - 15, h - 21, 30, 8);
      g.fillStyle = '#33322c'; g.beginPath(); g.arc(14, h - 12, 3.5, 0, 7); g.fill();
      g.strokeStyle = '#33322c'; g.lineWidth = 1; g.beginPath(); g.moveTo(14, h - 12); g.lineTo(26, h - 8); g.stroke();
      break;
    }
    case 'factory': {
      const rx = 6, ry = 6, rw = w - 12, rh = h - 20, n = 6;
      for (let i = 0; i < n; i++) {
        const xx = rx + i * rw / n, sw = rw / n;
        // lamiera ondulata: falda lunga e falda corta con le onde, lucernario, ruggine
        g.fillStyle = shade('#8c8778', clamp(0.55 - 0.52 * ll[0] + 0.35 * ll[2], 0.35, 1.4)); g.fillRect(xx, ry, sw * 0.62, rh);
        g.fillStyle = shade('#8c8778', clamp(0.55 + 0.52 * ll[0] + 0.35 * ll[2], 0.35, 1.4)); g.fillRect(xx + sw * 0.62, ry, sw * 0.38, rh);
        g.fillStyle = 'rgba(0,0,0,0.1)'; for (let y = ry; y < ry + rh; y += 1.6) g.fillRect(xx, y, sw * 0.62, 0.6);
        const gl = g.createLinearGradient(0, ry, 0, ry + rh); gl.addColorStop(0, 'rgba(170,205,215,0.55)'); gl.addColorStop(1, 'rgba(90,120,130,0.55)');
        g.fillStyle = gl; g.fillRect(xx + sw * 0.66, ry + 2, 1.6, rh - 4);
        if (r() < 0.4) { g.fillStyle = 'rgba(120,70,40,0.25)'; g.fillRect(xx + r() * sw * 0.5, ry + r() * rh, 3, 4); }
      }
      g.fillStyle = col.body; g.fillRect(rx, ry, rw, 4); g.fillStyle = shade(col.body, 0.7); g.fillRect(rx, ry + 4, rw, 0.8); insignia(g, owner, rx + 10, ry + rh / 2 + 2, 5);
      g.fillStyle = '#2a2925'; g.fillRect(w / 2 - 16, h - 15, 32, 10);
      for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#2a2925' : '#e3bd3e'; g.fillRect(w / 2 - 16 + i * 4, h - 17, 4, 2); }
      // camino con la fascia rossa
      const kx = w - 16, ky = 20, gr = g.createRadialGradient(kx - SUN.sx * 2, ky - SUN.sy * 2, 1, kx, ky, 7); gr.addColorStop(0, '#807d72'); gr.addColorStop(1, '#3a3933');
      g.fillStyle = gr; g.beginPath(); g.arc(kx, ky, 6.5, 0, 7); g.fill(); g.strokeStyle = '#a03a2e'; g.lineWidth = 1.2; g.beginPath(); g.arc(kx, ky, 5.4, 0, 7); g.stroke();
      g.fillStyle = '#121110'; g.beginPath(); g.arc(kx, ky, 3.6, 0, 7); g.fill();
      break;
    }
    case 'lab': {
      const cx = w / 2, cy = h / 2, gr = g.createRadialGradient(cx - SUN.sx * 7, cy - SUN.sy * 7, 2, cx, cy, 17);
      gr.addColorStop(0, '#fbfcf7'); gr.addColorStop(0.6, '#a9b2b0'); gr.addColorStop(1, '#5f6a6b');
      g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, 15, 0, 7); g.fill();
      g.strokeStyle = 'rgba(60,70,72,0.35)'; g.lineWidth = 0.5; g.beginPath(); for (let i = 0; i < 6; i++) { g.moveTo(cx, cy - 15); g.quadraticCurveTo(cx + (i - 2.5) * 6, cy, cx, cy + 15); } g.stroke();
      g.strokeStyle = col.body; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, 16, 0, 7); g.stroke();
      g.fillStyle = '#d8d3c1'; g.beginPath(); g.ellipse(w - 9, 9, 3, 2, 0.6, 0, 7); g.fill(); g.fillStyle = '#33322c'; g.fillRect(w - 9.5, 9, 1, 3);
      break;
    }
    case 'tower': {
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.arc(w / 2 + 2, h / 2 + 3, 14, 0, 7); g.fill();
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2, b = clamp(0.55 + 0.52 * (Math.cos(a) * ll[0] + Math.sin(a) * ll[1]) + 0.35 * ll[2], 0.35, 1.4);
        g.save(); g.translate(w / 2 + Math.cos(a) * 11, h / 2 + Math.sin(a) * 11); g.rotate(a + Math.PI / 2);
        g.fillStyle = shade(i % 2 ? '#948a6a' : '#a3997b', b); g.beginPath(); g.roundRect ? g.roundRect(-3.6, -2.4, 7.2, 4.8, 2) : g.rect(-3.6, -2.4, 7.2, 4.8); g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 0.4; g.beginPath(); g.moveTo(-3, 0); g.lineTo(3, 0); g.stroke(); g.restore();
      }
      g.fillStyle = '#55524a'; g.beginPath(); g.arc(w / 2, h / 2, 7, 0, 7); g.fill();
      break;
    }
    case 'bunker': {
      bevelBox(g, 9, 9, w - 18, h - 18, 4, '#9a967f', ll);
      g.strokeStyle = 'rgba(40,38,30,0.25)'; g.lineWidth = 0.5; g.beginPath(); for (let y = 15; y < h - 12; y += 4) { g.moveTo(13, y); g.lineTo(w - 13, y); } g.stroke();
      g.strokeStyle = col.body; g.lineWidth = 1.8; g.strokeRect(12, 12, w - 24, h - 24);
      g.fillStyle = '#16150f'; g.fillRect(w / 2 - 7, 13.5, 14, 2.6); g.fillRect(w / 2 - 7, h - 16.1, 14, 2.6); g.fillRect(13.5, h / 2 - 7, 2.6, 14); g.fillRect(w - 16.1, h / 2 - 7, 2.6, 14);
      g.fillStyle = '#5f5c50'; g.beginPath(); g.arc(w / 2, h / 2, 10, 0, 7); g.fill(); g.strokeStyle = '#3f3d34'; g.lineWidth = 1; g.stroke();
      break;
    }
    case 'depot': {
      g.setLineDash([5, 4]); g.strokeStyle = col.light; g.lineWidth = 2; g.strokeRect(9, 9, w - 18, h - 18); g.setLineDash([]);
      g.fillStyle = col.body; g.fillRect(w / 2 - 9, h / 2 - 2.5, 18, 5); g.fillRect(w / 2 - 2.5, h / 2 - 9, 5, 18);
      for (const [x, y] of [[w - 16, h - 14], [w - 10, h - 14]]) bevelBox(g, x, y, 5, 5, 1, '#6e5a3a', ll);
      break;
    }
    case 'pump': {
      g.fillStyle = 'rgba(14,12,9,0.9)'; g.beginPath(); g.ellipse(w / 2, h / 2, 14, 12, 0, 0, 7); g.fill();
      g.fillStyle = 'rgba(120,95,150,0.22)'; g.beginPath(); g.ellipse(w / 2 - 4, h / 2 + 3, 6, 2.5, 0.3, 0, 7); g.fill();
      bevelBox(g, 6, 6, 20, 20, 2, '#6e6a5b', ll);
      g.fillStyle = col.body; g.beginPath(); g.arc(11, 21, 4.5, 0, 7); g.fill(); g.strokeStyle = col.dark; g.lineWidth = 0.8; g.stroke();
      break;
    }
  }
}
const bodies = new Map();
// Corpo già pronto per tipo, lato e scala; tinted = tinta della luna cotta (notte senza tela della luce).
function bodyOf(s, k, tinted) {
  const key = `${s.type}${s.owner}:${k}:${tinted ? 1 : 0}`;
  let c = bodies.get(key); if (c) return c;
  if (bodies.size > 120) bodies.clear();
  const w = s.w * TILE, h = s.h * TILE;
  c = document.createElement('canvas'); c.width = Math.ceil(w * k); c.height = Math.ceil(h * k);
  const g = c.getContext('2d'); g.scale(k, k); body(g, s.type, s.owner, w, h);
  if (tinted) { g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'multiply'; g.fillStyle = `rgb(${NIGHT.bake})`; g.fillRect(0, 0, c.width, c.height); g.globalCompositeOperation = 'destination-in'; const b = document.createElement('canvas'); b.width = c.width; b.height = c.height; const bg = b.getContext('2d'); bg.scale(k, k); body(bg, s.type, s.owner, w, h); g.drawImage(b, 0, 0); g.globalCompositeOperation = 'source-over'; b.width = b.height = 0; }
  bodies.set(key, c); return c;
}

// Porta scorrevole a due ante (fabbrica e comando): chiusa a lamelle; quando esce un mezzo si apre sull'interno
// illuminato. cx: centro, y: bordo alto, hw: mezza larghezza, h: altezza.
function door(g, s, cx, y, hw, h, now) {
  const o = doorOpen(s.id, now), pw = hw * (1 - o * 0.92);
  if (o > 0) { g.fillStyle = `rgba(240,196,120,${(0.35 * o).toFixed(3)})`; g.fillRect(cx - hw, y, hw * 2, h); }
  g.fillStyle = '#58564c'; g.fillRect(cx - hw, y, pw, h); g.fillRect(cx + hw - pw, y, pw, h);
  g.fillStyle = 'rgba(20,19,16,0.55)';
  for (let yy = y + 1.5; yy < y + h - 0.5; yy += 2) { g.fillRect(cx - hw, yy, pw, 0.7); g.fillRect(cx + hw - pw, yy, pw, 0.7); }
  if (o < 0.05) { g.fillStyle = '#26251f'; g.fillRect(cx - 0.4, y, 0.8, h); }
}
// Parti che si muovono e luci di lavoro: radar, bilanciere della pompa, gru del deposito, porte, torrette.
// live: edificio finito (le parti si muovono); k, aq, night: come per le sagome dei mezzi.
function moving(g, s, t, now, live, k, aq, night) {
  const x0 = s.tx * TILE, y0 = s.ty * TILE, w = s.w * TILE, h = s.h * TILE, cx = x0 + w / 2, cy = y0 + h / 2, col = PAL[s.owner];
  const ph = s.phase || 0;
  if (s.type === 'hq') {
    g.save(); g.translate(x0 + w - 12, y0 + 19); g.rotate((live ? t * 1.4 : 0) + ph);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(SUN.sx * 4, SUN.sy * 4, 3, 9, 0, 0, 7); g.fill();
    g.fillStyle = '#e2ddc9'; g.beginPath(); g.ellipse(0, 0, 3, 9, 0, 0, 7); g.fill(); g.fillStyle = '#33322c'; g.fillRect(0, -1, 7, 2); g.restore();
    if (live) door(g, s, cx, y0 + h - 21, 15, 8, now);
  } else if (s.type === 'factory') {
    if (live) door(g, s, cx, y0 + h - 15, 16, 10, now);
    if (live && s.queue.length && Math.sin(t * 6) > 0) { g.fillStyle = '#f0b04a'; g.beginPath(); g.arc(cx - 19, y0 + h - 10, 2, 0, 7); g.arc(cx + 19, y0 + h - 10, 2, 0, 7); g.fill(); }
  } else if (s.type === 'pump') {
    const kk = live ? Math.sin(t * 2.6 + ph) : 0;
    g.save(); g.translate(cx + 1, cy - 2); g.rotate(-0.65);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(-9 + SUN.sx * 5, -1.6 + SUN.sy * 5, 18 + kk * 3, 3.2);
    g.fillStyle = '#33322c'; g.fillRect(-2.5, -2.5, 5, 5); g.fillStyle = col.light; g.fillRect(-9, -1.6, 18 + kk * 3, 3.2); g.fillStyle = col.dark; g.fillRect(8 + kk * 3, -3.5, 3.5, 7);
    g.restore();
  } else if (s.type === 'depot') {
    g.save(); g.translate(x0 + 10, y0 + 10); g.rotate((live ? t * 0.5 : 0) + ph);
    g.fillStyle = '#33322c'; g.beginPath(); g.arc(0, 0, 4, 0, 7); g.fill(); g.fillStyle = col.light; g.fillRect(0, -1.5, 20, 3); g.restore();
  } else if (s.type === 'lab') {
    if (live && s.rs && Math.sin(t * 5) > 0) { g.fillStyle = '#9fd6c8'; g.beginPath(); g.arc(x0 + w - 10.5, y0 + 9.5, 2, 0, 7); g.fill(); }
  } else if (s.type === 'tower' || s.type === 'bunker') {
    const wk = s.type === 'bunker' ? 'CN75' : towerWeapon(s.owner).key, sc = s.type === 'bunker' ? 1.1 : wk === 'CN75' ? 1 : 1.15;
    const tw = towerTurret(wk, s.owner, sc, s.tang, k, aq, night), rec = live ? recoil(s.id, now) : 0;
    g.save(); g.translate(cx - Math.cos(s.tang) * rec, cy - Math.sin(s.tang) * rec); g.rotate(s.tang);
    g.drawImage(tw.c, tw.x, tw.y, tw.w, tw.h); g.restore();
  }
}
// Luci di segnalazione [x, y, intensità 0..1, colore]: comando e fabbrica rosse lampeggianti, fabbrica gialla fissa,
// laboratorio verde-azzurra (lampeggia mentre ricerca).
export function beacons(s, t) {
  const x0 = s.tx * TILE, y0 = s.ty * TILE, w = s.w * TILE, ph = s.phase || 0;
  if (s.type === 'hq') return [[x0 + w - 12, y0 + 10, Math.sin(t * 3 + ph) > 0.6 ? 1 : 0.15, '#ff5040']];
  if (s.type === 'factory') return [[x0 + w - 16, y0 + 12, Math.sin(t * 2.4 + ph) > 0.5 ? 1 : 0.15, '#ff5040'], [x0 + 8, y0 + s.h * TILE - 10, 0.8, '#ffd27a']];
  if (s.type === 'lab') return [[x0 + w - 9, y0 + 9, s.rs ? (Math.sin(t * 5) > 0 ? 1 : 0.2) : 0.3, '#9fe6d0']];
  return [];
}
// Finestre accese di notte (rettangoli in coordinate locali dell'edificio).
export const WINDOWS = {
  hq: [[14, 14, 2.5, 2.5], [22, 14, 2.5, 2.5], [30, 14, 2.5, 2.5], [14, 66, 2.5, 2.5], [56, 66, 2.5, 2.5]],
  factory: [[18, 10, 2, 22], [34, 10, 2, 22], [50, 10, 2, 22], [66, 10, 2, 22]], lab: [[30, 30, 4, 4]], depot: [[12, 12, 3, 3], [48, 48, 3, 3]],
};

// Edificio intero: corpo già pronto, parti che si muovono; un cantiere si alza dal basso dentro l'impalcatura.
// o: { t, now, k, aq, night (torrette con la tinta della notte), tinted (corpo con la tinta della notte), rm }
export function drawStruct(g, s, o) {
  const x0 = s.tx * TILE, y0 = s.ty * TILE, w = s.w * TILE, h = s.h * TILE, b = bodyOf(s, o.k, o.tinted);
  if (s.built < 1) {
    g.fillStyle = 'rgba(25,25,20,0.35)'; g.fillRect(x0 + 2, y0 + 2, w - 4, h - 4);
    g.save(); g.beginPath(); g.rect(x0, y0 + h * (1 - s.built), w, h * s.built); g.clip(); g.globalAlpha = 0.9;
    g.drawImage(b, x0, y0, w, h); moving(g, s, o.t, o.now, false, o.k, o.aq, o.night); g.restore(); g.globalAlpha = 1;
    g.setLineDash([4, 3]); g.strokeStyle = PAL[s.owner].light; g.lineWidth = 1; g.strokeRect(x0 + 6.5, y0 + 6.5, w - 13, h - 13); g.setLineDash([]);
    drawSite(g, s, x0, y0, w, h, o.t, o.now, o.rm);
    return;
  }
  g.drawImage(b, x0, y0, w, h);
  moving(g, s, o.t, o.now, true, o.k, o.aq, o.night);
}

// Edificio che crolla a fasi: trema e si crepa (0,45 s), il tetto cede e sprofonda annerendosi (fino a 1,4 s), poi
// restano le macerie che fumano e sbiadiscono negli ultimi 6 secondi. Con «riduci movimento» niente tremito.
export function drawRuin(g, r, o) {
  const s = r.s, x0 = s.tx * TILE, y0 = s.ty * TILE, w = s.w * TILE, h = s.h * TILE;
  if (!r.img) r.img = makeRubble(s, PAL[s.owner]);
  const a = clamp((r.t - 0.4) / 0.6, 0, 1) * Math.min(1, (r.life - r.t) / 6);
  if (a > 0.01) { g.globalAlpha = a; g.drawImage(r.img.c, x0 + r.img.x, y0 + r.img.y, r.img.w, r.img.h); g.globalAlpha = 1; }
  if (r.t > 1.4) return;
  const j = o.rm ? 0 : r.t < 0.45 ? 1.4 : 0.6, sink = r.t < 0.45 ? 0 : (r.t - 0.45) / 0.95, e = sink * sink;
  g.save(); g.beginPath(); g.rect(x0 - 6, y0 - 6, w + 12, h + 12); g.clip();
  g.globalAlpha = 1 - 0.85 * e;
  g.translate(r.x + (Math.random() - 0.5) * j, r.y + (Math.random() - 0.5) * j + (o.rm ? 0 : 4 * e)); g.scale(1 - 0.2 * e, 1 - 0.28 * e); g.translate(-r.x, -r.y);
  if (sink > 0) { g.beginPath(); g.rect(x0, y0 + h * 0.5 * e, w, h); g.clip(); }
  g.drawImage(bodyOf(s, o.k, o.tinted), x0, y0, w, h);
  // crepe che si allargano e annerimento
  g.strokeStyle = 'rgba(14,10,6,0.8)'; g.lineWidth = 1.2; g.beginPath();
  const q = mulberry32(s.id * 13 + 1), sp = Math.min(1, r.t * 3);
  for (let i = 0; i < 5; i++) { let x = x0 + w * q(), y = y0 + h * q(); g.moveTo(x, y); for (let n = 0; n < 3; n++) { x += (q() - 0.5) * 18 * sp; y += (q() - 0.5) * 18 * sp; g.lineTo(x, y); } }
  g.stroke();
  g.fillStyle = `rgba(18,14,10,${(0.7 * Math.min(1, r.t / 1.2)).toFixed(3)})`; g.fillRect(x0 + 2, y0 + 2, w - 4, h - 4);
  g.restore(); g.globalAlpha = 1;
}
