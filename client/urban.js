// Città e strade delle mappe disegnate (terreni CITY e ROAD), nello stile «Rilievo» del terreno: asfalto con grana,
// crepe, solchi lasciati dalle ruote, margini e segnaletica tenue, ponti sui canali; isolati con tetti di tegole
// illuminati da nord-ovest, cortili alberati, poderi nei campi; più i nomi dei luoghi sopra la mappa.
// Strade e isolati si cuociono una volta sola nei pezzi di terreno (terrain-bake.js, anche dentro il Web Worker: qui
// niente DOM, le tele si creano con mk(w, h)): il costo per fotogramma non cambia. Ogni funzione di disegno riceve il
// riquadro di caselle del pezzo (rect: tx0, ty0, tx1, ty1, estremi esclusi) e disegna solo ciò che lo tocca.
// I nomi dei luoghi si disegnano a ogni fotogramma, in coordinate dello schermo.
// Solo disegno: passabilità e piazzamento restano del motore.
import { TILE, MW, MH, GROUND, DIRT, WATER, FOREST, CITY, ROAD, mulberry32, clamp } from '../engine/index.js';

const T = TILE;
const inMap = (x, y) => x >= 0 && y >= 0 && x < MW && y < MH;
// Terreno della casella; fuori mappa vale quello della casella di bordo più vicina (le strade escono dal bordo).
const tAt = (terr, x, y) => terr[clamp(x, 0, MW - 1) + clamp(y, 0, MH - 1) * MW];
const free = c => { c.width = c.height = 0; };
const touches = (rect, x0, y0, x1, y1) => x1 > rect.tx0 && x0 < rect.tx1 && y1 > rect.ty0 && y0 < rect.ty1;
// Numero pseudocasuale stabile in [0, 1) da tre interi (grana dell'asfalto, varietà dei tetti).
const hash = (a, b, c) => { let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/* ---------- strade ---------- */

// Colori della tela (non CSS: sono pixel del terreno come l'erba e l'acqua). Segnaletica qui, asfalto e ponti in RGB più giù.
const ROAD_COL = { dash: 'rgba(232,220,170,0.3)' };
const CHUNK = 8, PAD = 8;

// Strade: asfalto (con raccordi diagonali sulle scalinate di caselle), margini, linea di mezzeria tratteggiata sui
// tratti regolari, ponti dove la strada passa sull'acqua (parapetto e ombra sull'acqua).
// isDep(i): la casella i è un giacimento (niente raccordi lì).
export function drawRoads(g, terr, isDep, mk, rect) {
  if (!terr.includes(ROAD)) return;
  for (let cy = 0; cy < MH; cy += CHUNK) for (let cx = 0; cx < MW; cx += CHUNK) if (touches(rect, cx, cy, cx + CHUNK, cy + CHUNK)) roadChunk(g, terr, isDep, cx, cy, mk);
  drawCenterLines(g, terr);
}

// Raccordo: una casella con strada su due lati che si toccano riceve il triangolo d'angolo, così le scalinate diventano
// diagonali pulite. Su erba, terra e bosco (gli alberi restano sopra) e sull'acqua (i ponti in diagonale), mai su case,
// rocce o giacimenti.
const CORNERS = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function chamferable(terr, isDep, x, y) {
  if (!inMap(x, y)) return false;
  const v = terr[x + y * MW];
  return (v === GROUND || v === DIRT || v === FOREST || v === WATER) && !isDep(x + y * MW);
}
// Colori dell'asfalto e dei ponti in RGB, per il disegno pixel per pixel.
const RGB = {
  asphalt: [74, 74, 69], rim: [16, 15, 12], margin: [226, 219, 194], parapet: [157, 151, 133], parapetDark: [24, 22, 17],
  shadow: [4, 10, 12],
};
// Un riquadro di CHUNK×CHUNK caselle, calcolato pixel per pixel su array (niente tele intermedie: veloce anche senza
// accelerazione grafica e con poca memoria). Copertura della strada (con i raccordi sfumati sul bordo), distanza dal
// bordo (metrica 3-4, quasi euclidea), poi colore: ciglio scuro, asfalto con grana, margine chiaro; nella zona dei ponti
// parapetto al posto del margine e ombra sull'acqua.
function roadChunk(g, terr, isDep, tx0, ty0, mk) {
  let any = false;
  for (let y = ty0 - 1; y <= ty0 + CHUNK && !any; y++) for (let x = tx0 - 1; x <= tx0 + CHUNK; x++) if (tAt(terr, x, y) === ROAD) { any = true; break; }
  if (!any) return;
  const n = CHUNK * T + 2 * PAD, ox = tx0 * T - PAD, oy = ty0 * T - PAD;
  const cov = new Float32Array(n * n), zone = new Uint8Array(n * n), wet = new Uint8Array(n * n);
  const span = (x, y) => [Math.max(0, x * T - ox), Math.min(n, x * T - ox + T), Math.max(0, y * T - oy), Math.min(n, y * T - oy + T)];
  for (let y = ty0 - 1; y <= ty0 + CHUNK; y++) for (let x = tx0 - 1; x <= tx0 + CHUNK; x++) {
    const v = tAt(terr, x, y), [x0, x1, y0, y1] = span(x, y);
    if (x0 >= x1 || y0 >= y1) continue;
    const isWater = v === WATER;
    const deck = v === ROAD && SIDES.some(([dx, dy]) => inMap(x + dx, y + dy) && terr[x + dx + (y + dy) * MW] === WATER);
    if (isWater || deck) for (let py = y0; py < y1; py++) { zone.fill(1, x0 + py * n, x1 + py * n); if (isWater) wet.fill(1, x0 + py * n, x1 + py * n); }
    if (v === ROAD) { for (let py = y0; py < y1; py++) cov.fill(1, x0 + py * n, x1 + py * n); continue; }
    if (!chamferable(terr, isDep, x, y)) continue;
    const cs = CORNERS.filter(([dx, dy]) => tAt(terr, x + dx, y) === ROAD && tAt(terr, x, y + dy) === ROAD);
    if (!cs.length) continue;
    const bx = x * T - ox, by = y * T - oy;
    for (let py = y0; py < y1; py++) for (let px = x0; px < x1; px++) {
      // copertura con 4 campioni per pixel: bordo diagonale senza scalini
      let c = 0;
      for (const [sx, sy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
        const u = px - bx + sx, w = py - by + sy;
        if (cs.some(([dx, dy]) => (dx < 0 ? u : T - u) + (dy < 0 ? w : T - w) <= T)) c++;
      }
      cov[px + py * n] = c / 4;
    }
  }
  // distanza dal bordo in terzi di pixel (fuori dal riquadro si considera strada: niente bordi finti ai lati)
  const d = new Uint16Array(n * n), BIG = 60000;
  for (let i = 0; i < n * n; i++) d[i] = cov[i] >= 0.5 ? BIG : 0;
  const at = (x, y) => (x < 0 || y < 0 || x >= n || y >= n ? BIG : d[x + y * n]);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const p = x + y * n; if (!d[p]) continue;
    d[p] = Math.min(d[p], at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4);
  }
  for (let y = n - 1; y >= 0; y--) for (let x = n - 1; x >= 0; x--) {
    const p = x + y * n; if (!d[p]) continue;
    d[p] = Math.min(d[p], at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4);
  }
  const img = new ImageData(n, n), D = img.data;
  const mix = (c, k, f) => { c[0] += (k[0] - c[0]) * f; c[1] += (k[1] - c[1]) * f; c[2] += (k[2] - c[2]) * f; };
  const c = [0, 0, 0];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const p = x + y * n, o = p * 4, wx = x + ox, wy = y + oy;
    if (!cov[p]) {
      // ombra del ponte sull'acqua, verso sud-est
      if (wet[p] && x >= 5 && y >= 6 && cov[p - 5 - 6 * n] >= 0.5) { D[o] = RGB.shadow[0]; D[o + 1] = RGB.shadow[1]; D[o + 2] = RGB.shadow[2]; D[o + 3] = 107; }
      continue;
    }
    const dist = d[p] / 3;
    // grana: rattoppi a bassa frequenza (rumore a celle di 16 px) e puntini
    const gx = wx / 16, gy = wy / 16, ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
    const nv = (hash(ix, iy, 9) * (1 - fx) + hash(ix + 1, iy, 9) * fx) * (1 - fy) + (hash(ix, iy + 1, 9) * (1 - fx) + hash(ix + 1, iy + 1, 9) * fx) * fy;
    const sp = hash(wx, wy, 4);
    let f = (1 + (nv - 0.5) * 0.12) * (sp < 0.05 ? 0.8 : sp > 0.975 ? 1.13 : 1);
    // solchi delle ruote: due fasce più scure a distanza fissa da ogni bordo, interrotte qua e là dal rumore
    if (!zone[p] && dist > 11 && dist < 19) f *= 1 - 0.09 * Math.sin((dist - 11) / 8 * Math.PI) * (0.6 + nv * 0.8);
    // crepe sottili e rattoppi più scuri
    const cg = hash(Math.floor(wx / 3), Math.floor(wy / 3), 7);
    if (cg > 0.992 && dist > 5) f *= 0.72;
    if (nv > 0.78 && hash(ix, iy, 11) > 0.6) f *= 0.9;
    c[0] = RGB.asphalt[0] * f; c[1] = RGB.asphalt[1] * f; c[2] = RGB.asphalt[2] * f;
    if (zone[p] && dist <= 3) mix(c, RGB.parapet, 1);
    else if (zone[p] && dist <= 4.2) mix(c, RGB.parapetDark, 0.6);
    else if (dist <= 1) mix(c, RGB.rim, 0.55);
    else if (dist > 3.5 && dist <= 4.8) mix(c, RGB.margin, 0.2);
    D[o] = c[0]; D[o + 1] = c[1]; D[o + 2] = c[2]; D[o + 3] = cov[p] * 255;
  }
  const tmp = mk(n, n); tmp.getContext('2d').putImageData(img, 0, 0);
  g.drawImage(tmp, PAD, PAD, CHUNK * T, CHUNK * T, tx0 * T, ty0 * T, CHUNK * T, CHUNK * T);
  free(tmp);
}

// Mezzeria tratteggiata, solo sui tratti regolari larghi 2–3 caselle: file di caselle uguali in sequenza (in verticale
// e in diagonale fino a 45° per le righe, in orizzontale e in diagonale bassa per le colonne). Agli incroci e nelle
// piazze (tratti più larghi) niente segnaletica.
function runs(terr, lineLen, at) {
  const out = [];
  for (let a = 0; a < lineLen.n; a++) {
    const list = []; let s = -1;
    for (let b = 0; b <= lineLen.m; b++) {
      const on = b < lineLen.m && terr[at(a, b)] === ROAD;
      if (on && s < 0) s = b; else if (!on && s >= 0) { list.push([s, b - 1]); s = -1; }
    }
    out.push(list);
  }
  return out;
}
function centerSegs(rr, maxShift, push) {
  for (let a = 0; a + 1 < rr.length; a++) for (const [s, e] of rr[a]) {
    const w = e - s + 1; if (w < 2 || w > 3) continue;
    const next = rr[a + 1].filter(([s2, e2]) => e2 >= s - 1 && s2 <= e + 1);
    if (next.length !== 1) continue;
    const [s2, e2] = next[0], w2 = e2 - s2 + 1; if (w2 < 2 || w2 > 3) continue;
    // ogni tratto deve avere un solo seguito anche all'indietro (niente biforcazioni)
    if (rr[a].filter(([s0, e0]) => e0 >= s2 - 1 && s0 <= e2 + 1).length !== 1) continue;
    const c1 = (s + e + 1) / 2, c2 = (s2 + e2 + 1) / 2, sh = Math.abs(c2 - c1);
    if (sh <= maxShift) push(a, c1, c2);
  }
}
function drawCenterLines(g, terr) {
  g.save(); g.strokeStyle = ROAD_COL.dash; g.lineWidth = 1.4; g.setLineDash([7, 9]); g.lineCap = 'butt';
  g.beginPath();
  // righe: tratti orizzontali impilati → strade verticali e diagonali fino a 45°
  centerSegs(runs(terr, { n: MH, m: MW }, (y, x) => x + y * MW), 1, (y, c1, c2) => { g.moveTo(c1 * T, (y + 0.5) * T); g.lineTo(c2 * T, (y + 1.5) * T); });
  // colonne: tratti verticali affiancati → strade orizzontali e diagonali basse
  centerSegs(runs(terr, { n: MW, m: MH }, (x, y) => x + y * MW), 0.5, (x, c1, c2) => { g.moveTo((x + 0.5) * T, c1 * T); g.lineTo((x + 1.5) * T, c2 * T); });
  g.stroke(); g.restore();
}

/* ---------- isolati e poderi ---------- */

// Colori dei tetti (RGB): tegole in più toni, tetti piani chiari degli edifici razionalisti, marciapiedi, cortili.
const ROOFS = [[150, 84, 62], [140, 78, 60], [158, 96, 70], [132, 86, 68], [146, 92, 74]];
const FLATS = [[150, 145, 130], [132, 130, 122], [160, 150, 128]];
const WALK = [116, 111, 100], YARD = [108, 98, 76];
const COURT = [[72, 86, 54], [80, 92, 58], [104, 99, 86], [96, 90, 76]];
const SH_X = 3, SH_Y = 4, DEPTH = 13, WALK_W = 3;

// Isolati: componenti di caselle CITY collegate per lato. Quelli di almeno 3 caselle sono isolati a corte (marciapiede,
// corpo di fabbrica lungo il perimetro, cortile dentro); quelli di 1–2 caselle sono poderi (aia, casa, fienile).
// Ogni isolato ha i suoi numeri casuali (dal seme e dalla prima casella): è uguale in tutti i pezzi che tocca.
// tree(g, x, y, r): chioma di un albero nello stile del terreno.
export function drawCity(g, terr, seed, mk, rect, tree) {
  if (!terr.includes(CITY)) return;
  const seen = new Uint8Array(MW * MH);
  for (let i = 0; i < MW * MH; i++) {
    if (terr[i] !== CITY || seen[i]) continue;
    const tiles = [], q = [i]; seen[i] = 1;
    while (q.length) {
      const j = q.pop(); tiles.push(j);
      const x = j % MW, y = (j / MW) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = nx + ny * MW;
        if (inMap(nx, ny) && terr[k] === CITY && !seen[k]) { seen[k] = 1; q.push(k); }
      }
    }
    let x0 = MW, y0 = MH, x1 = 0, y1 = 0;
    for (const j of tiles) { const x = j % MW, y = (j / MW) | 0; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    if (touches(rect, x0 - 1, y0 - 1, x1 + 2, y1 + 2)) drawBlock(g, tiles, mulberry32((seed * 17 + 5 + i * 7919) >>> 0), mk, tree);
  }
}

// Distanza (in pixel, metrica a scacchiera) di ogni pixel della maschera dal pixel esterno più vicino: 0 fuori.
function distLinf(m, W, H) {
  const d = new Uint16Array(W * H), at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : d[x + y * W]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = x + y * W; if (!m[p]) continue;
    d[p] = Math.min(at(x - 1, y), at(x - 1, y - 1), at(x, y - 1), at(x + 1, y - 1)) + 1;
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const p = x + y * W; if (!m[p]) continue;
    d[p] = Math.min(d[p], at(x + 1, y) + 1, at(x + 1, y + 1) + 1, at(x, y + 1) + 1, at(x - 1, y + 1) + 1);
  }
  return d;
}

function drawBlock(g, tiles, r, mk, tree) {
  let tx0 = MW, ty0 = MH, tx1 = 0, ty1 = 0;
  for (const j of tiles) { const x = j % MW, y = (j / MW) | 0; tx0 = Math.min(tx0, x); ty0 = Math.min(ty0, y); tx1 = Math.max(tx1, x); ty1 = Math.max(ty1, y); }
  const P = 6, W = (tx1 - tx0 + 1) * T + 2 * P, H = (ty1 - ty0 + 1) * T + 2 * P, ox = tx0 * T - P, oy = ty0 * T - P;
  const inC = new Uint8Array(W * H);
  for (const j of tiles) {
    const x0 = (j % MW) * T - ox, y0 = ((j / MW) | 0) * T - oy;
    for (let y = y0; y < y0 + T; y++) inC.fill(1, x0 + y * W, x0 + T + y * W);
  }
  const small = tiles.length <= 2, id = Math.floor(r() * 1e6);
  // distanza di ogni pixel dal bordo degli edifici (q, 0 fuori): l'altezza del tetto nasce da q
  let q;
  const extra = [];
  if (!small) {
    const dC = distLinf(inC, W, H);
    q = new Uint16Array(W * H); for (let p = 0; p < W * H; p++) q[p] = dC[p] > WALK_W ? dC[p] - WALK_W : 0;
  } else {
    const F = new Uint8Array(W * H);
    tiles.forEach((j, k) => {
      const x0 = (j % MW) * T - ox, y0 = ((j / MW) | 0) * T - oy, wide = r() < 0.5;
      // casa colonica (prima casella) e fienile più lungo e stretto (seconda), in posizione variabile
      const w = k ? (wide ? 22 : 12) : (wide ? 18 : 14) + Math.floor(r() * 3), h = k ? (wide ? 12 : 22) : (wide ? 13 : 17) + Math.floor(r() * 3);
      const bx = x0 + 4 + Math.floor(r() * (T - 8 - w)), by = y0 + 4 + Math.floor(r() * (T - 8 - h));
      for (let y = by; y < by + h; y++) F.fill(1, bx + y * W, bx + w + y * W);
      extra.push({ bx, by, w, h, k });
    });
    q = distLinf(F, W, H);
  }
  const flat = !small && r() < 0.3;
  const base = small ? ROOFS[Math.floor(r() * 2)] : flat ? FLATS[Math.floor(r() * FLATS.length)] : ROOFS[Math.floor(r() * ROOFS.length)];
  const court = COURT[Math.floor(r() * COURT.length)];
  const segX = 24 + Math.floor(r() * 24), segY = 24 + Math.floor(r() * 24), segOx = Math.floor(r() * 32), segOy = Math.floor(r() * 32);
  const seg = (x, y) => Math.floor((x + ox + segOx) / segX) * 4096 + Math.floor((y + oy + segOy) / segY);
  const roofH = p => { const v = q[p]; return !v ? 0 : small ? v : v > DEPTH ? 0 : Math.min(v, DEPTH + 1 - v); };
  const H_ = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : roofH(x + y * W));
  const isRoof = (x, y) => x >= 0 && y >= 0 && x < W && y < H && q[x + y * W] > 0 && (small || q[x + y * W] <= DEPTH);
  const img = new ImageData(W, H), D = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = x + y * W, o = p * 4;
    const shade = isRoof(x - SH_X, y - SH_Y);
    if (!inC[p]) {
      // ombra degli edifici sulla strada e sul campo accanto
      if (shade && !isRoof(x, y)) { D[o + 3] = 70; }
      continue;
    }
    const n = hash(x + ox, y + oy, 3) - 0.5;
    let c, f = 1 + n * 0.06;
    if (isRoof(x, y)) {
      const v = q[p], s = seg(x, y), sv = hash(id, s, 1);
      const tone = 0.9 + sv * 0.18;
      c = flat ? base : [base[0] + (sv - 0.5) * 18, base[1] + (hash(id, s, 2) - 0.5) * 12, base[2]];
      if (flat) {
        // tetto piano: cordolo chiaro, ombra del cordolo, qualche chiazza
        const e = small ? v : Math.min(v, DEPTH + 1 - v);
        f *= tone * (e === 1 ? 1.14 : e === 2 ? 0.84 : 1);
      } else {
        const h = roofH(p), gx = H_(x + 1, y) - H_(x - 1, y), gy = H_(x, y + 1) - H_(x, y - 1);
        // falde: chiare verso nord-ovest, scure verso sud-est; file di tegole parallele alla gronda
        f *= tone * (1 + 0.1 * (0.55 * gx + gy));
        const along = Math.abs(gy) >= Math.abs(gx) ? x + oy : y + ox;
        if (v % 3 === 0) f *= 0.84; else if ((along + Math.floor(v / 3) * 2) % 4 === 0) f *= 0.93;
        if (!small && h === Math.ceil((DEPTH + 1) / 2) && v === h) f *= 1.06;
      }
      // muri di confine tra un edificio e l'altro
      if ((x > 0 && isRoof(x - 1, y) && seg(x - 1, y) !== seg(x, y)) || (y > 0 && isRoof(x, y - 1) && seg(x, y - 1) !== seg(x, y))) f *= 0.72;
    } else if (q[p] > DEPTH && !small) {
      c = court; f *= shade ? 0.62 : 1;
    } else {
      // marciapiede (isolati) o aia (poderi), con il bordo del cordolo e le lastre
      c = small ? YARD : WALK;
      if (!small && ((x + ox) % 8 === 0 || (y + oy) % 8 === 0)) f *= 0.94;
      f *= shade ? 0.66 : 1;
    }
    D[o] = clamp(c[0] * f, 0, 255); D[o + 1] = clamp(c[1] * f, 0, 255); D[o + 2] = clamp(c[2] * f, 0, 255); D[o + 3] = 255;
  }
  // bordo del marciapiede o dell'aia: un pixel più scuro dove l'isolato tocca la strada o il campo
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = x + y * W; if (!inC[p] || isRoof(x, y)) continue;
    if (!inC[p - 1] || !inC[p + 1] || !inC[p - W] || !inC[p + W]) { const o = p * 4; D[o] *= 0.8; D[o + 1] *= 0.8; D[o + 2] *= 0.8; }
  }
  const c = mk(W, H); c.getContext('2d').putImageData(img, 0, 0);
  g.drawImage(c, ox, oy); free(c);
  decorate(g, r, { small, flat, q, W, H, ox, oy, extra }, tree);
}
// Dettagli disegnati sopra: alberi nei cortili grandi, volumi tecnici sui tetti piani, covone e alberi nei poderi.
function decorate(g, r, b, drawTree) {
  const { small, flat, q, W, H, ox, oy } = b;
  const tree = (x, y, rr) => drawTree(g, x, y, rr, r());
  if (small) {
    // un albero accanto alla casa, nell'aia
    for (const e of b.extra) {
      if (e.k || r() < 0.3) continue;
      const tx = Math.floor((e.bx + ox) / T) * T, ty = Math.floor((e.by + oy) / T) * T;
      const cx = e.bx + ox < tx + T / 2 ? tx + T - 6 : tx + 6, cy = e.by + oy < ty + T / 2 ? ty + T - 7 : ty + 7;
      tree(cx, cy, 4 + r() * 2);
    }
    return;
  }
  // punti candidati: cortile lontano dai muri (alberi) o tetto piano lontano dal cordolo (volumi tecnici)
  const pts = [];
  for (let y = 0; y < H; y += 3) for (let x = 0; x < W; x += 3) {
    const v = q[x + y * W];
    if (!flat && v > DEPTH + 7) pts.push([x, y]);
    if (flat && v >= 4 && v <= DEPTH - 3) pts.push([x, y]);
  }
  if (!pts.length) return;
  const n = flat ? Math.min(4, 1 + Math.floor(pts.length / 60)) : Math.min(5, Math.floor(pts.length / 40));
  for (let k = 0; k < n; k++) {
    const [x, y] = pts[Math.floor(r() * pts.length)];
    if (flat) {
      const w = 3 + Math.floor(r() * 3), h = 3 + Math.floor(r() * 3), px = x + ox - w / 2, py = y + oy - h / 2;
      g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(px + 1.5, py + 2, w, h);
      g.fillStyle = 'rgba(205,198,178,0.9)'; g.fillRect(px, py, w, h);
      g.fillStyle = 'rgba(255,250,235,0.35)'; g.fillRect(px, py, w, 0.8); g.fillRect(px, py, 0.8, h);
    } else if (r() < 0.75) tree(x + ox, y + oy, 4 + r() * 3);
  }
}

/* ---------- nomi dei luoghi ---------- */

// Nomi dei luoghi della mappa disegnata, in maiuscoletto spaziato e tenue, centrati sulla casella di riferimento.
// Compaiono solo da vicino: sotto lo zoom 0,6 spariscono, fino a 0,8 si accendono piano.
export function placesAlpha(z) { return clamp((z - 0.6) / 0.2, 0, 1); }
// seen(x, y): la casella è già esplorata (i nomi sulle zone ancora al buio sono più tenui).
export function drawPlaces(g, places, cam, z, dpr, cw, ch, seen) {
  const a = placesAlpha(z); if (!a) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.font = '600 11px "IBM Plex Sans Condensed", "Arial Narrow", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  if ('letterSpacing' in g) g.letterSpacing = '2px';
  g.lineJoin = 'round'; g.lineWidth = 3;
  for (const p of places) {
    const sx = ((p.x + 0.5) * T - cam.x) * z, sy = ((p.y + 0.5) * T - cam.y) * z;
    if (sx < -160 || sy < -20 || sx > cw + 160 || sy > ch + 20) continue;
    const s = p.name.toUpperCase(), k = a * (seen(p.x, p.y) ? 1 : 0.5);
    g.strokeStyle = `rgba(10,12,11,${(0.5 * k).toFixed(3)})`; g.strokeText(s, sx, sy);
    g.fillStyle = `rgba(240,231,204,${(0.62 * k).toFixed(3)})`; g.fillText(s, sx, sy);
  }
  if ('letterSpacing' in g) g.letterSpacing = '0px';
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
}
