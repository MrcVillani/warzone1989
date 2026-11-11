// Mezzi nello stile «Rilievo»: scafo smussato con il filo di luce sugli spigoli verso il sole, cingoli a maglie con la
// ruota motrice, ruote con il mozzo, griglia del motore con i tubi di scarico, taniche, fari, fascia di riconoscimento
// del lato; torretta con cupola e portelli, episcopi, antenna, insegna; ombra morbida e ombra di contatto.
// Ogni sagoma si disegna una volta su una tela fuori schermo (per tipo, lato, direzione della luce, fase dei cingoli,
// scala, giorno o notte) e poi si copia ruotata: due drawImage per mezzo, come prima. Di notte la sagoma è già tinta
// dalla luna e ha il contorno sottile del colore del lato, così resta riconoscibile senza passate in più.
// Anche i relitti (scafo bruciato, torretta sbalzata) e le icone dei mezzi nel pannello stanno qui. Solo disegno.
import { CHASSIS, P, clamp } from '../engine/index.js';
import { PAL } from './state.js';
import { SUN, NIGHT } from './look.js';

// Distanza della bocca dell'arma dal perno della torretta (unità del disegno, scala 1) e scala della torretta per telaio.
export const WEAPON_REACH = { MG: 11, HMG: 15.6, CN: 16.5, FL: 13.6, RP: 14.5, CN75: 22.5, RK: 7, AT: 12.6, MO: 11, CN105: 29.5, HW: 27.5, MRL: 10.5 };
export const TURRET_SC = { L: 1, M: 1.1, H: 1.25, X: 1.4 };
// Quanto si allunga il mezzo dal centro, dietro e davanti (con la canna), per inquadrarlo nelle icone.
export function vehicleExtent(d) {
  const L = CHASSIS[d.c].size[0];
  return { back: L / 2 + 3, front: Math.max(L / 2 + 3, (WEAPON_REACH[d.w] || 12) * (TURRET_SC[d.c] || 1)) };
}

/* ---------- materiali ---------- */
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
export const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16), f = v => clamp(Math.round(v * k), 0, 255).toString(16).padStart(2, '0'); return `#${f(n >> 16)}${f((n >> 8) & 255)}${f(n & 255)}`; };
// Luce nel riferimento del mezzo rivolto di a radianti: [x, y, elevazione], verso la sorgente.
export const localLight = a => { const c = Math.cos(-a), s = Math.sin(-a), x = -SUN.sx, y = -SUN.sy; return [x * c - y * s, x * s + y * c, SUN.el]; };
const facet = (ll, nx, ny) => clamp(0.55 + 0.52 * (nx * ll[0] + ny * ll[1]) + 0.35 * ll[2], 0.35, 1.4);
// Scatola smussata: quattro facce inclinate illuminate secondo la luce, piano superiore, filo di luce sugli spigoli.
export function bevelBox(g, x, y, w, h, c, col, ll) {
  const pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], inn = [[x + c, y + c], [x + w - c, y + c], [x + w - c, y + h - c], [x + c, y + h - c]], Nn = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4; g.fillStyle = shade(col, facet(ll, Nn[i][0], Nn[i][1]));
    g.beginPath(); g.moveTo(pts[i][0], pts[i][1]); g.lineTo(pts[j][0], pts[j][1]); g.lineTo(inn[j][0], inn[j][1]); g.lineTo(inn[i][0], inn[i][1]); g.closePath(); g.fill();
  }
  g.fillStyle = shade(col, 0.85 + 0.3 * ll[2]); g.fillRect(x + c, y + c, w - 2 * c, h - 2 * c);
  g.strokeStyle = 'rgba(255,248,225,0.35)'; g.lineWidth = 0.5; g.beginPath();
  for (let i = 0; i < 4; i++) if (Nn[i][0] * ll[0] + Nn[i][1] * ll[1] > 0.2) { const j = (i + 1) % 4; g.moveTo(pts[i][0], pts[i][1]); g.lineTo(pts[j][0], pts[j][1]); }
  g.stroke();
}
// Insegne: la Brigata un sole che sorge, il Direttorio un rombo con la barra.
export function insignia(g, owner, x, y, s) {
  if (owner === P) {
    g.fillStyle = '#f6e7c0'; g.beginPath(); g.arc(x, y + s * 0.3, s * 0.55, Math.PI, 0); g.fill();
    g.strokeStyle = '#f6e7c0'; g.lineWidth = s * 0.22; g.beginPath();
    for (const a of [-2.3, -1.57, -0.84]) { g.moveTo(x + Math.cos(a) * s * 0.75, y + s * 0.3 + Math.sin(a) * s * 0.75); g.lineTo(x + Math.cos(a) * s * 1.1, y + s * 0.3 + Math.sin(a) * s * 1.1); }
    g.stroke();
  } else {
    g.fillStyle = '#26211f'; g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s * 0.8, y); g.lineTo(x, y + s); g.lineTo(x - s * 0.8, y); g.closePath(); g.fill();
    g.fillStyle = '#e8ddd0'; g.fillRect(x - s * 0.45, y - s * 0.14, s * 0.9, s * 0.28);
  }
}

/* ---------- scafo ---------- */
// Ombra morbida già pronta (un rettangolo arrotondato sfumato), per larghezza e lunghezza dello scafo.
const blobs = new Map();
function blob(w, h, r, blur) {
  const key = `${w}:${h}:${r}:${blur}`; let c = blobs.get(key); if (c) return c;
  const m = Math.ceil(blur * 3) + 1, k = 2; c = document.createElement('canvas'); c.width = (w + 2 * m) * k; c.height = (h + 2 * m) * k;
  const g = c.getContext('2d'); g.scale(k, k);
  if ('filter' in g) g.filter = `blur(${blur}px)`;
  g.fillStyle = '#000'; rr(g, m, m, w, h, r); g.fill();
  c.m = m; blobs.set(key, c); return c;
}
const drawBlob = (g, x, y, w, h, r, blur, a) => { const b = blob(w, h, r, blur); g.globalAlpha = a; g.drawImage(b, x - b.m, y - b.m, w + 2 * b.m, h + 2 * b.m); g.globalAlpha = 1; };

function treads(g, p, L, Wd, ph, ll) {
  const dark = '#22231c', link = '#4c4d42', hi = shade('#6a6b5c', facet(ll, 0, -1));
  if (p === 'W' || p === 'HT') {
    const xs = p === 'HT' ? [L / 2 - 6] : L > 24 ? [-L / 2 + 1, -L / 2 + 7.5, L / 2 - 12.5, L / 2 - 6] : L > 16 ? [-L / 2 + 1, -2.5, L / 2 - 6] : [-L / 2 + 1, L / 2 - 6];
    for (const sx of xs) for (const sy of [-Wd / 2 - 2.4, Wd / 2 - 0.8]) {
      g.fillStyle = dark; rr(g, sx, sy, 5.4, 3.2, 1.3); g.fill();
      g.fillStyle = '#3a3b32'; for (let x = sx + 0.4 + (ph * 0.8 % 1.6); x < sx + 5.2; x += 1.6) g.fillRect(x, sy + 0.25, 0.6, 2.7);
      g.fillStyle = '#7a776a'; g.beginPath(); g.arc(sx + 2.7, sy + 1.6, 0.8, 0, 7); g.fill();
      g.fillStyle = hi; g.fillRect(sx + 0.6, sy + 0.15, 4.2, 0.45);
    }
    if (p === 'W') return;
  }
  const x0 = p === 'HT' ? -L / 2 - 0.5 : -L / 2 - 1.8, len = p === 'HT' ? L * 0.62 : L + 3.6, tw = p === 'TR' ? 6 : 4.4;
  for (const sy of [-Wd / 2 - tw + 1.2, Wd / 2 - 1.2]) {
    g.fillStyle = dark; rr(g, x0, sy, len, tw, 1.8); g.fill();
    // maglie: piastra con il filo di luce, guida centrale scura
    for (let x = x0 + 0.7 + (ph * 1.1 % 2.2); x < x0 + len - 1.2; x += 2.2) { g.fillStyle = link; g.fillRect(x, sy + 0.35, 1.4, tw - 0.7); g.fillStyle = 'rgba(255,250,230,0.16)'; g.fillRect(x, sy + 0.35, 0.4, tw - 0.7); }
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x0, sy + tw / 2 - 0.35, len, 0.7);
    // ruota motrice davanti con il mozzo, tenditore dietro
    g.fillStyle = '#5a5a4e'; g.beginPath(); g.arc(x0 + len - 1.6, sy + tw / 2, tw * 0.42, 0, 7); g.fill(); g.fillStyle = '#2a2a24'; g.beginPath(); g.arc(x0 + len - 1.6, sy + tw / 2, tw * 0.18, 0, 7); g.fill();
    g.fillStyle = '#4e4e44'; g.beginPath(); g.arc(x0 + 1.6, sy + tw / 2, tw * 0.36, 0, 7); g.fill();
    g.fillStyle = hi; g.globalAlpha = 0.6; g.fillRect(x0 + 1, sy + 0.15, len - 2, 0.45); g.globalAlpha = 1;
    g.fillStyle = 'rgba(96,78,52,0.35)'; g.fillRect(x0 + 1, sy + tw - 1.1, len - 2, 0.9); // fango sul bordo
  }
}
// Scafo rivolto verso +x. ll: luce locale; ph: fase delle maglie (0, 1); sh: spostamento dell'ombra (null = senza ombre,
// [0, 0] = solo l'ombra di contatto).
function drawHull(g, d, owner, ll, ph, sh) {
  const C = CHASSIS[d.c], L = C.size[0], Wd = C.size[1], col = PAL[owner];
  if (sh) {
    // ombra morbida verso dove cade la luce e ombra di contatto stretta sotto lo scafo
    if (sh[0] || sh[1]) drawBlob(g, -L / 2 + sh[0], -Wd / 2 - 2 + sh[1], L + 1, Wd + 4, 4, 2.2, 0.5);
    drawBlob(g, -L / 2 - 1 + sh[0] * 0.25, -Wd / 2 - 2.6 + sh[1] * 0.25, L + 2, Wd + 5.2, 2.5, 0.8, 0.55);
  }
  if (d.p === 'V') { g.fillStyle = '#2d302b'; g.beginPath(); g.ellipse(0, 0, L / 2 + 3, Wd / 2 + 3, 0, 0, 7); g.fill(); g.strokeStyle = 'rgba(220,230,215,0.35)'; g.lineWidth = 1; g.stroke(); }
  else treads(g, d.p, L, Wd, ph, ll);
  bevelBox(g, -L / 2, -Wd / 2, L, Wd, 2.2, col.body, ll);
  // macchie mimetiche
  g.save(); g.beginPath(); g.rect(-L / 2 + 2.2, -Wd / 2 + 2.2, L - 4.4, Wd - 4.4); g.clip();
  g.fillStyle = shade(col.body, 0.72); g.globalAlpha = 0.5;
  g.beginPath(); g.ellipse(-L * 0.18, -Wd * 0.22, L * 0.2, Wd * 0.18, 0.5, 0, 7); g.ellipse(L * 0.22, Wd * 0.2, L * 0.18, Wd * 0.16, -0.4, 0, 7); g.fill(); g.restore(); g.globalAlpha = 1;
  // pannelli, griglia del motore con i tubi di scarico, cassette sui parafanghi, taniche, fari
  g.strokeStyle = 'rgba(30,20,8,0.35)'; g.lineWidth = 0.45; g.beginPath(); g.moveTo(-L / 2 + 6, -Wd / 2 + 2.2); g.lineTo(-L / 2 + 6, Wd / 2 - 2.2); g.moveTo(L / 2 - 4.5, -Wd / 2 + 2.2); g.lineTo(L / 2 - 4.5, Wd / 2 - 2.2); g.stroke();
  g.fillStyle = 'rgba(18,16,10,0.6)'; for (let y = -Wd / 2 + 3; y < Wd / 2 - 2.8; y += 1.3) g.fillRect(-L / 2 + 1.4, y, 3.8, 0.6);
  for (const sy of [-1, 1]) { g.fillStyle = '#2b2a25'; g.beginPath(); g.arc(-L / 2 + 0.9, sy * (Wd / 2 - 2.4), 0.9, 0, 7); g.fill(); g.fillStyle = '#7a4a2a'; g.beginPath(); g.arc(-L / 2 + 0.9, sy * (Wd / 2 - 2.4), 0.45, 0, 7); g.fill(); }
  g.fillStyle = shade(col.dark, 1.3); g.fillRect(-L / 2 + 7, -Wd / 2 + 0.3, L * 0.32, 1.3); g.fillRect(-L / 2 + 7, Wd / 2 - 1.6, L * 0.22, 1.3);
  g.fillStyle = '#4f5a3a'; g.fillRect(-L / 2 + 1.2 + L * 0.55, Wd / 2 - 1.8, 2, 1.5); g.fillRect(-L / 2 + 3.6 + L * 0.55, Wd / 2 - 1.8, 2, 1.5);
  g.fillStyle = '#f4ead0'; g.fillRect(L / 2 - 1.4, -Wd / 2 + 1.1, 1, 1.7); g.fillRect(L / 2 - 1.4, Wd / 2 - 2.8, 1, 1.7);
  g.strokeStyle = '#2a2925'; g.lineWidth = 0.3; g.strokeRect(L / 2 - 1.5, -Wd / 2 + 1, 1.2, 1.9); g.strokeRect(L / 2 - 1.5, Wd / 2 - 2.9, 1.2, 1.9);
  // fascia di riconoscimento sullo spiovente davanti: chiara per la Brigata, scura per il Direttorio
  g.fillStyle = owner === P ? 'rgba(246,231,192,0.85)' : 'rgba(30,26,24,0.85)';
  g.beginPath(); g.moveTo(L / 2 - 4, -1.8); g.lineTo(L / 2 - 2.6, 0); g.lineTo(L / 2 - 4, 1.8); g.lineTo(L / 2 - 4.9, 1.8); g.lineTo(L / 2 - 3.5, 0); g.lineTo(L / 2 - 4.9, -1.8); g.closePath(); g.fill();
}

/* ---------- torretta ---------- */
// [forma, raggio, [lunghezza della canna, spessore, numero di canne o tubi]]: r tonda, b smussata, w a cuneo con la
// cesta, l lanciatore a cassone.
const TUR = {
  MG: ['r', 4, [11, 1.4, 2]], HMG: ['b', 4.4, [15, 2.3, 1]], CN: ['b', 5, [16.5, 2.8, 1]], CN75: ['b', 6.4, [22.5, 3.2, 1]], CN105: ['w', 7, [29.5, 3.4, 1]],
  FL: ['r', 3.8, [13, 2, 1]], RP: ['r', 4, [13, 1.4, 1]], RK: ['l', 5.2, [7, 0, 3]], AT: ['r', 4.2, [12.6, 2.6, 1]], MO: ['r', 5, [10, 5, 1]], HW: ['w', 6.2, [27.5, 2.8, 1]], MRL: ['l', 7, [10.5, 0, 6]],
};
function drawTurret(g, w, owner, sc, ll, shadow) {
  const [kind, R, [bl, bw, nb]] = TUR[w] || TUR.CN, col = PAL[owner];
  g.save(); g.scale(sc, sc);
  if (shadow) drawBlob(g, -ll[0] * 1.5 - R - 0.8, -ll[1] * 1.5 - R - 0.8, 2 * R + 1.6, 2 * R + 1.6, R, 1, 0.35);
  if (bw > 0) for (let i = 0; i < (nb || 1); i++) {
    const oy = nb === 2 ? (i ? 1.5 : -1.5) : 0, gr = g.createLinearGradient(0, oy - bw / 2, 0, oy + bw / 2);
    gr.addColorStop(0, ll[1] < 0 ? '#76746a' : '#2a2925'); gr.addColorStop(0.45, '#46453c'); gr.addColorStop(1, ll[1] < 0 ? '#22211c' : '#76746a');
    g.fillStyle = gr; g.fillRect(R * 0.5, oy - bw / 2, bl - R * 0.5, bw);
    if (bw > 2) { g.fillStyle = 'rgba(0,0,0,0.35)'; for (const f of [0.45, 0.62, 0.79]) g.fillRect(bl * f, oy - bw / 2, 0.6, bw); } // manicotto termico
    g.fillStyle = '#121210'; g.fillRect(bl - 1, oy - bw / 2 - 0.4, 1.4, bw + 0.8);
    if (w === 'CN105' || w === 'HW' || w === 'CN75') { g.fillStyle = '#2a2925'; g.fillRect(bl * 0.55, oy - bw / 2 - 0.6, 2.4, bw + 1.2); g.fillRect(bl - 2.4, oy - bw / 2 - 0.8, 1.2, bw + 1.6); }
  }
  if (w === 'FL') { for (const y of [-4.7, 1.1]) { g.fillStyle = '#7d6f45'; rr(g, -8.5, y, 7.5, 3.6, 1.8); g.fill(); g.fillStyle = '#4f472c'; g.fillRect(-5.2, y, 1, 3.6); } g.fillStyle = '#ff9a3c'; g.beginPath(); g.arc(bl + 0.6, 0, 0.9, 0, 7); g.fill(); }
  if (w === 'RP') {
    g.strokeStyle = '#d6c98e'; g.lineWidth = 0.8; g.beginPath();
    for (let x = 2; x < 12; x += 2.3) { g.moveTo(x, -1.2); g.lineTo(x + 2.3, 1.2); }
    g.stroke(); g.fillStyle = '#e6e1d0'; rr(g, -8, -3.1, 5.6, 6.2, 0.8); g.fill();
    g.fillStyle = '#3f9a5a'; g.fillRect(-5.85, -2.3, 1.3, 4.6); g.fillRect(-7.5, -0.65, 4.6, 1.3);
  }
  if (w === 'AT') { g.fillStyle = '#dcd8c4'; rr(g, -2, -1.1, 12.4, 2.2, 1); g.fill(); g.fillStyle = '#b4472c'; g.beginPath(); g.moveTo(10.2, -1.1); g.lineTo(12.6, 0); g.lineTo(10.2, 1.1); g.closePath(); g.fill(); }
  if (kind === 'l') {
    bevelBox(g, -R * 0.8, -R, R * 2.4, R * 2, 1.2, '#5a5a4c', ll);
    g.fillStyle = '#16150f'; for (let i = 0; i < nb; i++) { g.beginPath(); g.arc(R * 1.45, -R + (i + 0.5) * (2 * R / nb), Math.min(1.1, R / nb * 0.8), 0, 7); g.fill(); }
    g.fillStyle = col.body; g.fillRect(-R * 0.8, -R, 2.2, R * 2);
  } else if (kind === 'r') {
    const gr = g.createRadialGradient(ll[0] * R * 0.5, ll[1] * R * 0.5, R * 0.1, 0, 0, R); gr.addColorStop(0, shade(col.body, 1.3)); gr.addColorStop(1, shade(col.body, 0.62));
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, R, 0, 7); g.fill(); g.strokeStyle = col.dark; g.lineWidth = 0.9; g.stroke();
  } else {
    // cesta portaoggetti dietro, corpo smussato, mantelletto, lanciafumogeni
    g.strokeStyle = '#3a3a32'; g.lineWidth = 0.4; g.strokeRect(-R - 3, -R * 0.6, 3, R * 1.2); g.beginPath(); for (let y = -R * 0.6; y < R * 0.6; y += 1.2) { g.moveTo(-R - 3, y); g.lineTo(-R, y); } g.stroke();
    g.fillStyle = col.dark; rr(g, -R - 0.7, -R * 0.85 - 0.7, R * 2 + 1.4, R * 1.7 + 1.4, 1.6); g.fill();
    bevelBox(g, -R, -R * 0.85, R * 2, R * 1.7, 1.6, shade(col.body, 1.12), ll);
    g.fillStyle = shade(col.body, 0.75); g.fillRect(R - 1.2, -bw / 2 - 1.2, 2.2, bw + 2.4);
    g.fillStyle = '#2f2e28'; for (const sy of [-1, 1]) for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(R * 0.55 - i * 1.1, sy * (R * 0.85 + 0.4), 0.45, 0, 7); g.fill(); }
    if (kind === 'w') { g.fillStyle = '#4b4a40'; g.fillRect(-R - 3.5, -R * 0.6, 3.5, R * 1.2); }
  }
  if (kind !== 'l') {
    // cupola del capocarro con il portello e gli episcopi; portello del servente con l'insegna; antenna
    const cx = -R * 0.3, cy = -R * 0.32, cr = Math.max(1.4, R * 0.34);
    g.fillStyle = shade(col.body, 0.62); g.beginPath(); g.arc(cx, cy, cr, 0, 7); g.fill();
    g.fillStyle = shade(col.body, 1.05); g.beginPath(); g.arc(cx + ll[0] * 0.2, cy + ll[1] * 0.2, cr * 0.7, 0, 7); g.fill();
    g.strokeStyle = 'rgba(20,18,12,0.6)'; g.lineWidth = 0.35; g.beginPath(); g.moveTo(cx - cr * 0.6, cy); g.lineTo(cx + cr * 0.6, cy); g.stroke();
    g.fillStyle = '#9ec0c4'; for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.4; g.fillRect(cx + Math.cos(a) * cr - 0.3, cy + Math.sin(a) * cr - 0.3, 0.6, 0.6); }
    if (R >= 4.4) { g.fillStyle = shade(col.body, 0.7); g.fillRect(-R * 0.35, R * 0.15, R * 0.5, R * 0.42); insignia(g, owner, -R * 0.62, R * 0.45, R * 0.22); }
    g.strokeStyle = '#2a2925'; g.lineWidth = 0.35; g.beginPath(); g.moveTo(-R * 0.75, R * 0.55); g.lineTo(-R * 0.75 - 4, R * 0.55 + 1); g.stroke();
    g.fillStyle = '#2a2925'; g.beginPath(); g.arc(-R * 0.75, R * 0.55, 0.5, 0, 7); g.fill();
  }
  g.restore();
}

/* ---------- genieri ---------- */
function drawTruck(g, owner, ll, sh) {
  const col = PAL[owner];
  if (sh) drawBlob(g, -10 + sh[0], -7 + sh[1], 21, 14, 3, 2, 0.45);
  for (const x of [-8, -3, 5]) for (const y of [-7, 4.5]) { g.fillStyle = '#24251e'; rr(g, x, y, 4, 2.6, 1); g.fill(); g.fillStyle = '#6a675c'; g.beginPath(); g.arc(x + 2, y + 1.3, 0.6, 0, 7); g.fill(); }
  bevelBox(g, -10, -5, 13, 10, 1.5, '#6c6a5c', ll);
  g.fillStyle = 'rgba(30,28,22,0.6)'; for (let x = -9; x < 2; x += 2.2) g.fillRect(x, -4, 0.8, 8);
  bevelBox(g, 3, -5, 7.5, 10, 1.6, col.body, ll);
  g.fillStyle = '#a9c4c8'; g.fillRect(8.4, -3.4, 1.6, 6.8); g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(8.6, -3, 0.5, 2.5);
  g.fillStyle = '#2a2925'; g.beginPath(); g.arc(-5, 0, 2.2, 0, 7); g.fill();
}
// Braccio della gru del geniere (si muove mentre lavora): si disegna a ogni fotogramma sopra la sagoma.
export function truckArm(g, owner, a) {
  g.rotate(a); g.fillStyle = PAL[owner].light; g.fillRect(0, -1.2, 12, 2.4); g.fillStyle = '#2a2925'; g.fillRect(11, -2, 2, 4);
}

/* ---------- sagome già pronte ---------- */
const sprites = new Map(), MAX_SPRITES = 2400, BUDGET = 24;
// Sagome nuove create in questo fotogramma: oltre BUDGET si usa intanto quella con la luce fissa (aq = 1), così un
// cambio di livello o una battaglia appena iniziata non bloccano un fotogramma per creare centinaia di sagome.
let made = 0;
export function spriteFrame() { made = 0; }
// Tela della sagoma: il riquadro [x0, y0, x1, y1] in unità del mondo (origine sul perno) a scala k; si ritaglia
// stretto sul disegno, perché ogni pixel trasparente costa quando la sagoma si copia ruotata. Di notte la tinta della
// luna e il contorno. Si copia con drawImage(s.c, s.x, s.y, s.w, s.h).
function sprite(key, [x0, y0, x1, y1], k, night, owner, draw) {
  let s = sprites.get(key);
  if (s) return s;
  made++;
  if (sprites.size > MAX_SPRITES) sprites.clear();
  const c = document.createElement('canvas'); c.width = Math.ceil((x1 - x0) * k); c.height = Math.ceil((y1 - y0) * k);
  const g = c.getContext('2d'); g.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
  if (!night) draw(g, true);
  else {
    // sagoma senza ombre, tinta dalla luna; poi il contorno del colore del lato (otto copie spostate) sotto la sagoma
    const a = document.createElement('canvas'); a.width = c.width; a.height = c.height;
    const ag = a.getContext('2d'); ag.setTransform(k, 0, 0, k, -x0 * k, -y0 * k); draw(ag, false);
    ag.setTransform(1, 0, 0, 1, 0, 0); ag.globalCompositeOperation = 'source-atop';
    const u = NIGHT.unit; ag.fillStyle = `rgba(${Math.round(30 * u[0])},${Math.round(40 * u[1])},${Math.round(90 * u[2])},0.42)`; ag.fillRect(0, 0, a.width, a.height);
    g.setTransform(1, 0, 0, 1, 0, 0);
    const d = Math.max(1, 0.75 * k);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) g.drawImage(a, dx * d, dy * d);
    g.globalCompositeOperation = 'source-in'; g.fillStyle = NIGHT.rim[owner === P ? 0 : 1]; g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'source-over'; g.drawImage(a, 0, 0);
    a.width = a.height = 0;
  }
  s = { c, x: x0, y: y0, w: c.width / k, h: c.height / k }; sprites.set(key, s);
  return s;
}
const bucket = (a, n) => ((Math.round(a / (Math.PI * 2) * n) % n) + n) % n;
// Scafo per mezzo: luce cotta per una di aq direzioni (aq = 1: luce fissa sul mezzo, senza ombra spostata).
export function hullSprite(d, owner, ang, dist, k, aq, night) {
  const b = bucket(ang, aq), ph = Math.floor(((dist % 2.2) + 2.2) % 2.2 / 1.1) & 1, key = `h${d.c}${d.p}${owner}:${aq}.${b}:${ph}:${k}:${night ? 1 : 0}`;
  const s0 = sprites.get(key); if (s0) return s0;
  if (aq > 1 && made >= BUDGET) return hullSprite(d, owner, ang, dist, k, 1, night);
  const C = CHASSIS[d.c], L = C.size[0], Wd = C.size[1], aB = b / aq * Math.PI * 2, ll = localLight(aq > 1 ? aB : 0);
  const so = aq > 1 ? 4 * SUN.len : 0, c = Math.cos(-aB), s = Math.sin(-aB), sh = [(SUN.sx * c - SUN.sy * s) * so, (SUN.sx * s + SUN.sy * c) * so];
  // ingombro: cingoli o ruote, ombra di contatto, più l'ombra morbida spostata (se la luce è cotta per direzione)
  const m = so ? 3.5 : 0.9, hx = L / 2 + (d.p === 'V' ? 3 : 2.7), hy = Wd / 2 + Math.max(d.p === 'TR' ? 4.8 : d.p === 'W' ? 2.4 : d.p === 'V' ? 3 : 3.2, 4);
  const box = [-hx + Math.min(0, sh[0]) - m, -hy + Math.min(0, sh[1]) - m, hx + Math.max(0, sh[0]) + m, hy + Math.max(0, sh[1]) + m];
  return sprite(key, box, k, night, owner, (g, shadow) => drawHull(g, d, owner, ll, ph, shadow ? sh : null));
}
// Ingombro della torretta a scala sc, con un margine per l'ombra e il contorno.
function turretBox(w, sc, m) {
  const [kind, R, [bl]] = TUR[w] || TUR.CN;
  const back = Math.max(w === 'FL' ? 9 : w === 'RP' ? 8.5 : kind === 'w' ? R + 4 : kind === 'b' ? R + 3.3 : kind === 'l' ? R * 0.8 + 0.5 : R + 1, kind === 'l' ? 0 : R * 0.75 + 4.5);
  const front = Math.max(bl + 1, kind === 'l' ? R * 1.6 + 1 : R + 1), half = Math.max(R, w === 'FL' ? 4.8 : 0) + 1;
  return [-(back + m) * sc, -(half + m) * sc, (front + m) * sc, (half + m) * sc];
}
export function turretSprite(w, c, owner, tang, k, aq, night) {
  const b = bucket(tang, aq), key = `t${w}${c}${owner}:${aq}.${b}:${k}:${night ? 1 : 0}`;
  const s0 = sprites.get(key); if (s0) return s0;
  if (aq > 1 && made >= BUDGET) return turretSprite(w, c, owner, tang, k, 1, night);
  const sc = TURRET_SC[c] || 1, ll = localLight(aq > 1 ? b / aq * Math.PI * 2 : 0);
  return sprite(key, turretBox(w, sc, aq > 1 ? 2.5 : 0.8), k, night, owner, (g, shadow) => drawTurret(g, w, owner, sc, ll, shadow && aq > 1));
}
export function truckSprite(owner, ang, k, aq, night) {
  const b = bucket(ang, aq), aB = b / aq * Math.PI * 2, ll = localLight(aq > 1 ? aB : 0), so = aq > 1 ? 4 * SUN.len : 0, c = Math.cos(-aB), s = Math.sin(-aB);
  const sh = [(SUN.sx * c - SUN.sy * s) * so, (SUN.sx * s + SUN.sy * c) * so];
  return sprite(`k${owner}:${aq}.${b}:${k}:${night ? 1 : 0}`, [-14 + Math.min(0, sh[0]), -10 + Math.min(0, sh[1]), 13 + Math.max(0, sh[0]), 10 + Math.max(0, sh[1])], k, night, owner, (g, shadow) => drawTruck(g, owner, ll, shadow ? sh : null));
}
// Torretta di una torre o di un bunker: la stessa sagoma dei mezzi, più grande.
export function towerTurret(w, owner, sc, tang, k, aq, night) {
  const b = bucket(tang, aq), ll = localLight(aq > 1 ? b / aq * Math.PI * 2 : 0);
  return sprite(`T${w}${owner}:${sc}:${aq}.${b}:${k}:${night ? 1 : 0}`, turretBox(w, sc, 2.5), k, night, owner, (g, shadow) => drawTurret(g, w, owner, sc, ll, shadow));
}

/* ---------- icone del pannello ---------- */
// Il mezzo disegnato direttamente (senza sagome già pronte), per le tessere e l'anteprima di Progetta.
export function drawVehicle(g, d, col, ang, tang, moving, t) {
  const owner = col === PAL[1] ? 1 : 0, so = 4 * SUN.len, c = Math.cos(-ang), s = Math.sin(-ang);
  g.save(); g.rotate(ang); drawHull(g, d, owner, localLight(ang), moving ? Math.floor(t * 12) & 1 : 0, [(SUN.sx * c - SUN.sy * s) * so, (SUN.sx * s + SUN.sy * c) * so]); g.restore();
  g.save(); g.rotate(tang); drawTurret(g, d.w, owner, TURRET_SC[d.c] || 1, localLight(tang), true); g.restore();
}

/* ---------- relitti ---------- */
// Scafo bruciato (dal bruciato al nero mentre il fuoco si spegne, braci che pulsano), anello della torretta vuoto;
// la torretta sbalzata vola (ombra a terra che si allarga con la quota, gira su sé stessa) e ricade accanto.
// TF: trasformazione del mondo del fotogramma [scala, scostamento x, scostamento y]. lo: versione semplice.
export function drawWreck(g, w, t, TF, lo) {
  const S0 = TF[0], c = clamp((w.t - w.life * 0.12) / (w.life * 0.4), 0, 1);
  const fade = w.t > w.life * 0.6 ? 1 - (w.t - w.life * 0.6) / (w.life * 0.4) : 1;
  const ca = Math.cos(w.a), sa = Math.sin(w.a);
  g.setTransform(S0 * ca, S0 * sa, -S0 * sa, S0 * ca, S0 * w.x + TF[1], S0 * w.y + TF[2]); g.globalAlpha = fade;
  if (!lo) { g.fillStyle = 'rgba(10,9,7,0.5)'; g.beginPath(); g.ellipse(2, 2, w.L * 0.65 + 3, w.W * 0.65 + 3, 0, 0, 7); g.fill(); }
  g.fillStyle = '#16140f';
  if (w.tr) { g.fillRect(-w.L / 2 - 1, -w.W / 2 - 3, w.L + 2, 4); g.fillRect(-w.L / 2 - 1, w.W / 2 - 1, w.L + 2, 4); }
  else for (const sx of [-w.L / 2 + 1, w.L / 2 - 6]) { g.fillRect(sx, -w.W / 2 - 2, 5, 3); g.fillRect(sx, w.W / 2 - 1, 5, 3); }
  const v = Math.round(70 - 50 * c), hex = `#${[v, v * 0.82 | 0, v * 0.64 | 0].map(n => n.toString(16).padStart(2, '0')).join('')}`;
  if (lo) { g.fillStyle = hex; g.fillRect(-w.L / 2, -w.W / 2, w.L, w.W); }
  else bevelBox(g, -w.L / 2, -w.W / 2, w.L, w.W, 2, hex, localLight(w.a));
  g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(-w.L / 2 + 2, -1.5, w.L * 0.55, 1.4);
  if (w.tl) { g.beginPath(); g.arc(0, 0, 4.5, 0, 7); g.fill(); }
  if (w.t < w.life * 0.3) {
    const h = 1 - w.t / (w.life * 0.3);
    g.fillStyle = '#ff8a3a'; g.globalAlpha = fade * h * (0.6 + 0.4 * Math.sin(t * 9 + w.ph));
    g.beginPath(); g.arc(-1, 1, 1.6, 0, 7); g.arc(3, -1, 1.1, 0, 7); g.arc(-w.L * 0.3, 0, 1, 0, 7); g.fill();
  }
  g.globalAlpha = fade;
  if (w.tl) {
    const f = w.fly, ft = f ? Math.min(w.t, f.dur) : 0, z = f && w.t < f.dur ? f.vz * ft - 170 * ft * ft : 0;
    const tx = w.x + ca * w.tx + (f ? f.vx * ft : 0), ty = w.y + sa * w.tx + (f ? f.vy * ft : 0), ta = w.a + w.ta + (f ? f.spin * ft : 0), sc = 1 + Math.max(0, z) / 110;
    g.setTransform(S0, 0, 0, S0, TF[1], TF[2]);
    if (z > 0.5) { g.fillStyle = `rgba(0,0,0,${(0.35 - z / 600).toFixed(3)})`; g.beginPath(); g.ellipse(tx, ty, 5, 4, 0, 0, 7); g.fill(); }
    const tc = Math.cos(ta) * S0 * sc, ts = Math.sin(ta) * S0 * sc;
    g.setTransform(tc, ts, -ts, tc, S0 * tx + TF[1], S0 * (ty - Math.max(0, z)) + TF[2]);
    g.fillStyle = '#121110'; g.fillRect(2, -0.9, w.tl, 1.8);
    g.fillStyle = `rgb(${v * 0.8 | 0},${v * 0.7 | 0},${v * 0.6 | 0})`; rr(g, -4.5, -3.8, 9, 7.6, 1.8); g.fill();
    if (!lo) { g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 0.6; g.stroke(); }
  }
  g.globalAlpha = 1; g.setTransform(S0, 0, 0, S0, TF[1], TF[2]);
}
