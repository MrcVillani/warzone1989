// Segni che restano sul terreno. Crateri e bruciature si timbrano una volta sui pezzi di terreno già cotti (nessun
// costo per fotogramma) e si ricordano, fino a un tetto, per ritimbrarli sui pezzi cotti di nuovo (cambio di livello).
// Impronte dei cingoli e solchi delle ruote stanno su una tela a metà risoluzione grande quanto la mappa, che sbiadisce
// piano (minuti) e si disegna con un solo drawImage, solo nei livelli che hanno le impronte. Solo disegno.
import { TILE, MW, MH, WATER, ROAD, CITY, CHASSIS, P, S, terr, ent, canSee, ftile, mulberry32 } from '../engine/index.js';
import { SUN } from './look.js';
import { paintChunks, setChunkPainter } from './terrain.js';

const DK = 0.5, FADE_S = 2, FADE_A = 0.03, MAX_MARKS = 220;
let dc = null, dg = null, used = false, fadeT = 0, pruneT = 0, seq = 1;
const last = new Map(), marks = [];
const soft = t => t !== WATER && t !== ROAD && t !== CITY;
const terrAt = (x, y) => { const tx = ftile(x), ty = ftile(y); return tx >= 0 && ty >= 0 && tx < MW && ty < MH ? terr[tx + ty * MW] : WATER; };

/* ---------- crateri e bruciature ---------- */
// Bruciatura: chiazza scura sfumata (a: intensità). Cratere: in più fondo scuro, bordo rialzato chiaro dal lato del
// sole, bordo in ombra dall'altro, terra smossa attorno (numeri casuali dal seme del segno: si ridisegna uguale).
function paint(g, m) {
  const gr = g.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r * 1.2);
  gr.addColorStop(0, `rgba(16,12,8,${m.a + 0.15})`); gr.addColorStop(0.55, `rgba(26,20,14,${m.a * 0.8})`); gr.addColorStop(1, 'rgba(26,20,14,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(m.x, m.y, m.r * 1.2, 0, 7); g.fill();
  if (!m.crater) return;
  const R = m.r * 0.45, sa = Math.atan2(SUN.sy, SUN.sx), r = mulberry32(m.seed);
  g.fillStyle = 'rgba(10,8,6,0.8)'; g.beginPath(); g.arc(m.x, m.y, R, 0, 7); g.fill();
  g.strokeStyle = 'rgba(150,126,92,0.6)'; g.lineWidth = 2; g.beginPath(); g.arc(m.x, m.y, R + 1, sa - 2, sa + 0.6); g.stroke();
  g.strokeStyle = 'rgba(20,16,10,0.5)'; g.lineWidth = 1.4; g.beginPath(); g.arc(m.x, m.y, R + 0.6, sa + 0.9, sa + 3.6); g.stroke();
  for (let i = 0; i < 12; i++) { const a = r() * 7, d = R + 2 + r() * R * 1.6; g.fillStyle = r() < 0.5 ? 'rgba(120,98,70,0.6)' : 'rgba(30,24,16,0.6)'; g.fillRect(m.x + Math.cos(a) * d, m.y + Math.sin(a) * d, 1.6, 1.6); }
}
function add(m) {
  if (marks.length >= MAX_MARKS) marks.shift();
  marks.push(m);
  paintChunks(m.x, m.y, m.r * 1.2, g => paint(g, m));
}
// Ritimbra i segni su un pezzo appena cotto (x0..x1, y0..y1 in coordinate del mondo).
setChunkPainter((g, x0, y0, x1, y1) => { for (const m of marks) if (m.x + m.r * 1.2 > x0 && m.x - m.r * 1.2 < x1 && m.y + m.r * 1.2 > y0 && m.y - m.r * 1.2 < y1) paint(g, m); });
export function scorchMark(x, y, r, a = 0.55) { if (terrAt(x, y) !== WATER) add({ x, y, r, a, crater: false, seed: seq++ }); }
// Su strade e città solo la bruciatura (l'asfalto si annerisce ma non si buca); sull'acqua niente.
export function craterMark(x, y, r) { const t = terrAt(x, y); if (t !== WATER) add({ x, y, r, a: 0.5, crater: soft(t), seed: (seq++ * 7919) >>> 0 }); }

/* ---------- impronte ---------- */
export function resetDecals() {
  marks.length = 0;
  if (!dc) { dc = document.createElement('canvas'); dc.width = MW * TILE * DK; dc.height = MH * TILE * DK; dg = dc.getContext('2d'); }
  dg.setTransform(1, 0, 0, 1, 0, 0); dg.globalCompositeOperation = 'source-over'; dg.clearRect(0, 0, dc.width, dc.height);
  used = false; fadeT = pruneT = 0; last.clear();
}
// Per ogni mezzo in vista che si è spostato di almeno step pixel, un tratto di cingoli (con le maglie) o di ruote
// dietro di lui. Sull'acqua solo la scia (wake, per gli hovercraft); su asfalto e città niente. step 0: niente impronte
// (e la tela si svuota, così non si disegna più).
export function stampTracks(dt, step, wake) {
  if (!dg || !S) return;
  if (!step) { if (used) { used = false; dg.setTransform(1, 0, 0, 1, 0, 0); dg.clearRect(0, 0, dc.width, dc.height); } return; }
  if ((fadeT += dt) > FADE_S && used) {
    fadeT = 0; dg.setTransform(1, 0, 0, 1, 0, 0);
    dg.globalCompositeOperation = 'destination-out'; dg.fillStyle = `rgba(0,0,0,${FADE_A})`;
    dg.fillRect(0, 0, dc.width, dc.height); dg.globalCompositeOperation = 'source-over';
  }
  if ((pruneT += dt) > 5) { pruneT = 0; for (const id of last.keys()) if (!ent(id)) last.delete(id); }
  for (const u of S.ents) {
    if (u.kind !== 'unit' || u.dead) continue;
    const l = last.get(u.id);
    if (!l) { last.set(u.id, [u.x, u.y]); continue; }
    const dx = u.x - l[0], dy = u.y - l[1], d2 = dx * dx + dy * dy;
    if (d2 < step * step) continue;
    l[0] = u.x; l[1] = u.y;
    if (d2 > 1600 || (u.owner !== P && !canSee(P, u))) continue;
    const p = u.builder ? 'W' : u.d.p, t = terrAt(u.x, u.y);
    if (p === 'V') { if (t === WATER && wake) wake(u); continue; }
    if (!soft(t)) continue;
    const c = Math.cos(u.ang), s = Math.sin(u.ang), W = u.builder ? 12 : CHASSIS[u.d.c].size[1], len = Math.min(Math.sqrt(d2), 2 * step) + 1;
    const off = W / 2 + (p === 'TR' ? 1.5 : 0.5), w = p === 'W' ? 2.2 : p === 'TR' ? 5.5 : p === 'T' ? 4 : 3.4;
    dg.setTransform(c * DK, s * DK, -s * DK, c * DK, u.x * DK, u.y * DK);
    dg.fillStyle = p === 'W' ? 'rgba(30,24,14,0.16)' : 'rgba(30,24,14,0.2)';
    dg.fillRect(-len + 3, -off - w / 2, len, w); dg.fillRect(-len + 3, off - w / 2, len, w);
    if (p !== 'W') { dg.fillStyle = 'rgba(20,16,10,0.18)'; for (let x = -len + 3; x < 3; x += 2.4) { dg.fillRect(x, -off - w / 2, 0.8, w); dg.fillRect(x, off - w / 2, 0.8, w); } }
    used = true;
  }
}
// Disegna la parte della tela delle impronte nel rettangolo del mondo x0..x1, y0..y1 (niente se è vuota).
export function drawDecals(g, x0, y0, x1, y1) {
  if (!used || x1 <= x0 || y1 <= y0) return;
  g.drawImage(dc, x0 * DK, y0 * DK, (x1 - x0) * DK, (y1 - y0) * DK, x0, y0, x1 - x0, y1 - y0);
}
