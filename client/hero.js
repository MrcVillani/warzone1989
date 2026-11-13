// La «Macchina di Villo» (solo campagna): una berlina a tre volumi grigio metallizzato vista dall'alto, disegnata da
// zero, senza stemmi né scritte. La carrozzeria si cuoce per direzione come le altre sagome (stessa cache di
// vehicles.js) e sale di grado restando grigia: strisce da corsa, poi fiamme e cromature, poi alettone, bordi dorati,
// neon e doppio scarico. Le parti vive si disegnano a ogni fotogramma: ruote che sterzano, bagagliaio che si apre con
// l'impianto stereo, coni che pulsano, coda di volpe, scintillio.
// Arma «Bassi a palla» (eventi fx del motore con hero: true): onde sonore che corrono dal bagagliaio al bersaglio,
// poi un'esplosione speciale (anelli d'urto colorati, colonna di fuoco, fulmini, detriti, cratere grande, scossa);
// il colpo grosso (big: true) ha in più scoppi secondari, fungo alto e un lampo che illumina tutta la visuale, di
// notte tutta la scena. Rispetta qualità e «riduci movimento» (niente scossa né lampo a tutto schermo; in minima
// anelli, fulmini e palla di fuoco soltanto). Solo disegno: i danni li fa il motore.
import { P, S, ent, clamp } from '../engine/index.js';
import { fxs, PAL, reducedMotion } from './state.js';
import { fxq } from './quality.js';
import { HERO_L, HERO_WD } from './dims.js';
import { bakeSprite, bucket, drawBlob, roundRect as rr, localLight, shade, liveryRoom, spriteBusy, hasSprite } from './vehicles.js';
import { flame, chromePipe, STYLE, drawNeon, drawTail, drawSparkle } from './livery.js';
import { addP, shake, dens, nearView, seenAt, clock } from './effects.js';
import { makeFireball, poseOf } from './anim.js';
import { craterMark, scorchMark, skidMark } from './decals.js';
import { glow, GLOW, GLOW_W, FB } from './light.js';
import { SUN, WIND } from './look.js';
import { sfx } from './audio.js';

const HX = HERO_L / 2, HY = HERO_WD / 2, GREY = '#9aa1a7';
// Posizione delle ruote (centro) e del bagagliaio nel riferimento della macchina (muso verso +x).
const WHEEL_X = [8.4, -8.2], WHEEL_Y = 5.75, TRUNK = [-13, -8.3];

/* ---------- carrozzeria ---------- */
function bodyPath(g) {
  g.beginPath(); g.moveTo(-HX, -4.4);
  g.quadraticCurveTo(-HX, -HY + 0.2, -11.4, -HY + 0.1); g.lineTo(-4, -HY); g.lineTo(5, -HY);
  g.quadraticCurveTo(10.2, -HY + 0.1, 11.8, -5.5); g.quadraticCurveTo(HX, -4.8, HX, -3);
  g.lineTo(HX, 3); g.quadraticCurveTo(HX, 4.8, 11.8, 5.5); g.quadraticCurveTo(10.2, HY - 0.1, 5, HY);
  g.lineTo(-4, HY); g.lineTo(-11.4, HY - 0.1); g.quadraticCurveTo(-HX, HY - 0.2, -HX, 4.4); g.closePath();
}
function glass(g, pts, ll) {
  const gr = g.createLinearGradient(pts[0][0], -5, pts[2][0], 5); gr.addColorStop(0, '#18222b'); gr.addColorStop(1, '#33434f');
  g.fillStyle = gr; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill();
}
// Carrozzeria rivolta verso +x, senza ruote (si disegnano vive, sotto). ll: luce locale; sh: spostamento dell'ombra
// (null = senza ombre); rank, lite: livrea del grado.
function drawCar(g, owner, ll, sh, rank, lite) {
  const col = PAL[owner], st = STYLE[owner === P ? 0 : 1], coat = rank > 0 && !lite;
  if (sh) {
    if (sh[0] || sh[1]) drawBlob(g, -HX + sh[0], -HY + sh[1], HERO_L, HERO_WD, 3.5, 2.2, 0.5);
    drawBlob(g, -HX - 0.6 + sh[0] * 0.25, -HY - 0.6 + sh[1] * 0.25, HERO_L + 1.2, HERO_WD + 1.2, 3, 0.8, 0.55);
  }
  // scocca: grigio metallizzato, più chiaro sul fianco verso la luce e lungo le spalle
  const kt = 0.8 - 0.2 * ll[1], kb = 0.8 + 0.2 * ll[1];
  const gr = g.createLinearGradient(0, -HY, 0, HY);
  gr.addColorStop(0, shade(GREY, kt * 0.8)); gr.addColorStop(0.14, shade(GREY, kt * 1.22)); gr.addColorStop(0.5, shade(GREY, 1.02));
  gr.addColorStop(0.86, shade(GREY, kb * 1.22)); gr.addColorStop(1, shade(GREY, kb * 0.8));
  bodyPath(g); g.fillStyle = gr; g.fill();
  g.save(); bodyPath(g); g.clip();
  // riflesso metallizzato in diagonale verso la luce, e brillantini
  const sg = g.createLinearGradient(-ll[0] * HX, -ll[1] * HY * 2, ll[0] * HX, ll[1] * HY * 2), a = rank >= 3 && !lite ? 1.5 : 1;
  sg.addColorStop(0, `rgba(0,0,0,${0.16 * a})`); sg.addColorStop(0.4, 'rgba(255,255,255,0)'); sg.addColorStop(0.6, `rgba(255,255,255,${0.34 * a})`);
  sg.addColorStop(0.7, 'rgba(255,255,255,0.03)'); sg.addColorStop(0.88, `rgba(255,255,255,${0.2 * a})`); sg.addColorStop(1, 'rgba(255,255,255,0.05)');
  g.fillStyle = sg; g.fillRect(-HX, -HY, HERO_L, HERO_WD);
  // paraurti più scuri, calandra tra i fari, linee del cofano e del bagagliaio
  g.fillStyle = 'rgba(30,34,38,0.55)'; g.fillRect(HX - 0.7, -HY, 0.7, HERO_WD); g.fillRect(-HX, -HY, 0.6, HERO_WD);
  g.fillStyle = '#23272b'; g.fillRect(HX - 1.5, -2.7, 0.9, 5.4);
  g.strokeStyle = 'rgba(28,32,36,0.5)'; g.lineWidth = 0.3; g.beginPath();
  g.moveTo(5.4, -4.9); g.quadraticCurveTo(10.5, -4.6, 12.2, -3.2); g.moveTo(5.4, 4.9); g.quadraticCurveTo(10.5, 4.6, 12.2, 3.2);
  g.moveTo(TRUNK[0] + 0.2, -4.9); g.lineTo(TRUNK[1], -4.9); g.moveTo(TRUNK[0] + 0.2, 4.9); g.lineTo(TRUNK[1], 4.9); g.moveTo(TRUNK[0] + 0.2, -4.9); g.lineTo(TRUNK[0] + 0.2, 4.9);
  g.stroke();
  if (coat) {
    // due strisce da corsa del colore del lato, dal muso alla coda
    g.fillStyle = 'rgba(24,20,14,0.8)'; g.fillRect(-HX, -1.95, HERO_L, 3.9);
    g.fillStyle = shade(col.body, 1.18); g.fillRect(-HX, -1.7, HERO_L, 1.35); g.fillRect(-HX, 0.35, HERO_L, 1.35);
    if (rank >= 2) {
      // fiamme sul cofano e lungo i fianchi, dal muso verso l'abitacolo (d'oro per l'asso)
      const pal = rank >= 3 ? st.ace : st.flame;
      for (const s of [1, -1]) {
        const fg = g.createLinearGradient(HX - 1, 0, HX - 15, 0); fg.addColorStop(0, pal[0]); fg.addColorStop(0.45, pal[1]); fg.addColorStop(1, pal[2]);
        flame(g, HX - 1.4, 15, s * HY, s, 3.6); g.fillStyle = fg; g.fill(); g.strokeStyle = rank >= 3 ? st.aceEdge : st.flameEdge; g.lineWidth = 0.4; g.stroke();
        flame(g, HX - 1.4, 8, s * HY, s, 1.8); g.fillStyle = pal[0]; g.globalAlpha = 0.8; g.fill(); g.globalAlpha = 1;
      }
    }
  }
  g.restore();
  // abitacolo: vetri (parabrezza, lunotto, finestrini) e tetto; montanti del colore della scocca
  glass(g, [[5.2, -4.9], [2, -5.25], [-5.2, -5.25], [-7.9, -4.7], [-7.9, 4.7], [-5.2, 5.25], [2, 5.25], [5.2, 4.9]], ll);
  const rg = g.createLinearGradient(0, -4.2, 0, 4.2); rg.addColorStop(0, shade(GREY, kt * 1.25)); rg.addColorStop(0.5, shade(GREY, 1.08)); rg.addColorStop(1, shade(GREY, kb * 1.25));
  g.fillStyle = rg; rr(g, -5.5, -4.2, 7.6, 8.4, 1.3); g.fill();
  g.strokeStyle = shade(GREY, 0.95); g.lineWidth = 0.55; g.beginPath();
  for (const s of [-1, 1]) { g.moveTo(2, s * 4.1); g.lineTo(5.1, s * 4.9); g.moveTo(-5.3, s * 4.1); g.lineTo(-7.8, s * 4.7); g.moveTo(-1.7, s * 4.2); g.lineTo(-1.7, s * 5.3); }
  g.stroke();
  // riflessi sui vetri verso la luce
  g.fillStyle = 'rgba(214,232,242,0.5)';
  g.beginPath(); g.moveTo(4.9, -3.6); g.lineTo(2.5, -3.1); g.lineTo(2.5, -1); g.lineTo(4.6, -1.2); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(-7.6, 0.6); g.lineTo(-5.8, 0.5); g.lineTo(-5.8, 3); g.lineTo(-7.5, 3.4); g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.3)'; rr(g, -4.6 + ll[0] * 0.8, -3.3 + ll[1] * 1.2, 5.6, 2.2, 1); g.fill();
  // porte (quattro) e maniglie sui fianchi, specchietti
  g.strokeStyle = 'rgba(24,28,32,0.6)'; g.lineWidth = 0.28; g.beginPath();
  for (const s of [-1, 1]) for (const x of [3.6, -1.7, -6.6]) { g.moveTo(x, s * 5.3); g.lineTo(x, s * HY); }
  g.stroke();
  g.fillStyle = '#23272b'; for (const s of [-1, 1]) { g.fillRect(-0.2, s * 5.75 - 0.15, 1.1, 0.3); g.fillRect(-5.2, s * 5.75 - 0.15, 1.1, 0.3); }
  for (const s of [-1, 1]) { g.fillStyle = shade(GREY, 0.82); rr(g, 3.5, s > 0 ? HY - 0.2 : -HY - 1, 1.7, 1.2, 0.5); g.fill(); g.fillStyle = '#1c242b'; g.fillRect(3.5, s > 0 ? HY + 0.5 : -HY - 0.8, 0.5, 0.3); }
  // fari e fanali, targa bianca senza scritte
  for (const s of [-1, 1]) {
    g.fillStyle = '#f5f1dc'; rr(g, HX - 1.8, s * 4.3 - 1.15, 1.4, 2.3, 0.5); g.fill(); g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(HX - 1.5, s * 4.3 - 0.5, 0.5, 0.6);
    g.fillStyle = '#b3241c'; rr(g, -HX + 0.1, s * 4.2 - 1.3, 1, 2.6, 0.4); g.fill(); g.fillStyle = '#ff6a52'; g.fillRect(-HX + 0.3, s * 4.2 - 0.6, 0.45, 1.2);
  }
  g.fillStyle = '#e8e6da'; g.fillRect(-HX - 0.05, -1.2, 0.5, 2.4);
  // colore del lato: fascia di riconoscimento sul cofano (come sui carri) e banda sul tetto
  g.fillStyle = shade(col.body, 1.15); g.fillRect(-4.9, -4.2, 1.5, 8.4);
  g.fillStyle = 'rgba(20,16,10,0.55)'; g.fillRect(-5.05, -4.2, 0.15, 8.4); g.fillRect(-3.4, -4.2, 0.15, 8.4);
  const band = () => { g.beginPath(); g.moveTo(9.8, -2.1); g.lineTo(11.4, 0); g.lineTo(9.8, 2.1); g.lineTo(8.7, 2.1); g.lineTo(10.3, 0); g.lineTo(8.7, -2.1); g.closePath(); };
  band(); g.strokeStyle = owner === P ? 'rgba(40,24,6,0.75)' : 'rgba(240,236,228,0.75)'; g.lineWidth = 0.45; g.stroke();
  g.fillStyle = owner === P ? '#f6e7c0' : '#1e1a18'; g.fill();
  if (rank <= 0) return;
  if (lite) { if (rank >= 3) { bodyPath(g); g.strokeStyle = st.trim; g.lineWidth = 0.7; g.stroke(); } return; }
  // fari supplementari gialli
  for (const s of [-1, 1]) { g.fillStyle = '#23272b'; g.beginPath(); g.arc(HX - 0.5, s * 1.9, 0.95, 0, 7); g.fill(); g.fillStyle = st.fog; g.beginPath(); g.arc(HX - 0.5, s * 1.9, 0.68, 0, 7); g.fill(); }
  if (rank >= 2) {
    // cromature: paraurti, cornici dei vetri, calotte degli specchietti; scarico più grosso
    g.strokeStyle = '#f2f5f7'; g.lineWidth = 0.4; g.beginPath();
    g.moveTo(5.2, -4.9); g.lineTo(2, -5.25); g.lineTo(-5.2, -5.25); g.lineTo(-7.9, -4.7); g.moveTo(5.2, 4.9); g.lineTo(2, 5.25); g.lineTo(-5.2, 5.25); g.lineTo(-7.9, 4.7);
    g.moveTo(HX - 0.25, -3); g.lineTo(HX - 0.25, 3); g.moveTo(-HX + 0.2, -3.2); g.lineTo(-HX + 0.2, 3.2); g.stroke();
    for (const s of [-1, 1]) { g.fillStyle = '#eef2f5'; g.fillRect(3.9, s > 0 ? HY + 0.05 : -HY - 0.95, 1.2, 0.9); }
    if (rank === 2) { g.fillStyle = '#62666b'; rr(g, -HX - 1.9, 2.7, 2.6, 1.7, 0.7); g.fill(); g.fillStyle = '#0f0e0c'; g.beginPath(); g.ellipse(-HX - 1.5, 3.55, 0.45, 0.6, 0, 0, 7); g.fill(); }
  }
  if (rank >= 3) {
    // doppio scarico cromato, alettone sul bagagliaio con le paratie dorate, bordo dorato della scocca
    chromePipe(g, -HX - 2.3, 2.6, 3, 1.5); chromePipe(g, -HX - 2.3, 4.3, 3, 1.5);
    bodyPath(g); g.strokeStyle = st.trimLo; g.lineWidth = 0.85; g.stroke(); g.strokeStyle = st.trim; g.lineWidth = 0.45; g.stroke();
    spoiler(g, st, -HX + 0.2, 1);
  }
}
// Alettone: ala scura con il filo di luce e le paratie dorate, e la sua ombra. x: bordo dietro; k: quanto è lunga
// l'ala vista dall'alto (1 a bagagliaio chiuso; meno quando il cofano del bagagliaio è alzato).
function spoiler(g, st, x, k) {
  const w = 2.6 * k;
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + 0.7, -HY + 0.2, w, HERO_WD + 0.6);
  g.fillStyle = '#2b2f33'; rr(g, x, -HY - 0.5, w, HERO_WD + 1, 0.6); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(x + w * 0.45, -HY - 0.2, 0.45, HERO_WD + 0.4);
  g.fillStyle = st.trim; g.fillRect(x - 0.2, -HY - 0.8, w + 0.4, 0.9); g.fillRect(x - 0.2, HY - 0.1, w + 0.4, 0.9);
}
const lvKey = (rank, lite) => (!(rank > 0) || (lite && rank < 3) ? '' : `:r${Math.min(3, rank)}${lite ? 'l' : ''}`);
// Sagoma cotta della carrozzeria (luce per una di aq direzioni, come gli scafi).
export function heroSprite(owner, ang, k, aq, night, rank = 0, lite = false) {
  const b = bucket(ang, aq), L0 = lvKey(rank, lite), key = `V${owner}:${aq}.${b}:${k}:${night ? 1 : 0}${L0}`;
  if (!hasSprite(key)) {
    if (L0 && spriteBusy() && hasSprite(`V${owner}:${aq}.${b}:${k}:${night ? 1 : 0}`)) return heroSprite(owner, ang, k, aq, night);
    if (L0) liveryRoom(key);
  }
  const aB = b / aq * Math.PI * 2, ll = localLight(aq > 1 ? aB : 0), so = aq > 1 ? 4 * SUN.len : 0, c = Math.cos(-aB), s = Math.sin(-aB);
  const sh = [(SUN.sx * c - SUN.sy * s) * so, (SUN.sx * s + SUN.sy * c) * so], m = so ? 3.5 : 1;
  const box = [-HX - 2.6 + Math.min(0, sh[0]) - m, -HY - 1.4 + Math.min(0, sh[1]) - m, HX + 0.6 + Math.max(0, sh[0]) + m, HY + 1.4 + Math.max(0, sh[1]) + m];
  return bakeSprite(key, box, k, night, owner, (g, shadow) => drawCar(g, owner, ll, shadow ? sh : null, L0 ? rank : 0, lite));
}
// La macchina disegnata direttamente (pannello, tavole): ruote, carrozzeria e, se open > 0, il bagagliaio aperto.
export function drawHeroIcon(g, owner, ang, rank = 0, open = 0, t = 0) {
  const so = 4 * SUN.len, c = Math.cos(-ang), s = Math.sin(-ang);
  g.save(); g.rotate(ang);
  wheels(g, 0, rank >= 2);
  drawCar(g, owner, localLight(ang), [(SUN.sx * c - SUN.sy * s) * so, (SUN.sx * s + SUN.sy * c) * so], rank, false);
  if (open > 0) trunk(g, owner, open, t, rank, 0.5);
  g.restore();
}

// Relitto della macchina: la stessa sagoma, bruciata (dal bruno al nero mentre il fuoco si spegne), vetri sfondati,
// braci che pulsano; quello di un asso conserva alettone e bordo dorato. Stessi parametri di drawWreck (vehicles.js).
export function drawHeroWreck(g, w, t, TF, lo) {
  const S0 = TF[0], c = clamp((w.t - w.life * 0.12) / (w.life * 0.4), 0, 1), fade = w.t > w.life * 0.6 ? 1 - (w.t - w.life * 0.6) / (w.life * 0.4) : 1;
  const ca = Math.cos(w.a), sa = Math.sin(w.a), st = STYLE[w.owner === P ? 0 : 1];
  g.setTransform(S0 * ca, S0 * sa, -S0 * sa, S0 * ca, S0 * w.x + TF[1], S0 * w.y + TF[2]); g.globalAlpha = fade;
  if (!lo) { g.fillStyle = 'rgba(10,9,7,0.5)'; g.beginPath(); g.ellipse(2, 2, HX + 4, HY + 4, 0, 0, 7); g.fill(); }
  g.fillStyle = '#131210'; for (const s of [-1, 1]) for (const x of WHEEL_X) g.fillRect(x - 2.3, s * WHEEL_Y - 1.2, 4.6, 2.4);
  const v = Math.round(86 - 58 * c);
  bodyPath(g); g.fillStyle = `rgb(${v},${v * 0.9 | 0},${v * 0.82 | 0})`; g.fill();
  if (!lo) { g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 0.6; g.stroke(); }
  g.fillStyle = 'rgba(8,8,8,0.8)'; g.beginPath(); g.moveTo(5.2, -4.9); g.lineTo(2, -5.25); g.lineTo(-5.2, -5.25); g.lineTo(-7.9, -4.7); g.lineTo(-7.9, 4.7); g.lineTo(-5.2, 5.25); g.lineTo(2, 5.25); g.lineTo(5.2, 4.9); g.closePath(); g.fill();
  g.fillStyle = `rgb(${v * 0.8 | 0},${v * 0.72 | 0},${v * 0.66 | 0})`; rr(g, -5.2, -3.9, 7, 7.8, 1.2); g.fill();
  g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(TRUNK[0] + 0.5, -4.4, 3.6, 8.8); g.fillRect(7, -3.6, 4.4, 2.2);
  if (w.rank >= 3 && !lo) { bodyPath(g); g.strokeStyle = st.trimLo; g.lineWidth = 0.6; g.stroke(); spoiler(g, st, -HX + 0.2, 1); }
  const bf = w.life * (w.burn || 0.3);
  if (w.t < bf) { g.fillStyle = '#ff8a3a'; g.globalAlpha = fade * (1 - w.t / bf) * (0.6 + 0.4 * Math.sin(t * 9 + w.ph)); g.beginPath(); g.arc(8, 1, 1.8, 0, 7); g.arc(-2, -1, 1.3, 0, 7); g.arc(-10, 1, 1.1, 0, 7); g.fill(); }
  g.globalAlpha = 1; g.setTransform(S0, 0, 0, S0, TF[1], TF[2]);
}

/* ---------- parti vive ---------- */
// Ruote sotto la carrozzeria (sporgono appena dai passaruota): le anteriori sterzano. chrome: cerchi cromati.
function wheels(g, steer, chrome) {
  for (const s of [-1, 1]) for (let i = 0; i < 2; i++) {
    g.save(); g.translate(WHEEL_X[i], s * WHEEL_Y); if (!i && steer) g.rotate(steer);
    g.fillStyle = '#17181a'; rr(g, -2.3, -1.15, 4.6, 2.3, 0.8); g.fill();
    if (chrome) { g.fillStyle = '#e9edf0'; g.fillRect(-1.2, s > 0 ? 0.75 : -1.15, 2.4, 0.4); }
    g.restore();
  }
}
// Bagagliaio aperto (open 0–1): vano scuro con l'impianto (due coni grandi che pulsano con beat 0–1, due piccoli,
// amplificatore con le spie), cofano alzato visto di scorcio, con l'alettone dell'asso sul bordo.
function trunk(g, owner, open, t, rank, beat) {
  const x0 = TRUNK[0], x1 = TRUNK[1], st = STYLE[owner === P ? 0 : 1], [nr, ng, nb] = st.neon;
  g.globalAlpha = Math.min(1, open * 1.6);
  g.fillStyle = '#0c0d0f'; rr(g, x0 + 0.3, -4.8, x1 - x0 - 0.5, 9.6, 0.8); g.fill();
  g.fillStyle = '#25282c'; g.fillRect(x1 - 1.5, -3.6, 1, 7.2);
  for (let i = 0; i < 4; i++) { g.fillStyle = (Math.floor(t * 9) + i) % 3 ? (i % 2 ? '#3ad26a' : '#ffb43a') : '#1c1f22'; g.fillRect(x1 - 1.25, -2.9 + i * 1.7, 0.5, 0.7); }
  for (const s of [-1, 1]) {
    const cx = x0 + 2.35, cy = s * 2.45, r = 1.95 * (1 + 0.14 * beat * Math.sin(t * 38 + s));
    g.fillStyle = '#1a1c1f'; g.beginPath(); g.arc(cx, cy, 2.2, 0, 7); g.fill();
    g.strokeStyle = `rgba(${nr},${ng},${nb},${0.5 + 0.5 * beat})`; g.lineWidth = 0.45; g.beginPath(); g.arc(cx, cy, 2.15, 0, 7); g.stroke();
    const cg = g.createRadialGradient(cx, cy, 0.2, cx, cy, r); cg.addColorStop(0, '#6c7278'); cg.addColorStop(0.35, '#2c3035'); cg.addColorStop(0.8, '#4a5056'); cg.addColorStop(1, '#17191b');
    g.fillStyle = cg; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
    g.fillStyle = '#9aa1a7'; g.beginPath(); g.arc(cx, cy, 0.55 + 0.2 * beat, 0, 7); g.fill();
    g.fillStyle = '#3a3f44'; g.beginPath(); g.arc(x1 - 2.6, s * 3.9, 0.6, 0, 7); g.fill();
  }
  // cofano alzato: più corto visto dall'alto, chiaro perché prende la luce
  const len = (x1 - x0) * (1 - 0.72 * open);
  g.globalAlpha = 1;
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x1 - len - 0.5, -5, 0.6, 10);
  g.fillStyle = shade(GREY, 1.18 + 0.1 * open); rr(g, x1 - len, -5, len, 10, 0.6); g.fill();
  g.fillStyle = shade(PAL[owner].body, 1.18); if (rank > 0) { g.fillRect(x1 - len, -1.7, len, 1.35); g.fillRect(x1 - len, 0.35, len, 1.35); }
  if (rank >= 3) spoiler(g, st, x1 - len - 0.6, Math.max(0.35, 1 - 0.6 * open));
}
// Stato della macchina in campo: bagagliaio (open 0–1, hold: secondi ancora aperto), battito dei coni, sgommata.
const car = { open: 0, hold: 0, beat: 0, slowT: 1, burn: 0, lx: 0, ly: 0, steer: 0, shots: 0, bigs: 0, burnouts: 0 };
// Disegna la Macchina di Villo. tf: trasformazione del mondo; v: assetto (anim.js); o: { k, aq, night, lite, rm, run,
// dt, ct, neon }.
export function drawHero(g, u, v, tf, o) {
  const sc = tf[0], rank = u.rank || 0, ca = Math.cos(v.a), sa = Math.sin(v.a), ex = sc * v.x + tf[1], ey = sc * v.y + tf[2];
  // sterzo: le ruote davanti girano verso dove la macchina sta curvando
  let da = u.ang - v.a; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
  car.steer += (clamp(da * 2.2, -0.55, 0.55) - car.steer) * Math.min(1, o.dt * 10);
  if (o.run) burnout(u, v, o);
  g.setTransform(ca * sc, sa * sc, -sa * sc, ca * sc, ex, ey);
  if (rank >= 3 && !o.lite) drawNeon(g, u.owner, HERO_L, HERO_WD, o.night ? 1 : 0.6);
  wheels(g, o.rm ? 0 : car.steer, rank >= 2 && !o.lite);
  const h = heroSprite(u.owner, v.a, o.k, o.aq, o.night, rank, o.lite);
  g.drawImage(h.c, h.x, h.y, h.w, h.h);
  if (car.open > 0.02) trunk(g, u.owner, car.open, o.ct, o.lite ? 0 : rank, o.rm ? 0.3 : car.beat);
  if (rank >= 2 && !o.lite) {
    // coda di volpe sull'antenna del parafango dietro: segue la corsa e sventola
    g.strokeStyle = '#1c1f22'; g.lineWidth = 0.3; g.beginPath(); g.moveTo(-10.6, -HY + 0.9); g.lineTo(-12.4, -HY - 1.6); g.stroke();
    drawTail(g, -12.4, -HY - 1.6, Math.PI + 0.25 + (o.rm ? 0 : Math.sin(o.ct * (v.spd > 8 ? 13 : 3.2)) * (v.spd > 8 ? 0.28 : 0.4)), 5.4);
  }
  if (rank >= 3 && !o.lite && !o.rm) { const ph = (o.ct * 0.5) % 1; if (ph < 0.16) { const i = Math.floor(o.ct * 0.5) % 4; drawSparkle(g, [9, -1, -10, 4][i], [3.5, -3, 2, -5][i], 4.2, Math.sin(ph / 0.16 * Math.PI)); } }
}
// Sgommata: la macchina parte da ferma. Fumo bianco dalle ruote dietro, segni di gomma a terra (anche sull'asfalto),
// stridio.
function burnout(u, v, o) {
  if (v.spd < 5) car.slowT += o.dt;
  else if (car.slowT > 0.5 && v.acc > 25) { car.slowT = 0; car.burn = 0.6; car.lx = v.x; car.ly = v.y; car.burnouts++; sfx('skid', v.x, v.y, u.owner); }
  else if (v.spd > 20) car.slowT = 0;
  if (car.burn <= 0) return;
  car.burn -= o.dt;
  const c = Math.cos(v.a), s = Math.sin(v.a), q = dens();
  if (Math.hypot(v.x - car.lx, v.y - car.ly) > 1.5) { skidMark(car.lx, car.ly, v.x, v.y, v.a, WHEEL_X[1], WHEEL_Y); car.lx = v.x; car.ly = v.y; }
  if (o.rm) return;
  for (const sd of [-1, 1]) if (Math.random() < o.dt * 50 * q) addP('exh', v.x + c * WHEEL_X[1] - s * sd * WHEEL_Y, v.y + s * WHEEL_X[1] + c * sd * WHEEL_Y, -c * 26 + (Math.random() - 0.5) * 16, -s * 26 + (Math.random() - 0.5) * 16 - 4, 0.7 + Math.random() * 0.5, 2.6 + Math.random() * 1.6);
}

/* ---------- Bassi a palla ---------- */
// Effetti in corso: onde sonore, anelli, fulmini, colonna di fuoco, lampo. pending: esplosioni che partono quando le
// onde arrivano sul bersaglio, e gli scoppi secondari del colpo grosso.
const hfx = [], pending = [];
const MAX_HFX = 70, WAVE_S = 0.13;
const heroUnit = () => (S && S.hero && S.hero.id ? ent(S.hero.id) : null) || (S ? S.ents.find(e => e.hero && !e.dead) : null) || null;
export function resetHero() { hfx.length = 0; pending.length = 0; Object.assign(car, { open: 0, hold: 0, beat: 0, slowT: 1, burn: 0, steer: 0, shots: 0, bigs: 0, burnouts: 0 }); }
// Eventi fx del motore con hero: true. Restituisce true se l'evento è stato gestito qui (non serve l'effetto di
// serie). flash: {x, y, tx, ty, big}; boom: {x, y, size, big}.
export function heroFx(e) {
  if (!e || !e.hero) return false;
  if (e.k === 'flash') {
    const u = heroUnit(), v = u && poseOf(u.id), x = v ? v.x : u ? u.x : e.x, y = v ? v.y : u ? u.y : e.y;
    car.open = Math.max(car.open, 0.01); car.hold = 1.5; car.beat = 1; car.shots++; if (e.big) car.bigs++;
    if (e.tx != null && nearView((x + e.tx) / 2, (y + e.ty) / 2, 300) && hfx.length < MAX_HFX) {
      const L = e.big ? 0.42 : 0.32;
      hfx.push({ k: 'wave', x1: x, y1: y, x2: e.tx, y2: e.ty, life: L, max: L, big: !!e.big });
    }
    return true;
  }
  if (e.k === 'boom') {
    if (!(e.owner === P || seenAt(e.x, e.y))) return true;
    if (pending.length < 14) pending.push({ t: WAVE_S, x: e.x, y: e.y, big: !!e.big });
    return true;
  }
  return false;
}
// Avanza gli effetti (tempo di gioco, come le altre particelle).
export function updHero(dt) {
  if (car.hold > 0) { car.hold -= dt; car.open = Math.min(1, car.open + dt / 0.16); } else if (car.open > 0) car.open = Math.max(0, car.open - dt / 0.35);
  car.beat = Math.max(0, car.beat - dt / 0.5);
  let j = 0; for (const f of hfx) { f.life -= dt; if (f.life > 0) hfx[j++] = f; } hfx.length = j;
  j = 0; for (const p of pending) { p.t -= dt; if (p.t > 0) pending[j++] = p; else if (p.sub) subBlast(p); else blast(p.x, p.y, p.big); } pending.length = j;
}
const push = f => { if (hfx.length < MAX_HFX) hfx.push(f); };
// Colori degli anelli e dei fulmini: bianco caldo, azzurro elettrico, magenta.
const RING = ['255,246,214', '120,226,255', '255,96,214'];
// Esplosione speciale. In qualità minima: anelli, due fulmini e palla di fuoco; con «riduci movimento» niente scossa,
// niente lampo a tutto schermo e meno particelle.
function blast(x, y, big) {
  const lvl = fxq.level, rm = reducedMotion(), q = dens(), Q = fxq.q, fx = fxs.fx, size = big ? 2.4 : 1.5, busy = hfx.length > MAX_HFX * 0.6;
  shake(x, y, big ? 9 : 4.5);
  if (!nearView(x, y, big ? 420 : 220)) return;
  craterMark(x, y, big ? 34 : 22); scorchMark(x, y, big ? 50 : 30, 0.4);
  // anelli d'urto colorati, uno dopo l'altro
  for (let i = 0, n = big ? 5 : 3; i < n; i++) push({ k: 'ring', x, y, life: 0.5 + i * 0.09, max: 0.5 + i * 0.09, d: i * 0.09, s: (big ? 120 : 70) * (1 - i * 0.12), c: RING[i % 3] });
  // fulmini che partono dal centro
  if (!busy || big) for (let i = 0, n = lvl === 0 ? 2 : big ? 9 : 5; i < n; i++) { const L = 0.26 + Math.random() * (big ? 0.3 : 0.14); push({ k: 'bolt', x, y, a: i / n * 6.283 + Math.random() * 0.6, r: (big ? 110 : 62) * (0.6 + Math.random() * 0.5), life: L, max: L, c: RING[1 + (i & 1)] }); }
  const L0 = 0.2 + 0.08 * size;
  fx.push({ k: 'light', x, y, life: L0, max: L0, s: 30 * size });
  if (Q.glow) fx.push({ k: 'flashW', x, y, life: 0.16, max: 0.16, s: 16 * size });
  fx.push(makeFireball(x, y, 10 * size, big ? 1.5 : 1, lvl === 0 ? 3 : lvl === 1 ? 5 : big ? 12 : 8));
  if (lvl === 0) { for (let i = 0; i < 4; i++) { const a = Math.random() * 7; addP('fire', x, y, Math.cos(a) * 60, Math.sin(a) * 60, 0.4, 4); } return; }
  // colonna di fuoco che sale
  const cl = big ? 1.25 : 0.8; push({ k: 'col', x, y, life: cl, max: cl, h: big ? 150 : 84, w: big ? 17 : 11 });
  const n = Math.round((big ? 16 : 9) * q);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 7, v = 30 + Math.random() * 110 * size;
    addP('fire', x, y, Math.cos(a) * v, Math.sin(a) * v, 0.35 + Math.random() * 0.4, 2.5 + Math.random() * 3 * size);
    addP('smoke', x + (Math.random() - 0.5) * 14 * size, y + (Math.random() - 0.5) * 14 * size, (Math.random() - 0.5) * 16, -8 - Math.random() * 12, 1.6 + Math.random() * 1.4, 5 + Math.random() * 4 * size);
  }
  for (let i = 0, m = Math.round((big ? 10 : 5) * q); i < m; i++) addP('dsmoke', x + (Math.random() - 0.5) * 12 * size, y + (Math.random() - 0.5) * 12 * size, (Math.random() - 0.5) * 12, -14 - Math.random() * 16, 2.2 + Math.random(), 4 + Math.random() * 3 * Math.sqrt(size));
  // detriti e scintille in ogni direzione, anello di polvere
  for (let i = 0, nd = Math.round((big ? 26 : 13) * q); i < nd; i++) { const a = Math.random() * 7, v = 45 + Math.random() * 130; addP('debris', x, y, Math.cos(a) * v, Math.sin(a) * v, 1.3 + Math.random() * 0.8, 1.5 + Math.random() * 2.2, 70 + Math.random() * 120 * size); }
  for (let i = 0, ns = Math.round((big ? 30 : 16) * q); i < ns; i++) { const a = Math.random() * 7, v = 120 + Math.random() * 220; addP('spark', x, y, Math.cos(a) * v, Math.sin(a) * v, 0.3 + Math.random() * 0.3, 1.4); }
  for (let i = 0, m = Math.round((big ? 26 : 14) * q); i < m; i++) { const a = i / m * 6.283 + Math.random() * 0.3, v = (big ? 120 : 80) + Math.random() * 30; addP('dust', x + Math.cos(a) * 8, y + Math.sin(a) * 6, Math.cos(a) * v, Math.sin(a) * v * 0.8, 1 + Math.random() * 0.6, 5 + Math.random() * 3); }
  if (Q.mush && !rm) { const life = big ? 5.5 : 3.4; fx.push({ k: 'mush', x, y, life, max: life, s: big ? 2.5 : 1.15, ph: Math.random() * 7 }); }
  if (!big) return;
  // colpo grosso: corona di scoppi secondari e lampo che illumina tutta la visuale (di notte tutta la scena)
  if (!busy) for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283 + Math.random() * 0.5, r = 42 + Math.random() * 30; if (pending.length < 14) pending.push({ sub: true, t: 0.12 + i * 0.07, x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * 0.85 }); }
  if (!rm) push({ k: 'flash', x, y, life: 0.55, max: 0.55 });
}
function subBlast(p) {
  if (!nearView(p.x, p.y, 120)) return;
  const lvl = fxq.level;
  fxs.fx.push({ k: 'light', x: p.x, y: p.y, life: 0.2, max: 0.2, s: 26 });
  fxs.fx.push(makeFireball(p.x, p.y, 9, 0.7, lvl <= 1 ? 2 : 4));
  push({ k: 'ring', x: p.x, y: p.y, life: 0.35, max: 0.35, d: 0, s: 34, c: RING[0] });
  for (let i = 0, n = Math.round(4 * dens()); i < n; i++) { const a = Math.random() * 7, v = 40 + Math.random() * 70; addP('debris', p.x, p.y, Math.cos(a) * v, Math.sin(a) * v, 1.1, 1.6, 60 + Math.random() * 60); }
}
// Disegno (fusione additiva): onde sonore, anelli, colonna di fuoco, fulmini.
export function drawHeroFx(g, inView, t) {
  if (!hfx.length) return;
  g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
  for (const f of hfx) {
    const k = f.life / f.max, p = 1 - k;
    if (f.k === 'wave') {
      // fronti d'onda: archi che partono dalla macchina e corrono verso il bersaglio allargandosi
      const dx = f.x2 - f.x1, dy = f.y2 - f.y1, d = Math.hypot(dx, dy) || 1, a = Math.atan2(dy, dx), n = f.big ? 6 : 4;
      for (let i = 0; i < n; i++) {
        const q = p * 1.5 - i * 0.14; if (q <= 0.04 || q >= 1) continue;
        const r = d * q, sp = (f.big ? 0.42 : 0.3) * (1 - 0.45 * q) + 3 / r, al = Math.min(1, (1 - q) * 1.6) * Math.min(1, q * 6);
        g.globalAlpha = al * 0.55; g.strokeStyle = `rgb(${RING[2]})`; g.lineWidth = (f.big ? 4.2 : 3) * (1 - 0.4 * q); g.beginPath(); g.arc(f.x1, f.y1, r, a - sp, a + sp); g.stroke();
        g.globalAlpha = al; g.strokeStyle = `rgb(${RING[1]})`; g.lineWidth = (f.big ? 2 : 1.4); g.beginPath(); g.arc(f.x1, f.y1, r + 1.2, a - sp * 0.9, a + sp * 0.9); g.stroke();
        g.strokeStyle = '#ffffff'; g.lineWidth = 0.7; g.beginPath(); g.arc(f.x1, f.y1, r + 0.6, a - sp * 0.8, a + sp * 0.8); g.stroke();
      }
    } else if (f.k === 'ring') {
      const q = (f.max - f.life - f.d) / (f.max - f.d); if (q <= 0 || !inView(f.x, f.y, f.s * 1.3)) continue;
      const e = 1 - (1 - q) * (1 - q), R = f.s * (0.15 + 1.05 * e);
      g.globalAlpha = (1 - q) * 0.9; g.strokeStyle = `rgb(${f.c})`; g.lineWidth = 1 + 5 * (1 - q); g.beginPath(); g.ellipse(f.x, f.y, R, R * 0.86, 0, 0, 7); g.stroke();
      g.globalAlpha = (1 - q) * 0.35; g.lineWidth = 9 * (1 - q) + 2; g.stroke();
    } else if (f.k === 'col') {
      if (!inView(f.x, f.y - f.h / 2, f.h)) continue;
      // colonna di fuoco: sbuffi impilati che salgono, larga alla base, che si piega appena col vento
      const up = Math.min(1, p / 0.3), fade = k < 0.5 ? k / 0.5 : 1;
      for (let i = 0; i < 9; i++) { const u = i / 8, fl = 0.85 + 0.3 * Math.sin(t * 31 + i * 1.7); glow(g, f.x + WIND.x * 0.3 * u * p + Math.sin(t * 17 + i) * 1.5, f.y - f.h * u * up, f.w * (1.5 - 0.8 * u) * fl, fade * (0.95 - 0.5 * u), u < 0.6 ? FB : GLOW); }
      glow(g, f.x, f.y, f.w * 3.2, fade * 0.7, GLOW_W);
    } else if (f.k === 'bolt') {
      if (!inView(f.x, f.y, f.r)) continue;
      // fulmine: spezzata che trema, con un ramo; alone colorato sotto e anima bianca sopra
      const c = Math.cos(f.a), s = Math.sin(f.a), n = 6, len = f.r * Math.min(1, p * 5 + 0.3);
      g.beginPath(); g.moveTo(f.x, f.y);
      let bx = f.x, by = f.y;
      for (let i = 1; i <= n; i++) { const d = len * i / n, j = (Math.random() - 0.5) * 13; bx = f.x + c * d - s * j; by = f.y + s * d * 0.86 + c * j; g.lineTo(bx, by); if (i === 3) { g.lineTo(bx + c * 12 - s * 14, by + s * 10 + c * 14); g.moveTo(bx, by); } }
      g.globalAlpha = k * 0.6; g.strokeStyle = `rgb(${f.c})`; g.lineWidth = 3.2; g.stroke();
      g.globalAlpha = Math.min(1, k * 1.5); g.strokeStyle = '#ffffff'; g.lineWidth = 1; g.stroke();
      glow(g, bx, by, 7, k * 0.8, GLOW_W);
    }
  }
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.lineCap = 'butt';
}
// Intensità del lampo del colpo grosso (0–1), per il velo a tutto schermo e per la tela della luce di notte.
export function heroFlash() { let a = 0; for (const f of hfx) if (f.k === 'flash') { const k = f.life / f.max; a = Math.max(a, k * k); } return a; }
// Lampo a tutto schermo (dopo il mondo, prima delle barre).
export function drawHeroFlash(g, w, h) {
  const a = heroFlash(); if (a <= 0.01) return;
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'lighter'; g.fillStyle = `rgba(255,244,222,${(0.5 * a).toFixed(3)})`; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'source-over';
}
// Luci per la tela della notte: [x, y, raggio, intensità] degli effetti in corso.
export function heroLights() {
  const out = [];
  for (const f of hfx) { const k = f.life / f.max; if (f.k === 'col') out.push([f.x, f.y - f.h * 0.3, f.h * 1.6, Math.min(1, k * 1.6)]); else if (f.k === 'ring' && f.d === 0) out.push([f.x, f.y, f.s * 2.2, k]); else if (f.k === 'wave') out.push([f.x1, f.y1, 40, k * 0.6]); }
  return out;
}
// Per i test e l'interfaccia: la macchina in campo (o null), stato del bagagliaio, effetti in corso e contatori.
export function heroState() {
  const u = heroUnit(), h = S && S.hero;
  return {
    present: !!h, id: u ? u.id : 0, x: u ? u.x : null, y: u ? u.y : null, rank: u ? u.rank || 0 : h ? h.rank || 0 : 0, xp: u ? u.xp || 0 : h ? h.xp || 0 : 0,
    down: !!(h && h.down), backIn: h && h.down && h.backAt != null ? Math.max(0, h.backAt - S.time) : 0,
    trunk: +car.open.toFixed(2), fx: hfx.length, kinds: [...new Set(hfx.map(f => f.k))], pending: pending.length, shots: car.shots, bigs: car.bigs, burnouts: car.burnouts,
  };
}
export { heroUnit, clock as heroClock };
