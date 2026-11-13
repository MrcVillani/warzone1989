// Meteo, solo aspetto: pioggia (terreno più scuro e lucido, pozzanghere con i cerchi, schizzi a terra e sull'acqua,
// gocce oblique in primo piano, lampo leggero con il tuono) e nebbia (velo che smorza i colori, banchi che si muovono
// piano sopra la mappa, sotto la nebbia di guerra). Le regole sono nel motore (WEATHER, S.weather): qui si legge
// S.weather e si passa dal tempo di prima a quello nuovo in FADE_S secondi. Ogni parte segue il livello di qualità:
// alta tutto; media meno gocce; bassa pioggia rada e nebbia a una passata; minima solo la tinta. Con «riduci
// movimento» niente gocce, cerchi, schizzi né lampo: tinta, pozzanghere ferme e banchi fermi.
import * as ENG from '../engine/index.js';
import { TILE, MW, MH, WATER, DIRT, ROCK, FOREST, CITY, ROAD, S, terr, clamp, mulberry32 } from '../engine/index.js';
import { tileTex, tile, nC } from './atmos.js';
import { WIND } from './look.js';
import { thunder } from './audio.js';

const FADE_S = 3.5, DRY_S = 7;
// Tabella del motore, se c'è già; altrimenti i valori del piano (solo quelli che servono al disegno).
const LOCAL = { clear: { name: 'Sereno', burn: 1 }, rain: { name: 'Pioggia', burn: 0.5 }, fog: { name: 'Nebbia', burn: 1 } };
const table = () => ENG['WEATHER'.slice()] || LOCAL;
export const weatherNow = () => { const w = S && S.weather; return w === 'rain' || w === 'fog' ? w : 'clear'; };
// Nome del tempo per l'interfaccia («Sereno», «Pioggia», «Nebbia», «Variabile»).
export const weatherName = id => (id === 'variable' ? 'Variabile' : (table()[id] && table()[id].name) || (LOCAL[id] && LOCAL[id].name) || 'Sereno');
// Quanto dura la fiamma dei relitti rispetto al sereno (WEATHER.rain.burn: la metà sotto la pioggia).
export const burnK = () => { const w = weatherNow(), e = table()[w]; return e && e.burn > 0 ? e.burn : LOCAL[w].burn; };

// rain, fog: intensità disegnata (0–1), verso quella del tempo in corso; wet: terreno bagnato (asciuga più piano).
const st = { rain: 0, fog: 0, wet: 0, flash: 0, bolt: 20, flashes: 0, t: 0, drops: 0, puddles: 0, banks: 0, moving: false };
export const wx = st;
export function weatherReset() {
  const w = weatherNow();
  st.rain = st.wet = w === 'rain' ? 1 : 0; st.fog = w === 'fog' ? 1 : 0; st.flash = 0; st.bolt = 12 + Math.random() * 14;
  pud = null; hits.length = 0;
}
// Avanza le dissolvenze (tempo vero, anche in pausa e sotto il menu) e, a partita in corso, il lampo con il tuono.
export function weatherTick(dt, running, rm) {
  const w = weatherNow(), k = dt / FADE_S, to = (v, t) => (v < t ? Math.min(t, v + k) : Math.max(t, v - k));
  st.rain = to(st.rain, w === 'rain' ? 1 : 0); st.fog = to(st.fog, w === 'fog' ? 1 : 0);
  st.wet = st.rain > st.wet ? st.rain : Math.max(st.rain, st.wet - dt / DRY_S);
  st.t += dt;
  if (st.flash > 0) st.flash = Math.max(0, st.flash - dt / 0.5);
  if (running && st.rain > 0.7 && (st.bolt -= dt) <= 0) {
    st.bolt = 16 + Math.random() * 30;
    if (!rm) { st.flash = 1; st.flashes++; }
    thunder(0.5 + Math.random() * 2.2);
  }
}
// Cielo coperto (0 sereno … 1): spegne le ombre delle nuvole e la luce calda della correzione colore.
export const overcast = () => Math.max(st.rain, st.fog);

/* ---------- pozzanghere ---------- */
// Pozzanghere della mappa in corso, calcolate dal seme: sulla terra battuta e sull'asfalto molte, sull'erba poche;
// raccolte per settore di 8×8 caselle per trovare in fretta quelle in vista. v: forma; s: lato; ph: fase dei cerchi;
// q: soglia di qualità (in bassa se ne disegna una su tre).
let pud = null;
function puddles() {
  const key = `${S.seed}|${S.map || ''}|${S.mission || ''}`;
  if (pud && pud.key === key) return pud;
  const r = mulberry32((S.seed ^ 0x51ed27) >>> 0), cells = Array.from({ length: 64 }, () => []);
  for (let ty = 0; ty < MH; ty++) for (let tx = 0; tx < MW; tx++) {
    const t = terr[tx + ty * MW], p = r(), a = r(), b = r(), c = r();
    if (t === WATER || t === ROCK || t === FOREST || t === CITY) continue;
    if (p > (t === DIRT ? 0.24 : t === ROAD ? 0.24 : 0.08)) continue;
    cells[(tx >> 3) + (ty >> 3) * 8].push({ x: (tx + 0.2 + a * 0.6) * TILE, y: (ty + 0.2 + b * 0.6) * TILE, s: (t === ROAD ? 9 : 12) + c * (t === ROAD ? 9 : 16), v: Math.floor(c * 97) % 4, ph: a * 7, q: p * 31 % 1 });
  }
  return (pud = { key, cells });
}
// Quattro forme di pozzanghera già pronte: bordo di fango scuro, specchio che riflette il cielo, un filo di luce.
let pimg = null;
function puddleImgs() {
  if (pimg) return pimg;
  pimg = [];
  for (let v = 0; v < 4; v++) {
    const c = document.createElement('canvas'); c.width = c.height = 48; const g = c.getContext('2d'), r = mulberry32(77 + v * 13);
    const lobes = []; for (let i = 0, n = 3 + (v & 1); i < n; i++) lobes.push([24 + (r() - 0.5) * 18, 24 + (r() - 0.5) * 10, 7 + r() * 7, 5 + r() * 4, (r() - 0.5) * 0.8]);
    const path = k => { g.beginPath(); for (const [x, y, a, b, rot] of lobes) { g.moveTo(x + a * k, y); g.ellipse(x, y, a * k, b * k, rot, 0, 7); } };
    g.fillStyle = 'rgba(20,17,12,0.5)'; path(1.12); g.fill();
    const gr = g.createLinearGradient(0, 12, 0, 36); gr.addColorStop(0, 'rgba(126,146,164,0.9)'); gr.addColorStop(1, 'rgba(62,78,96,0.9)');
    g.fillStyle = gr; path(1); g.fill();
    g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(214,228,236,0.55)';
    g.beginPath(); g.ellipse(18 + v * 3, 19, 9, 1.6, -0.25, 0, 7); g.fill();
    pimg.push(c);
  }
  return pimg;
}
// Schizzi delle gocce a terra e cerchi sull'acqua: punti a caso nella visuale, vita breve. [x, y, età, vita, acqua]
const hits = [];
const waterAt = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return tx >= 0 && ty >= 0 && tx < MW && ty < MH && terr[tx + ty * MW] === WATER; };

// Le trame ripetute sbordano dal rettangolo: se la visuale esce dalla mappa si ritaglia sulla mappa (restituisce true:
// poi serve g.restore()).
function clipMap(g, vr) {
  if (vr.x0 >= 0 && vr.y0 >= 0 && vr.x1 <= MW * TILE && vr.y1 <= MH * TILE) return false;
  g.save(); g.beginPath(); g.rect(0, 0, MW * TILE, MH * TILE); g.clip(); return true;
}
// Terreno bagnato, subito sopra il terreno e i segni: tinta scura e fredda, chiazze lucide che riflettono il cielo,
// pozzanghere con i cerchi delle gocce, schizzi. lvl: livello di qualità (0–3); rm: «riduci movimento».
export function drawWetGround(g, vr, dt, lvl, rm, night) {
  st.puddles = 0;
  const w = st.wet; if (w <= 0.01 || !S || !terr) return;
  const x0 = Math.max(0, vr.x0), y0 = Math.max(0, vr.y0), x1 = Math.min(MW * TILE, vr.x1), y1 = Math.min(MH * TILE, vr.y1);
  if (x1 <= x0 || y1 <= y0) return;
  g.fillStyle = `rgba(14,22,36,${(0.27 * w).toFixed(3)})`; g.fillRect(x0, y0, x1 - x0, y1 - y0);
  if (lvl < 1) return;
  if (lvl >= 2) {
    const sh = tileTex('sheen', (u, v) => nC.fbm(u * 5 + 3, v * 5 + 7, 3), n => [168, 190, 208, clamp((n - 0.5) * 3, 0, 1) * 70]);
    if (sh) { const cl = clipMap(g, vr); g.globalAlpha = (night ? 0.45 : 0.85) * w; tile(g, sh, 520, 0, 0, { x0, y0, x1, y1 }); g.globalAlpha = 1; if (cl) g.restore(); }
  }
  const P = puddles(), imgs = puddleImgs(), live = !rm && st.rain > 0.25 && lvl >= 2, rings = [[], [], []], qmin = lvl === 1 ? 0.66 : 0;
  const cx0 = clamp(Math.floor(x0 / 256), 0, 7), cy0 = clamp(Math.floor(y0 / 256), 0, 7), cx1 = clamp(Math.floor(x1 / 256), 0, 7), cy1 = clamp(Math.floor(y1 / 256), 0, 7);
  g.globalAlpha = (night ? 0.6 : 0.9) * w;
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) for (const p of P.cells[cx + cy * 8]) {
    if (p.q < qmin || p.x < x0 - 24 || p.x > x1 + 24 || p.y < y0 - 16 || p.y > y1 + 16) continue;
    g.drawImage(imgs[p.v], p.x - p.s, p.y - p.s * 0.7, p.s * 2, p.s * 1.4); st.puddles++;
    if (live) { const k = (st.t * 1.15 + p.ph) % 1; rings[k < 0.34 ? 0 : k < 0.67 ? 1 : 2].push(p.x + Math.sin(p.ph * 9) * p.s * 0.25, p.y, 1 + k * p.s * 0.42); }
  }
  g.globalAlpha = 1;
  if (rm || lvl < 2) { hits.length = 0; return; }
  // cerchi nelle pozzanghere: tre gruppi per trasparenza, un tratto per gruppo
  g.lineWidth = 0.7;
  for (let b = 0; b < 3; b++) {
    const a = rings[b]; if (!a.length) continue;
    g.strokeStyle = `rgba(226,236,242,${((0.6 - b * 0.2) * st.rain).toFixed(2)})`; g.beginPath();
    for (let i = 0; i < a.length; i += 3) { g.moveTo(a[i] + a[i + 2], a[i + 1]); g.ellipse(a[i], a[i + 1], a[i + 2], a[i + 2] * 0.62, 0, 0, 7); }
    g.stroke();
  }
  // schizzi: nascono a caso nella visuale secondo la superficie (più fitti in alta); sull'acqua diventano cerchi
  const area = (x1 - x0) * (y1 - y0) / 1e6, rate = (lvl === 3 ? 150 : 70) * area * st.rain, max = lvl === 3 ? 90 : 45;
  for (let n = rate * dt + Math.random(); n >= 1 && hits.length < max; n--) {
    const x = x0 + Math.random() * (x1 - x0), y = y0 + Math.random() * (y1 - y0), wa = waterAt(x, y);
    hits.push([x, y, 0, wa ? 0.9 : 0.24, wa ? 1 : 0]);
  }
  let j = 0; g.beginPath();
  const wr = [[], []];
  for (const h of hits) {
    h[2] += dt; if (h[2] >= h[3]) continue; hits[j++] = h;
    const k = h[2] / h[3];
    if (h[4]) wr[k < 0.5 ? 0 : 1].push(h[0], h[1], 1 + k * 7);
    else { const r = 0.8 + k * 2.2; g.moveTo(h[0] - r, h[1]); g.lineTo(h[0] - r * 1.5, h[1] - r * 1.1); g.moveTo(h[0] + r, h[1]); g.lineTo(h[0] + r * 1.5, h[1] - r * 1.1); g.moveTo(h[0] + r, h[1] + 0.4); g.ellipse(h[0], h[1] + 0.4, r, r * 0.5, 0, 0, 7); }
  }
  hits.length = j;
  g.strokeStyle = `rgba(222,232,240,${(night ? 0.3 : 0.45) * st.rain})`; g.lineWidth = 0.6; g.stroke();
  for (let b = 0; b < 2; b++) {
    const a = wr[b]; if (!a.length) continue;
    g.strokeStyle = `rgba(236,244,246,${(b ? 0.3 : 0.65) * st.rain})`; g.lineWidth = 0.9; g.beginPath();
    for (let i = 0; i < a.length; i += 3) { g.moveTo(a[i] + a[i + 2], a[i + 1]); g.ellipse(a[i], a[i + 1], a[i + 2], a[i + 2] * 0.6, 0, 0, 7); }
    g.stroke();
  }
}

/* ---------- velo e banchi di nebbia ---------- */
// Sopra il mondo e sotto la nebbia di guerra (che resta scura e netta): velo che smorza i colori (pioggia: freddo e
// leggero; nebbia: grigio chiaro), poi i banchi, una o due trame grandi che scorrono piano in versi diversi.
const bankMap = n => [212, 218, 220, clamp((n - 0.4) * 2.4, 0, 1) * 215], bankMapN = n => [92, 104, 138, clamp((n - 0.4) * 2.4, 0, 1) * 215];
export function drawWeatherAir(g, vr, lvl, rm, night) {
  st.banks = 0; st.moving = false;
  const r = st.rain, f = st.fog; if (r <= 0.01 && f <= 0.01) return;
  const x0 = Math.max(0, vr.x0), y0 = Math.max(0, vr.y0), w = Math.min(MW * TILE, vr.x1) - x0, h = Math.min(MH * TILE, vr.y1) - y0;
  if (w <= 0 || h <= 0) return;
  const cl = clipMap(g, vr);
  try { air(g, { x0, y0, x1: x0 + w, y1: y0 + h }, r, f, lvl, rm, night); } finally { if (cl) g.restore(); }
}
function air(g, vr, r, f, lvl, rm, night) {
  const x0 = vr.x0, y0 = vr.y0, w = vr.x1 - x0, h = vr.y1 - y0;
  if (r > 0.01) { g.fillStyle = night ? `rgba(20,28,48,${(0.12 * r).toFixed(3)})` : `rgba(72,86,106,${(0.13 * r).toFixed(3)})`; g.fillRect(x0, y0, w, h); }
  if (f <= 0.01) return;
  g.fillStyle = night ? `rgba(58,68,96,${(0.3 * f).toFixed(3)})` : `rgba(172,180,184,${(0.27 * f).toFixed(3)})`; g.fillRect(x0, y0, w, h);
  if (lvl < 1) return;
  const B = night ? tileTex('bankN', (u, v) => nC.fbm(u * 2.6 + 21, v * 2.6 + 5, 4), bankMapN) : tileTex('bank', (u, v) => nC.fbm(u * 2.6 + 21, v * 2.6 + 5, 4), bankMap);
  if (!B) return;
  const t = rm ? 0 : st.t, passes = lvl >= 2 && !rm ? 2 : 1;
  g.globalAlpha = (night ? 0.5 : 0.62) * f; tile(g, B, 1300, (t * WIND.x * 0.45) % 1300, (t * WIND.y * 0.45) % 1300, vr);
  if (passes > 1) { g.globalAlpha = (night ? 0.3 : 0.4) * f; tile(g, B, 830, (-t * 4.2 + 300) % 830, (t * 5.5 + 170) % 830, vr); }
  g.globalAlpha = 1; st.banks = passes; st.moving = !rm;
}

/* ---------- gocce in primo piano e lampo ---------- */
// Gocce oblique nello spazio dello schermo (pixel CSS), sopra la nebbia di guerra e sotto barre e selezioni: due
// profondità, un tratto per ciascuna. Il numero segue la superficie della visuale e il livello di qualità.
const drops = [];
const DENS = [0, 55, 150, 300]; // gocce per milione di pixel CSS, per livello
const VX = -250, VY = 940;
export function drawRain(g, cw, ch, dpr, dt, lvl, rm, night) {
  st.drops = 0;
  if (st.flash > 0 && !rm) {
    // lampo leggero: un bagliore freddo che si spegne in mezzo secondo, con un secondo guizzo più debole
    const k = st.flash, a = 0.13 * (k > 0.8 ? 1 : k > 0.62 ? 0.25 : k > 0.5 ? 0.7 : k * 1.2);
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = `rgba(214,226,255,${a.toFixed(3)})`; g.fillRect(0, 0, cw * dpr, ch * dpr);
  }
  const r = st.rain; if (r <= 0.02 || rm || lvl < 1) { drops.length = 0; return; }
  const want = Math.round(clamp(DENS[lvl] * cw * ch / 1e6, 14, 420) * r), mx = 60;
  while (drops.length < want) drops.push([Math.random() * (cw + mx), Math.random() * ch, 0.55 + Math.random() * 0.45]);
  drops.length = want;
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.lineCap = 'butt';
  for (let b = 0; b < 2; b++) {
    g.beginPath();
    for (const d of drops) {
      if ((d[2] > 0.8) !== !!b) continue;
      if (!b) { /* avanzano una volta sola, nel primo giro */ }
      const z = d[2], len = 0.02 * z;
      g.moveTo(d[0], d[1]); g.lineTo(d[0] - VX * len, d[1] - VY * len);
    }
    g.strokeStyle = b ? `rgba(206,220,236,${night ? 0.3 : 0.42})` : `rgba(186,202,222,${night ? 0.2 : 0.28})`; g.lineWidth = b ? 1.1 : 0.8; g.stroke();
  }
  for (const d of drops) {
    d[0] += VX * d[2] * dt; d[1] += VY * d[2] * dt;
    if (d[1] > ch + 20 || d[0] < -20) { if (Math.random() < ch / (ch + cw * 0.27)) { d[0] = Math.random() * (cw + mx); d[1] = -20; } else { d[0] = cw + mx; d[1] = Math.random() * ch; } }
  }
  st.drops = want;
}
// Per i test: tempo in corso, intensità disegnate e che cosa si è disegnato nell'ultimo fotogramma.
export const weatherState = () => ({
  now: weatherNow(), mode: (S && S.weatherMode) || weatherNow(), rain: +st.rain.toFixed(2), fog: +st.fog.toFixed(2), wet: +st.wet.toFixed(2),
  drops: st.drops, puddles: st.puddles, banks: st.banks, moving: st.moving, flashes: st.flashes,
});
