// Livree dei veterani: più il mezzo sale di grado (rank 0–3 del motore), più è vistoso. Sono strati dipinti sopra la
// sagoma di serie, uguali per ogni telaio, propulsione e arma (i mezzi li progetta il giocatore), e finiscono nella
// stessa sagoma cotta (vehicles.js), così un mezzo costa sempre due copie per fotogramma.
//   1 Esperto: tacche sulla canna, due strisce da corsa, fari supplementari gialli
//   2 Veterano: fiamme sui fianchi, cromature su cingoli e cerchi, coda di volpe sull'antenna, scarico più grosso
//   3 Asso: vernice metallizzata, bordi e fiamme d'oro, alettone, doppio scarico cromato, neon sotto la scocca,
//     scintillio
// Il Direttorio ha lo stesso crescendo nel suo stile: strisce nere, fiamme di ferro e cromo, bordi cromati, neon rosso.
// La fascia di riconoscimento sul muso si ridisegna sopra tutto (vehicles.js). Qui anche le parti vive (neon, coda,
// scintillio), i galloni sopra i mezzi e il gallone per il pannello. Solo disegno.
import { CHASSIS, P, mulberry32 } from '../engine/index.js';
import { PAL } from './state.js';

function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
// Stile per lato: Brigata (avorio, fiamme rosse e gialle, oro) e Direttorio (nero, ferro e cromo, rosso).
export const STYLE = [
  { stripe: '#f6ecd2', edge: 'rgba(40,24,6,0.75)', notch: '#fbf3dc', flame: ['#fff2a6', '#ffa726', '#cf3618'], flameEdge: 'rgba(74,20,4,0.85)',
    ace: ['#fffbe0', '#f4cf52', '#b9821a'], aceEdge: 'rgba(84,52,6,0.9)', trim: '#f8d665', trimLo: '#a97c1e', metal: 'rgba(255,190,60,0.2)', neon: [255, 176, 52], fog: '#ffd62e' },
  { stripe: '#171514', edge: 'rgba(232,236,240,0.8)', notch: '#e9edf0', flame: ['#c4cbd2', '#5a6168', '#121011'], flameEdge: 'rgba(240,244,248,0.9)',
    ace: ['#ffffff', '#c3cad1', '#ff3d2c'], aceEdge: 'rgba(30,6,6,0.9)', trim: '#eef2f5', trimLo: '#8a9299', metal: 'rgba(26,6,10,0.3)', neon: [255, 52, 40], fog: '#ffd62e' },
];
const styleOf = owner => STYLE[owner === P ? 0 : 1];
export const CHROME = ['#f7f9fb', '#aeb6bd', '#5d646b'];

/* ---------- scafo ---------- */
// Fiamma dipinta lungo un fianco: parte dal muso (x0) e lecca indietro per len; e: bordo del fianco, s: verso
// l'interno (+1 o -1), d: profondità.
export function flame(g, x0, len, e, s, d) {
  g.beginPath(); g.moveTo(x0, e); g.lineTo(x0, e - s * d);
  g.quadraticCurveTo(x0 - len * 0.25, e - s * d * 1.12, x0 - len * 0.56, e - s * d * 0.86);
  g.quadraticCurveTo(x0 - len * 0.36, e - s * d * 0.6, x0 - len * 0.3, e - s * d * 0.5);
  g.quadraticCurveTo(x0 - len * 0.6, e - s * d * 0.56, x0 - len * 0.82, e - s * d * 0.38);
  g.quadraticCurveTo(x0 - len * 0.56, e - s * d * 0.24, x0 - len * 0.5, e - s * d * 0.16);
  g.quadraticCurveTo(x0 - len * 0.8, e - s * d * 0.2, x0 - len, e - s * d * 0.02);
  g.lineTo(x0 - len * 0.6, e + s * 0.5); g.closePath();
}
export function chromePipe(g, x, y, len, w) {
  const gr = g.createLinearGradient(0, y - w / 2, 0, y + w / 2); gr.addColorStop(0, CHROME[0]); gr.addColorStop(0.5, CHROME[1]); gr.addColorStop(1, CHROME[2]);
  g.fillStyle = gr; rr(g, x, y - w / 2, len, w, w * 0.4); g.fill();
  g.fillStyle = '#0f0e0c'; g.beginPath(); g.ellipse(x + 0.5, y, 0.45, w * 0.32, 0, 0, 7); g.fill();
}
// Bordo dello scafo: oro per la Brigata, cromo per il Direttorio; più chiaro sui lati verso la luce.
function edge(g, L, Wd, st, ll) {
  g.lineWidth = 0.85; g.strokeStyle = st.trimLo; rr(g, -L / 2 + 0.4, -Wd / 2 + 0.4, L - 0.8, Wd - 0.8, 1.9); g.stroke();
  g.strokeStyle = st.trim; g.lineWidth = 0.6; g.beginPath();
  if (ll[1] < 0.2) { g.moveTo(-L / 2 + 2, -Wd / 2 + 0.4); g.lineTo(L / 2 - 2, -Wd / 2 + 0.4); } else { g.moveTo(-L / 2 + 2, Wd / 2 - 0.4); g.lineTo(L / 2 - 2, Wd / 2 - 0.4); }
  if (ll[0] > -0.2) { g.moveTo(L / 2 - 0.4, -Wd / 2 + 2); g.lineTo(L / 2 - 0.4, Wd / 2 - 2); } else { g.moveTo(-L / 2 + 0.4, -Wd / 2 + 2); g.lineTo(-L / 2 + 0.4, Wd / 2 - 2); }
  g.stroke();
}
// Vernice metallizzata: velatura del colore del lato, bande di riflesso verso la luce, qualche brillantino.
function metallic(g, hx, hy, st, ll, seed) {
  g.fillStyle = st.metal; g.fillRect(-hx, -hy, hx * 2, hy * 2);
  const gr = g.createLinearGradient(-ll[0] * hx, -ll[1] * hy, ll[0] * hx, ll[1] * hy);
  gr.addColorStop(0, 'rgba(0,0,0,0.24)'); gr.addColorStop(0.34, 'rgba(255,255,255,0)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.44)');
  gr.addColorStop(0.7, 'rgba(255,255,255,0.04)'); gr.addColorStop(0.86, 'rgba(255,255,255,0.3)'); gr.addColorStop(1, 'rgba(255,255,255,0.1)');
  g.fillStyle = gr; g.fillRect(-hx, -hy, hx * 2, hy * 2);
  const r = mulberry32(seed); g.fillStyle = 'rgba(255,255,255,0.6)';
  for (let i = 0; i < 12; i++) g.fillRect(-hx + r() * hx * 2, -hy + r() * hy * 2, 0.35, 0.35);
}
// Strati della livrea sullo scafo rivolto verso +x (dopo il disegno di serie). ll: luce locale; lite: qualità minima
// (solo i bordi dell'asso).
export function hullLivery(g, d, owner, ll, rank, lite) {
  const C = CHASSIS[d.c], L = C.size[0], Wd = C.size[1], hx = L / 2, hy = Wd / 2, st = styleOf(owner), col = PAL[owner];
  if (lite) { if (rank >= 3) edge(g, L, Wd, st, ll); return; }
  g.save(); rr(g, -hx, -hy, L, Wd, 2); g.clip();
  if (rank >= 3) metallic(g, hx, hy, st, ll, 31 + L * 7 + owner);
  // due strisce da corsa per tutta la lunghezza, spostate su un fianco: la fascia sul muso resta libera
  const yc = -Wd * 0.2;
  g.fillStyle = st.edge; g.fillRect(-hx, yc - 1.55, L, 3.1);
  g.fillStyle = st.stripe; g.fillRect(-hx, yc - 1.3, L, 1.05); g.fillRect(-hx, yc + 0.25, L, 1.05);
  if (rank >= 2) {
    // fiamme sui due fianchi: bordo scuro (o cromato), corpo sfumato dal muso alle punte, anima più chiara
    const pal = rank >= 3 ? st.ace : st.flame, len = L * 0.82, dp = Wd * 0.32;
    for (const s of [1, -1]) {
      const e = s * hy, gr = g.createLinearGradient(hx - 1.2, 0, hx - 1.2 - len, 0);
      gr.addColorStop(0, pal[0]); gr.addColorStop(0.45, pal[1]); gr.addColorStop(1, pal[2]);
      flame(g, hx - 1.2, len, e, s, dp); g.fillStyle = gr; g.fill();
      g.strokeStyle = rank >= 3 ? st.aceEdge : st.flameEdge; g.lineWidth = 0.45; g.stroke();
      flame(g, hx - 1.2, len * 0.55, e, s, dp * 0.5); g.fillStyle = pal[0]; g.globalAlpha = 0.8; g.fill(); g.globalAlpha = 1;
    }
  }
  g.restore();
  // fari supplementari gialli sul muso
  for (const s of [-1, 1]) {
    g.fillStyle = '#2a2925'; g.beginPath(); g.arc(hx - 0.9, s * Wd * 0.17, 1.05, 0, 7); g.fill();
    g.fillStyle = st.fog; g.beginPath(); g.arc(hx - 0.9, s * Wd * 0.17, 0.75, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(hx - 1.15, s * Wd * 0.17 - 0.35, 0.4, 0.4);
  }
  if (rank === 2) {
    // scarico più grosso: un tubo d'acciaio che esce di lato dietro, annerito in punta
    g.fillStyle = '#62666b'; rr(g, -hx - 2.2, hy - 3.9, 4.2, 1.9, 0.8); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(-hx - 1.8, hy - 3.7, 3.4, 0.4);
    g.fillStyle = '#0f0e0c'; g.beginPath(); g.ellipse(-hx - 1.75, hy - 2.95, 0.5, 0.7, 0, 0, 7); g.fill();
  }
  if (rank >= 3) {
    // doppio scarico cromato, alettone con le paratie dorate (o cromate) e la sua ombra, bordo dello scafo
    chromePipe(g, -hx - 3.3, -hy + 3.1, 4.4, 1.7); chromePipe(g, -hx - 3.3, hy - 3.1, 4.4, 1.7);
    edge(g, L, Wd, st, ll);
    g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(-hx - 1.2, -hy - 0.6, 4, Wd + 2.6);
    g.fillStyle = '#1c1b18'; g.fillRect(-hx + 1, -hy * 0.55 - 0.5, 1.4, 1); g.fillRect(-hx + 1, hy * 0.55 - 0.5, 1.4, 1);
    const wg = g.createLinearGradient(-hx - 2.4, 0, -hx + 1.4, 0), dk = owner === P ? '#6e4a16' : '#1c0d0e', md = owner === P ? '#e0a83e' : '#6a2420';
    wg.addColorStop(0, dk); wg.addColorStop(0.55, md); wg.addColorStop(1, dk);
    g.fillStyle = wg; rr(g, -hx - 2.4, -hy - 1.5, 3.8, Wd + 3, 0.8); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(-hx - 0.6, -hy - 1.1, 0.5, Wd + 2.2);
    g.fillStyle = st.trim; g.fillRect(-hx - 2.6, -hy - 1.8, 4.2, 1.1); g.fillRect(-hx - 2.6, hy + 0.7, 4.2, 1.1);
    g.fillStyle = st.trimLo; g.fillRect(-hx - 2.6, -hy - 0.8, 4.2, 0.25); g.fillRect(-hx - 2.6, hy + 0.55, 4.2, 0.25);
    g.fillStyle = col.light; g.fillRect(-hx - 2.4, -1, 3.8, 2);
  }
}

/* ---------- torretta ---------- */
// Strati sulla torretta (dentro la sua scala): tacche delle vittorie sulla canna (o sul cassone dei lanciatori),
// per l'asso anello e volata dorati (cromati per il Direttorio). geo: { kind, R, bl, bw, nb } della torretta.
export function turretLivery(g, geo, owner, ll, rank, lite) {
  const { kind, R, bl, bw, nb } = geo, st = styleOf(owner);
  const shape = () => { if (kind === 'r') { g.beginPath(); g.arc(0, 0, R - 0.2, 0, 7); } else if (kind === 'l') rr(g, -R * 0.8 + 0.3, -R + 0.3, R * 2.4 - 0.6, R * 2 - 0.6, 1); else rr(g, -R + 0.3, -R * 0.85 + 0.3, R * 2 - 0.6, R * 1.7 - 0.6, 1.4); };
  if (!lite) {
    // sul tetto: le due strisce da corsa davanti (verso la canna) e dietro, lasciando liberi cupola e portello; dal
    // grado di Veterano le fiamme sui due fianchi
    const xr = kind === 'l' ? R * 1.6 : R, xb = kind === 'l' ? -R * 0.8 : -R, he = kind === 'b' || kind === 'w' ? R * 0.85 : R;
    g.save(); shape(); g.clip();
    for (const [a, b] of kind === 'l' ? [[xb + 2.4, xr]] : [[R * 0.22, xr], [xb, -R * 0.72]]) {
      g.fillStyle = st.edge; g.fillRect(a, -1.45, b - a, 2.9);
      g.fillStyle = st.stripe; g.fillRect(a, -1.2, b - a, 0.95); g.fillRect(a, 0.25, b - a, 0.95);
    }
    if (rank >= 2) {
      const pal = rank >= 3 ? st.ace : st.flame, len = (xr - xb) * 0.82, dp = he * 0.36;
      for (const sd of [1, -1]) {
        const gr = g.createLinearGradient(xr, 0, xr - len, 0); gr.addColorStop(0, pal[0]); gr.addColorStop(0.45, pal[1]); gr.addColorStop(1, pal[2]);
        flame(g, xr - 0.3, len, sd * he, sd, dp); g.fillStyle = gr; g.fill(); g.strokeStyle = rank >= 3 ? st.aceEdge : st.flameEdge; g.lineWidth = 0.4; g.stroke();
      }
    }
    g.restore();
    const n = [0, 3, 5, 7][rank] || 0;
    g.fillStyle = rank >= 3 ? st.trim : st.notch;
    if (bw > 0 && kind !== 'l') {
      const x0 = R + 1.3, sp = Math.min(1.15, (bl - x0 - 2.4) / n);
      for (let b = 0; b < (nb || 1); b++) { const oy = nb === 2 ? (b ? 1.5 : -1.5) : 0; for (let i = 0; i < n; i++) g.fillRect(x0 + i * sp, oy - bw / 2, Math.min(0.5, sp * 0.5), bw); }
    } else for (let i = 0; i < n; i++) g.fillRect(-R * 0.8 + 3 + i * 1.05, R - 1.9, 0.5, 1.5);
  }
  if (rank < 3) return;
  g.strokeStyle = st.trimLo; g.lineWidth = 0.9;
  shape(); g.stroke(); g.strokeStyle = st.trim; g.lineWidth = 0.45; shape(); g.stroke();
  if (lite) return;
  if (bw > 0 && kind !== 'l') for (let b = 0; b < (nb || 1); b++) { const oy = nb === 2 ? (b ? 1.5 : -1.5) : 0; g.fillStyle = st.trim; g.fillRect(bl - 2.6, oy - bw / 2 - 0.3, 1.1, bw + 0.6); }
  // riflesso della vernice metallizzata sul tetto della torretta
  g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 0.5; g.beginPath(); g.arc(ll[0] * R * 0.15, ll[1] * R * 0.15, R * 0.62, Math.atan2(ll[1], ll[0]) - 0.7, Math.atan2(ll[1], ll[0]) + 0.7); g.stroke();
}

/* ---------- parti vive ---------- */
// Neon sotto la scocca dell'asso: alone del colore del lato attorno allo scafo, in fusione additiva. Si disegna prima
// dello scafo (che copre il centro); di notte lo illumina anche la tela della luce (light.js, NEON_LIGHT).
const neons = [null, null];
function neonImg(o) {
  if (neons[o]) return neons[o];
  const c = document.createElement('canvas'); c.width = 128; c.height = 96; const g = c.getContext('2d'), [r, gg, b] = STYLE[o].neon;
  for (let i = 0; i < 9; i++) { g.strokeStyle = `rgba(${r},${gg},${b},${(0.05 + i * 0.022).toFixed(3)})`; g.lineWidth = 34 - i * 3.6; g.lineJoin = 'round'; rr(g, 30, 30, 68, 36, 8); g.stroke(); }
  g.strokeStyle = `rgba(${Math.min(255, r + 40)},${Math.min(255, gg + 60)},${Math.min(255, b + 70)},0.9)`; g.lineWidth = 2.4; rr(g, 30, 30, 68, 36, 8); g.stroke();
  return (neons[o] = c);
}
// g già nel riferimento dello scafo (rivolto verso +x). L, W: ingombro dello scafo; a: intensità.
export function drawNeon(g, owner, L, W, a) {
  const img = neonImg(owner === P ? 0 : 1), kx = (L + 3) / 68, ky = (W + 3) / 36;
  g.globalCompositeOperation = 'lighter'; g.globalAlpha = a;
  g.drawImage(img, -(L + 3) / 2 - 30 * kx, -(W + 3) / 2 - 30 * ky, 128 * kx, 96 * ky);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
}
export const neonRGB = owner => styleOf(owner).neon;
// Coda di volpe in cima all'antenna (x, y nel riferimento in cui si disegna; a: direzione in cui pende, già con
// l'onda): fulva con la punta chiara.
export function drawTail(g, x, y, a, len = 6.2) {
  const c = Math.cos(a), s = Math.sin(a), nx = -s, ny = c, w = len * 0.2;
  const mx = x + c * len * 0.55 + nx * w * 0.9, my = y + s * len * 0.55 + ny * w * 0.9, ex = x + c * len, ey = y + s * len;
  g.fillStyle = '#2a1608'; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(mx + nx * w, my + ny * w, ex, ey); g.quadraticCurveTo(mx - nx * w * 2.2, my - ny * w * 2.2, x, y); g.fill();
  g.fillStyle = '#d2692a'; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(mx + nx * w * 0.6, my + ny * w * 0.6, ex, ey); g.quadraticCurveTo(mx - nx * w * 1.7, my - ny * w * 1.7, x, y); g.fill();
  g.fillStyle = '#f7ecd4'; g.beginPath(); g.arc(ex - c * len * 0.12, ey - s * len * 0.12, w * 0.75, 0, 7); g.fill();
}
// Scintillio: stella a quattro punte che si accende e si spegne (a: 0–1), in fusione additiva.
export function drawSparkle(g, x, y, s, a) {
  g.globalCompositeOperation = 'lighter'; g.globalAlpha = a; g.fillStyle = '#fff8dc';
  g.beginPath(); g.moveTo(x - s, y); g.lineTo(x, y - s * 0.16); g.lineTo(x + s, y); g.lineTo(x, y + s * 0.16); g.closePath();
  g.moveTo(x, y - s); g.lineTo(x + s * 0.16, y); g.lineTo(x, y + s); g.lineTo(x - s * 0.16, y); g.closePath(); g.fill();
  g.beginPath(); g.arc(x, y, s * 0.28, 0, 7); g.fill();
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
}

/* ---------- galloni ---------- */
// Gallone del grado: 1, 2 o 3 «V» rovesciate; l'asso ha in più la stella. Disegnato in un riquadro largo 10; l'altezza
// dipende dal grado (CHEV_H). Colore del lato: oro per la Brigata, rosa mattone per il Direttorio.
export const CHEV_H = [0, 4.8, 7.4, 15.6];
const CHEV_COL = [['#ffd35a', '#fff0a8'], ['#ff9c8c', '#ffd2c8']];
const STAR = (() => { const p = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 1.35 : 3.3; p.push([5 + Math.cos(a) * r, 3.6 + Math.sin(a) * r]); } return p; })();
const chevY = (rank, i) => (rank >= 3 ? 6.5 + i * 2.4 : 0.5 + i * 2.6);
function chevPath(g, rank) {
  g.beginPath();
  for (let i = 0; i < Math.min(3, rank); i++) { const y = chevY(rank, i); g.moveTo(1.3, y + 3); g.lineTo(5, y + 0.6); g.lineTo(8.7, y + 3); }
}
function starPath(g) { g.beginPath(); STAR.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); }
const chevs = new Map();
// Tela del gallone (6 pixel per unità), con il bordo scuro per leggerlo su ogni terreno.
export function chevronImg(rank, owner) {
  const o = owner === P ? 0 : 1, key = rank * 2 + o; let c = chevs.get(key); if (c) return c;
  const K = 6, h = CHEV_H[rank]; c = document.createElement('canvas'); c.width = 10 * K; c.height = Math.ceil(h * K);
  const g = c.getContext('2d'); g.scale(K, K); g.lineCap = 'round'; g.lineJoin = 'round';
  chevPath(g, rank); g.strokeStyle = 'rgba(14,12,6,0.9)'; g.lineWidth = 2.5; g.stroke();
  if (rank >= 3) { starPath(g); g.lineWidth = 1.5; g.stroke(); }
  chevPath(g, rank); g.strokeStyle = CHEV_COL[o][0]; g.lineWidth = 1.35; g.stroke();
  if (rank >= 3) { starPath(g); g.fillStyle = CHEV_COL[o][1]; g.fill(); }
  chevs.set(key, c); return c;
}
// Lo stesso gallone per il pannello (SVG in linea; il colore viene dal foglio di stile: classe rk, lato p o e).
export function rankSvg(rank, owner) {
  if (!(rank > 0)) return '';
  const h = CHEV_H[rank]; let d = '';
  for (let i = 0; i < Math.min(3, rank); i++) { const y = chevY(rank, i); d += `M1.3 ${(y + 3).toFixed(1)}L5 ${(y + 0.6).toFixed(1)}L8.7 ${(y + 3).toFixed(1)}`; }
  const star = rank >= 3 ? `<path class="st" d="M${STAR.map(p => p.map(v => v.toFixed(2)).join(' ')).join('L')}Z"/>` : '';
  return `<svg class="rk ${owner === P ? 'p' : 'e'} r${rank}" viewBox="0 0 10 ${h}" width="${rank >= 3 ? 11 : 12}" height="${(h * (rank >= 3 ? 1.1 : 1.2)).toFixed(1)}" aria-hidden="true" focusable="false">${star}<path d="${d}"/></svg>`;
}
