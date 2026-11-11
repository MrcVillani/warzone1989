// Cottura di un pezzo di terreno (un settore della carta, 8×8 caselle) nello stile «Rilievo»: materiali che sfumano
// l'uno nell'altro, rilievo illuminato dal sole, erba varia (macchie fresche e secche, ciuffi, fiori), terra umida
// vicino all'acqua, sabbia e schiuma sulle rive, fondale chiaro dove l'acqua è bassa, massi con crepe e licheni,
// sterrati con i solchi, strade e città delle mappe disegnate, ombre e chiome degli alberi, reticolo della carta.
// Gira dentro il Web Worker (terrain-worker.js) e, se il worker non c'è, sul filo principale: niente DOM, le tele si
// creano con mk(w, h) (OffscreenCanvas nel worker, <canvas> sul filo principale). Solo disegno.
import { TILE, MW, MH, GROUND, DIRT, WATER, ROCK, FOREST, CITY, ROAD, mulberry32, clamp } from '../engine/index.js';
import { drawRoads, drawCity } from './urban.js';
import { SUN, NIGHT, CHUNK } from './look.js';

/* ---------- rumore ---------- */
// Rumore a gradienti 2D con tabella di permutazione (circa 0..1).
export function makeNoise2(seed) {
  const r = mulberry32(seed >>> 0), perm = new Uint8Array(512), gx = new Float32Array(256), gy = new Float32Array(256);
  for (let i = 0; i < 256; i++) { perm[i] = i; const a = r() * Math.PI * 2; gx[i] = Math.cos(a); gy[i] = Math.sin(a); }
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const n = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, X = xi & 255, Y = yi & 255;
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10), v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const a = perm[perm[X] + Y], b = perm[perm[X + 1] + Y], c = perm[perm[X] + Y + 1], d = perm[perm[X + 1] + Y + 1];
    const da = gx[a] * xf + gy[a] * yf, db = gx[b] * (xf - 1) + gy[b] * yf, dc = gx[c] * xf + gy[c] * (yf - 1), dd = gx[d] * (xf - 1) + gy[d] * (yf - 1);
    const x1 = da + (db - da) * u, x2 = dc + (dd - dc) * u;
    return (x1 + (x2 - x1) * v) * 0.7 + 0.5;
  };
  n.fbm = (x, y, o = 4) => { let s = 0, a = 0.5, f = 1, t = 0; for (let i = 0; i < o; i++) { s += n(x * f, y * f) * a; t += a; a *= 0.5; f *= 2.03; } return s / t; };
  return n;
}

/* ---------- oggetti fissi della mappa ---------- */
// Alberi (bosco fitto e qualche albero isolato nei prati) e massi, dal seme e dal terreno: identici nel worker e sul
// filo principale, che li usa per gli alberi vivi.
export function mapObjects(terr, seed) {
  const r = mulberry32((seed * 7 + 3) >>> 0), trees = [], rocks = [];
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const t = terr[x + y * MW];
    if (t === ROCK) for (let k = 0; k < 2; k++) {
      const cx = x * TILE + 6 + r() * 20, cy = y * TILE + 6 + r() * 20, R = 5 + r() * 8, n = 7 + Math.floor(r() * 3), pts = [];
      for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + r() * 0.4, d = R * (0.7 + r() * 0.35); pts.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d]); }
      rocks.push({ cx, cy, R, pts, v: r(), cr: [r(), r(), r()] });
    }
    const n = t === FOREST ? 4 + Math.floor(r() * 2) : t === GROUND && r() < 0.03 ? 1 : 0;
    for (let k = 0; k < n; k++) trees.push({ cx: x * TILE + 4 + r() * 24, cy: y * TILE + 4 + r() * 24, R: t === FOREST ? 6.5 + r() * 5 : 5 + r() * 3, hue: 86 + r() * 24, v: r(), ph: r() * 7 });
  }
  trees.sort((a, b) => a.cy - b.cy);
  return { trees, rocks };
}

/* ---------- chiome ---------- */
// Chioma con volume: sette grumi illuminati dal lato del sole, bordo in ombra, foglie chiare sparse. Tela già pronta
// (scala K), per raggio, tinta e chiarezza arrotondati.
export const CANOPY_K = 2.5;
const canopies = new Map();
const canopyKey = (R, hue, v) => `${Math.round(R * 2) / 2}:${Math.round(hue / 4) * 4}:${Math.round(v * 3) / 3}`;
export const hasCanopy = (R, hue, v) => canopies.has(canopyKey(R, hue, v));
export function canopy(mk, R, hue, v) {
  const Rq = Math.round(R * 2) / 2, hq = Math.round(hue / 4) * 4, vq = Math.round(v * 3) / 3, key = canopyKey(R, hue, v);
  let c = canopies.get(key); if (c) return c;
  const S = Math.ceil((Rq * 2 + 6) * CANOPY_K); c = mk(S, S); canopies.set(key, c);
  const g = c.getContext('2d'), r = mulberry32(Math.round(Rq * 100 + hq + vq * 7)), m = S / CANOPY_K / 2, lx = -SUN.sx, ly = -SUN.sy;
  g.scale(CANOPY_K, CANOPY_K);
  g.fillStyle = `hsl(${hq + 8},32%,10%)`; g.beginPath(); g.arc(m, m, Rq, 0, 7); g.fill();
  const lumps = [[0, 0, 0.62]];
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + r() * 0.6; lumps.push([Math.cos(a) * Rq * 0.48, Math.sin(a) * Rq * 0.48, 0.42 + r() * 0.14]); }
  lumps.sort((a, b) => (a[0] * lx + a[1] * ly) - (b[0] * lx + b[1] * ly)); // prima i grumi in ombra
  for (const [dx, dy, s] of lumps) {
    const q = Rq * s, x = m + dx, y = m + dy, gr = g.createRadialGradient(x + lx * q * 0.45, y + ly * q * 0.45, q * 0.1, x, y, q);
    gr.addColorStop(0, `hsl(${hq - 4},${40 + vq * 6}%,${33 + vq * 7}%)`); gr.addColorStop(0.7, `hsl(${hq},36%,${21 + vq * 4}%)`); gr.addColorStop(1, `hsl(${hq + 6},32%,13%)`);
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, q, 0, 7); g.fill();
  }
  for (let i = 0; i < 16; i++) {
    const a = r() * 7, d = r() * Rq * 0.8, x = m + Math.cos(a) * d, y = m + Math.sin(a) * d, lit = Math.cos(a) * lx + Math.sin(a) * ly > 0;
    g.fillStyle = lit ? `hsla(${hq - 10},50%,52%,0.55)` : `hsla(${hq},30%,14%,0.4)`; g.beginPath(); g.arc(x, y, 0.6 + r() * 0.8, 0, 7); g.fill();
  }
  return c;
}
// Albero (chioma) centrato in x, y con raggio R: per i cortili delle città e per il bosco cotto.
const drawCanopy = (mk, g, x, y, R, hue, v) => { const c = canopy(mk, R, hue, v), s = c.width / CANOPY_K; g.drawImage(c, x - s / 2, y - s / 2, s, s); };

/* ---------- campi per casella (uguali per tutti i pezzi di una mappa) ---------- */
// Pesi dei materiali (città come erba, strada come terra: sotto c'è il loro disegno), acqua sfocata su 2 caselle
// (profondità) e su 3 (umidità del terreno vicino).
const MATS = [GROUND, DIRT, WATER, ROCK, FOREST];
const matOf = t => (t === CITY ? 0 : t === ROAD ? 1 : Math.max(0, MATS.indexOf(t)));
let fields = null;
function fieldsOf(terr, key) {
  if (fields && fields.key === key) return fields;
  const T = (x, y) => terr[clamp(x, 0, MW - 1) + clamp(y, 0, MH - 1) * MW];
  const wts = MATS.map(() => new Float32Array(MW * MH));
  for (let i = 0; i < MW * MH; i++) wts[matOf(terr[i])][i] = 1;
  const blur = R => {
    const o = new Float32Array(MW * MH);
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) { let s = 0, n = 0; for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) { s += T(x + i, y + j) === WATER ? 1 : 0; n++; } o[x + y * MW] = s / n; }
    return o;
  };
  fields = { key, wts, deep: blur(2), damp: blur(3) };
  return fields;
}
const bil = (arr, fx, fy) => {
  const xa = Math.floor(fx), ya = Math.floor(fy), u = fx - xa, v = fy - ya, X0 = clamp(xa, 0, MW - 1), X1 = clamp(xa + 1, 0, MW - 1), Y0 = clamp(ya, 0, MH - 1) * MW, Y1 = clamp(ya + 1, 0, MH - 1) * MW;
  const p = arr[X0 + Y0], b = arr[X1 + Y0], c = arr[X0 + Y1], d = arr[X1 + Y1]; return p + (b - p) * u + (c - p) * v + (p - b - c + d) * u * v;
};
const hash2 = (x, y, s) => { let h = (x * 374761393 + y * 668265263) ^ s; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/* ---------- pixel del pezzo ---------- */
function bakePixels(g, a, F) {
  const { cx, cy, res, seed } = a, x0 = cx * CHUNK, y0 = cy * CHUNK;
  const n1 = makeNoise2(seed * 13 + 1), n2 = makeNoise2(seed * 17 + 5), n3 = makeNoise2(seed * 29 + 7), n4 = makeNoise2(seed * 31 + 9);
  const fbm = (n, x, y, o) => { let s = 0, am = 0.5, f = 1, t = 0; for (let i = 0; i < o; i++) { s += n(x * f, y * f) * am; t += am; am *= 0.5; f *= 2.03; } return s / t; };
  const W = Math.round(CHUNK * res), P = W + 2, M = MATS.length;
  const Hh = new Float32Array(P * P), MAT = new Uint8Array(P * P), WW = new Float32Array(P * P), wv = new Float32Array(M);
  for (let j = 0; j < P; j++) for (let i = 0; i < P; i++) {
    const x = x0 + (i - 0.5) / res, y = y0 + (j - 0.5) / res;
    // bordo dei materiali mosso dal rumore: passaggi morbidi e irregolari tra un tipo e l'altro
    const ox = (n1(x / 46, y / 46) - 0.5) * 34 + (n2(x / 13, y / 13) - 0.5) * 8, oy = (n1(x / 46 + 31.7, y / 46 + 11.3) - 0.5) * 34 + (n2(x / 13 + 7, y / 13 + 3) - 0.5) * 8;
    const fx = (x + ox) / TILE - 0.5, fy = (y + oy) / TILE - 0.5;
    let best = 0, bw = -1, sum = 0;
    for (let m = 0; m < M; m++) { let w = bil(F.wts[m], fx, fy); w = w * w * w; wv[m] = w; sum += w; }
    for (let m = 0; m < M; m++) { wv[m] /= sum || 1; if (wv[m] > bw) { bw = wv[m]; best = m; } }
    const k = i + j * P, water = wv[2], rock = wv[3];
    MAT[k] = best; WW[k] = water;
    const ridge = 1 - Math.abs(n2(x / 22, y / 22) - 0.5) * 2;
    let h = fbm(n3, x / 90, y / 90, 3) * 7 + rock * (8 + 14 * (1 - ridge) + 5 * n3(x / 6, y / 6)) + wv[4] * 1.5;
    const sw = clamp(water * 1.6, 0, 1); h -= sw * sw * (3 - 2 * sw) * 6;
    Hh[k] = h;
  }
  const img = new ImageData(W, W), out = img.data;
  const ce = Math.cos(Math.asin(SUN.el)), Lx = -SUN.sx * ce, Ly = -SUN.sy * ce, Lz = SUN.el;
  for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
    const k = (i + 1) + (j + 1) * P, m = MAT[k], ww = WW[k];
    const x = x0 + (i + 0.5) / res, y = y0 + (j + 0.5) / res;
    const hx = (Hh[k + 1] - Hh[k - 1]) * res, hy = (Hh[k + P] - Hh[k - P]) * res;
    let nx = -hx * 0.5, ny = -hy * 0.5, nz = 1; const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
    let sh = clamp((nx * Lx + ny * Ly + nz * Lz) / Lz, 0.25, 1.9);
    const gr = hash2(Math.floor(x), Math.floor(y), seed) - 0.5, patch = n2(x / 120 + 50, y / 120 + 50), fine = n1(x / 5, y / 5), mid = n4(x / 26, y / 26);
    const wet = clamp((bil(F.damp, x / TILE - 0.5, y / TILE - 0.5) - 0.08) * 3.2, 0, 1);
    let r, gg, b;
    if (ww > 0.5) {
      const dep = clamp((bil(F.deep, x / TILE - 0.5, y / TILE - 0.5) - 0.45) / 0.5, 0, 1);
      r = 70 - 50 * dep; gg = 100 - 56 * dep; b = 98 - 32 * dep;
      // fondale visibile dove è basso: sassi e sabbia sotto il pelo dell'acqua
      const bed = (1 - dep) * (n4(x / 9, y / 9) - 0.5) * 18; r += bed; gg += bed; b += bed * 0.6;
      // vicino alla riva l'acqua si scurisce e prende il verde degli alberi
      const bank = clamp((0.8 - ww) / 0.3, 0, 1); r -= 18 * bank; gg -= 6 * bank; b -= 22 * bank;
      const ref = n3(x / 60, y / 9 + x / 200), spec = Math.max(0, ref - 0.64) * 2.2; r += spec * 55; gg += spec * 64; b += spec * 66;
      // schiuma sulla riva
      const foam = clamp(1 - Math.abs(ww - 0.56) / 0.045, 0, 1) * clamp((n1(x / 5, y / 5) - 0.3) * 3, 0, 1);
      r += (215 - r) * foam * 0.8; gg += (226 - gg) * foam * 0.8; b += (218 - b) * foam * 0.8;
      sh = 1;
    } else {
      const sand = clamp((ww - 0.12) / 0.3, 0, 1);
      if (m === 3) {
        // roccia: strati, crepe (creste sottili del rumore), licheni
        const v = 96 + fine * 26 + patch * 16 + (n4(x / 40, y / 11) - 0.5) * 14; r = v + 5; gg = v; b = v - 7;
        const crack = Math.abs(n2(x / 7, y / 7) - 0.5); if (crack < 0.03) { const c = (0.03 - crack) / 0.03; r -= 50 * c; gg -= 50 * c; b -= 46 * c; }
        if (mid > 0.68) { r -= 12; gg += 4; b -= 16; }
      } else if (m === 1) {
        // terra: zolle, sassolini
        const v = patch * 18 + fine * 10 + (mid - 0.5) * 10; r = 106 + v; gg = 85 + v * 0.8; b = 60 + v * 0.6;
        if (hash2(Math.floor(x / 2), Math.floor(y / 2), seed) > 0.985) { r += 40; gg += 36; b += 30; }
      } else if (m === 4) { const v = patch * 14 + fine * 8; r = 46 + v * 0.5; gg = 62 + v; b = 34 + v * 0.4; }
      else {
        // erba: macchie fresche e secche, chiazze più scure, grana fine
        const dry = clamp((patch - 0.45) * 2.4, 0, 1), lush = clamp((mid - 0.55) * 3, 0, 1), v = fine * 12 + (n4(x / 3, y / 3) - 0.5) * 10;
        r = 76 + 36 * dry - 10 * lush + v; gg = 96 + 16 * dry + 8 * lush + v; b = 50 + 6 * dry + v * 0.5;
      }
      if (sand > 0) { r += (178 - r) * sand; gg += (160 - gg) * sand; b += (120 - b) * sand; }
      // terreno umido vicino all'acqua: più scuro e un po' più freddo
      if (wet > 0 && m !== 3) { const k2 = wet * (1 - sand * 0.6) * 0.32; r *= 1 - k2; gg *= 1 - k2 * 0.8; b *= 1 - k2 * 0.6; }
      r += gr * 12; gg += gr * 12; b += gr * 9;
    }
    const kk = sh * 0.82 + 0.1, o = (i + j * W) * 4;
    out[o] = r * kk; out[o + 1] = gg * kk * 0.98; out[o + 2] = b * kk * 0.92; out[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}

/* ---------- decorazione ---------- */
// Strade sterrate disegnate (solo aspetto, mappe senza strade vere): due solchi, l'erba nel mezzo, il bordo battuto.
function dirtRoads(g, paths, x0, y0) {
  for (const pts of paths) {
    if (!pts.some(([x, y]) => x > x0 - 40 && x < x0 + CHUNK + 40 && y > y0 - 40 && y < y0 + CHUNK + 40)) continue;
    const line = off => {
      g.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, x = pts[i][0] - dy / l * off, y = pts[i][1] + dx / l * off;
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
    };
    g.lineJoin = g.lineCap = 'round';
    line(0); g.strokeStyle = 'rgba(90,74,52,0.3)'; g.lineWidth = 26; g.stroke();
    line(0); g.strokeStyle = 'rgba(128,108,78,0.8)'; g.lineWidth = 17; g.stroke();
    for (const o of [-4.6, 4.6]) { line(o); g.strokeStyle = 'rgba(52,40,26,0.6)'; g.lineWidth = 3; g.stroke(); line(o + 1.5); g.strokeStyle = 'rgba(196,176,136,0.3)'; g.lineWidth = 1; g.stroke(); }
    line(0); g.strokeStyle = 'rgba(88,104,52,0.5)'; g.lineWidth = 2.6; g.stroke();
  }
}
// Per casella (anche quelle accanto, così i bordi si saldano): ciuffi d'erba, fiori, sassi, solchi e pozzanghere.
function tileDetails(g, terr, seed, cx, cy) {
  const tx0 = cx * 8 - 1, ty0 = cy * 8 - 1;
  for (let ty = ty0; ty < ty0 + 10; ty++) for (let tx = tx0; tx < tx0 + 10; tx++) {
    if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) continue;
    const t = terr[tx + ty * MW], r = mulberry32((tx * 7919 + ty * 104729 + seed) >>> 0), bx = tx * TILE, by = ty * TILE;
    if (t === GROUND || t === FOREST) {
      for (let i = 0; i < (t === GROUND ? 9 : 4); i++) {
        const x = bx + r() * TILE, y = by + r() * TILE, n = 3 + Math.floor(r() * 3), dark = r() < 0.5;
        g.strokeStyle = dark ? 'rgba(36,50,20,0.55)' : 'rgba(160,172,96,0.4)'; g.lineWidth = 0.7; g.beginPath();
        for (let k = 0; k < n; k++) { const a = -Math.PI / 2 + (k - n / 2) * 0.35 + (r() - 0.5) * 0.3, l = 2 + r() * 2.5; g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); }
        g.stroke();
      }
      if (t === GROUND && r() < 0.35) {
        const fx = bx + r() * TILE, fy = by + r() * TILE, col = ['#f2efe2', '#f0d35a', '#c9a0d8', '#e88a6a'][Math.floor(r() * 4)];
        g.fillStyle = col; for (let i = 0, n = 5 + r() * 6; i < n; i++) { g.beginPath(); g.arc(fx + (r() - 0.5) * 9, fy + (r() - 0.5) * 7, 0.7 + r() * 0.5, 0, 7); g.fill(); }
      }
    } else if (t === DIRT) {
      if (r() < 0.25) { // solchi di ruote vecchi
        const x = bx + r() * TILE, y = by + r() * TILE, a = r() * Math.PI, l = 20 + r() * 26, s = Math.sin(a), c = Math.cos(a);
        g.strokeStyle = 'rgba(52,40,28,0.35)'; g.lineWidth = 2;
        for (const o of [-3.5, 3.5]) { g.beginPath(); g.moveTo(x - s * o - c * l / 2, y + c * o - s * l / 2); g.quadraticCurveTo(x - s * o + 5, y + c * o + 3, x - s * o + c * l / 2, y + c * o + s * l / 2); g.stroke(); }
      }
      if (r() < 0.15) { // pozzanghera con il riflesso del cielo
        const x = bx + r() * TILE, y = by + r() * TILE;
        g.fillStyle = 'rgba(40,44,46,0.35)'; g.beginPath(); g.ellipse(x, y, 5 + r() * 5, 2.5 + r() * 2, r() * 3, 0, 7); g.fill();
        g.fillStyle = 'rgba(180,200,210,0.18)'; g.beginPath(); g.ellipse(x - 1, y - 0.6, 3, 1, 0.3, 0, 7); g.fill();
      }
      for (let i = 0; i < 6; i++) { const x = bx + r() * TILE, y = by + r() * TILE, s = 0.8 + r() * 1.4; g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + 0.6, y + 0.6, s, s * 0.8); g.fillStyle = 'rgba(196,178,140,0.7)'; g.fillRect(x, y, s, s * 0.8); }
    }
  }
}
// Massi: ombra, facce in luce e in ombra, spigolo, crepe, licheni.
function rocksOf(g, rocks) {
  const shx = SUN.sx * SUN.len, shy = SUN.sy * SUN.len;
  g.fillStyle = 'rgba(10,12,8,0.34)';
  for (const q of rocks) { g.beginPath(); q.pts.forEach(([a, b], i) => (i ? g.lineTo(a + shx * q.R * 0.7, b + shy * q.R * 0.7) : g.moveTo(a + shx * q.R * 0.7, b + shy * q.R * 0.7))); g.closePath(); g.fill(); }
  for (const q of rocks) {
    const gr = g.createLinearGradient(q.cx - SUN.sx * q.R, q.cy - SUN.sy * q.R, q.cx + SUN.sx * q.R, q.cy + SUN.sy * q.R), v = 120 + q.v * 30;
    gr.addColorStop(0, `rgb(${v * 1.25 | 0},${v * 1.18 | 0},${v * 1.01 | 0})`); gr.addColorStop(1, `rgb(${v * 0.42 | 0},${v * 0.41 | 0},${v * 0.44 | 0})`);
    g.fillStyle = gr; g.beginPath(); q.pts.forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b))); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(28,26,22,0.5)'; g.lineWidth = 0.8; g.stroke();
    g.strokeStyle = 'rgba(255,250,235,0.25)'; g.beginPath(); g.moveTo(q.pts[1][0], q.pts[1][1]); g.lineTo(q.cx - SUN.sx * 1.5, q.cy - SUN.sy * 1.5); g.lineTo(q.pts[4][0], q.pts[4][1]); g.stroke();
    g.strokeStyle = 'rgba(24,22,18,0.7)'; g.lineWidth = 0.7; g.beginPath();
    let x = q.cx + (q.cr[0] - 0.5) * q.R, y = q.cy + (q.cr[1] - 0.5) * q.R; g.moveTo(x, y);
    for (let i = 0; i < 3; i++) { x += (q.cr[(i + 1) % 3] - 0.3) * q.R * 0.5; y += (q.cr[i] - 0.6) * q.R * 0.5; g.lineTo(x, y); }
    g.stroke();
    if (q.v > 0.6) { g.fillStyle = 'rgba(150,160,90,0.35)'; g.beginPath(); g.arc(q.cx + q.R * 0.2, q.cy + q.R * 0.25, q.R * 0.25, 0, 7); g.fill(); }
  }
}
// Ombra dell'albero sul terreno (sempre cotta: non si muove quando la chioma ondeggia).
export function treeShadow(g, t) {
  const shx = SUN.sx * SUN.len, shy = SUN.sy * SUN.len, o = t.R * 1.15;
  g.beginPath(); g.ellipse(t.cx + shx * o, t.cy + shy * o, t.R * (1 + 0.25 * SUN.len), t.R * 0.95, Math.atan2(shy, shx), 0, 7); g.fill();
}

// a: { cx, cy, res, seed, useed (seme di strade e città), terr (Uint8Array), dep (Uint8Array, 1 = giacimento),
//      paths (sterrati disegnati: liste di punti), canopy (chiome cotte), dark (tinta notturna cotta) }
// Restituisce la tela del pezzo (CHUNK·res pixel di lato).
export function bakeChunk(a, mk) {
  const { cx, cy, res, terr, seed } = a, x0 = cx * CHUNK, y0 = cy * CHUNK, W = Math.round(CHUNK * res);
  const c = mk(W, W), g = c.getContext('2d');
  bakePixels(g, a, fieldsOf(terr, `${seed}:${a.useed}:${terr.length}:${a.tkey}`));
  g.setTransform(res, 0, 0, res, -x0 * res, -y0 * res);
  const objs = objectsOf(terr, seed, a.tkey);
  const near = (x, y, m) => x > x0 - m && x < x0 + CHUNK + m && y > y0 - m && y < y0 + CHUNK + m;
  if (a.paths && a.paths.length) dirtRoads(g, a.paths, x0, y0);
  tileDetails(g, terr, seed, cx, cy);
  const rect = { tx0: cx * 8, ty0: cy * 8, tx1: cx * 8 + 8, ty1: cy * 8 + 8 };
  drawRoads(g, terr, i => a.dep[i] === 1, mk, rect);
  drawCity(g, terr, a.useed, mk, rect, (gg, x, y, R, v) => drawCanopy(mk, gg, x, y, R, 92 + v * 14, v));
  rocksOf(g, objs.rocks.filter(q => near(q.cx, q.cy, 40)));
  const trees = objs.trees.filter(t => near(t.cx, t.cy, 40));
  g.fillStyle = 'rgba(8,14,6,0.36)'; for (const t of trees) treeShadow(g, t);
  if (a.canopy) for (const t of trees) drawCanopy(mk, g, t.cx, t.cy, t.R, t.hue, t.v);
  // reticolo e riferimento di settore: ogni pezzo è un settore
  g.strokeStyle = 'rgba(235,228,200,0.08)'; g.lineWidth = 1; g.beginPath();
  if (cx) { g.moveTo(x0 + 0.5, y0); g.lineTo(x0 + 0.5, y0 + CHUNK); }
  if (cy) { g.moveTo(x0, y0 + 0.5); g.lineTo(x0 + CHUNK, y0 + 0.5); }
  g.stroke();
  g.fillStyle = 'rgba(235,228,200,0.28)'; g.font = '500 11px "IBM Plex Mono", ui-monospace, monospace'; g.fillText('ABCDEFGH'[cx] + (cy + 1), x0 + 5, y0 + 14);
  if (a.dark) {
    // notte senza tela della luce (qualità minima): la luce della luna è già nel pezzo
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'multiply'; g.fillStyle = `rgb(${NIGHT.bake})`; g.fillRect(0, 0, W, W); g.globalCompositeOperation = 'source-over';
  }
  return c;
}
let objCache = null;
function objectsOf(terr, seed, tkey) {
  const key = `${seed}:${tkey}`;
  if (!objCache || objCache.key !== key) objCache = { key, ...mapObjects(terr, seed) };
  return objCache;
}
