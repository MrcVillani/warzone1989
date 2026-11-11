// Terreno a pezzi (un settore della carta, 256×256 pixel del mondo) cotti in un Web Worker e copiati in una tela della
// mappa intera, che il fotogramma disegna con un solo drawImage. Se il worker non si avvia (o manca OffscreenCanvas) i
// pezzi si cuociono sul filo principale, uno per fotogramma. Finché un pezzo non è pronto si vede il terreno di riserva
// (una casella = un pixel, sfumato).
// Varianti di un pezzo: con o senza chiome cotte (gli alberi vivi si disegnano sopra), di giorno o con la tinta della
// notte (quando la tela della luce è spenta). Solo disegno: il terreno vero è quello del motore.
import { TILE, MW, MH, N, P, GROUND, DIRT, WATER, ROCK, FOREST, CITY, ROAD, S, terr, depIdx, findPath, FORDS, clamp } from '../engine/index.js';
import { bakeChunk, mapObjects, makeNoise2 } from './terrain-bake.js';
import { CHUNK } from './look.js';

const NC = (MW * TILE) / CHUNK;
const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
let world = null, gen = 0;
// chunks: pezzi chiesti e non ancora copiati (chiave variante:cx,cy); queue: richieste in attesa del worker
const chunks = new Map(), queue = [];
export const terrainStats = { mode: 'nessuno', baked: 0, workerMs: 0, mainMs: 0, failed: 0 };

/* ---------- mappa in corso ---------- */
// Seme di strade e città: fisso per mappa disegnata (Latina è sempre uguale), dal seme altrimenti.
const urbanSeed = seed => (S && S.map ? [...S.map].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) % 100000 : seed);
// Sterrati disegnati sulle mappe senza strade vere: dal comando di ogni lato verso il centro (o verso i guadi del lago),
// sul percorso A* del motore ammorbidito. Solo aspetto.
function dirtPaths() {
  if (terr.includes(ROAD)) return [];
  const out = [], lake = S && S.mapOpts && S.mapOpts.lake;
  for (const hq of S.ents.filter(e => e.type === 'hq' && !e.dead && (e.owner === P || !lake))) {
    const from = [hq.tx + 1, hq.ty + hq.h], goals = lake ? FORDS : [{ x: MW >> 1, y: MH >> 1 }];
    for (const f of goals) {
      const p = findPath(from[0], from[1], f.x, f.y, false); if (!p || p.length < 4) continue;
      let pts = [[from[0], from[1]], ...p].map(([x, y]) => [(x + 0.5) * TILE, (y + 0.5) * TILE]);
      for (let it = 0; it < 3; it++) {
        const q = [pts[0]];
        for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); }
        q.push(pts[pts.length - 1]); pts = q;
      }
      out.push(pts.filter((_, i) => i % 2 === 0 || i === pts.length - 1));
    }
  }
  return out;
}
// Colori del terreno di riserva, per codice di terreno.
const FALLBACK = { [GROUND]: [84, 98, 56], [DIRT]: [112, 92, 66], [WATER]: [40, 62, 72], [ROCK]: [110, 106, 98], [FOREST]: [50, 66, 38], [CITY]: [140, 104, 84], [ROAD]: [72, 72, 67] };
// Tela della mappa intera (come la tela del terreno di prima): i pezzi cotti ci si copiano una volta e il fotogramma
// ne copia la parte in vista con un solo drawImage. shown[i]: variante mostrata dal pezzo i (null = terreno di riserva).
let big = null, bg = null;
const shown = new Array(NC * NC).fill(null);
// Nuova mappa (evento «world»): via i pezzi della precedente, oggetti fissi e terreno di riserva da capo.
export function resetTerrain(seed) {
  gen++;
  chunks.clear(); queue.length = 0; shown.fill(null);
  let tk = 7; for (let i = 0; i < N; i++) tk = (tk * 31 + terr[i]) | 0;
  const dep = new Uint8Array(N); for (let i = 0; i < N; i++) dep[i] = depIdx[i] >= 0 ? 1 : 0;
  const tiles = mkCanvas(MW, MH), tg = tiles.getContext('2d'), ti = tg.createImageData(MW, MH);
  for (let i = 0; i < N; i++) { const c = FALLBACK[terr[i]] || FALLBACK[GROUND]; ti.data[i * 4] = c[0]; ti.data[i * 4 + 1] = c[1]; ti.data[i * 4 + 2] = c[2]; ti.data[i * 4 + 3] = 255; }
  tg.putImageData(ti, 0, 0);
  if (!big) { big = mkCanvas(MW * TILE, MH * TILE); bg = big.getContext('2d'); }
  bg.setTransform(1, 0, 0, 1, 0, 0); bg.globalCompositeOperation = 'source-over'; bg.globalAlpha = 1; bg.imageSmoothingEnabled = true;
  bg.drawImage(tiles, 0, 0, MW, MH, 0, 0, MW * TILE, MH * TILE);
  // gli sterrati si tracciano alla prima cottura: all'evento «world» i comandi non sono ancora sulla mappa
  world = { seed, useed: urbanSeed(seed), tkey: tk, terr: Uint8Array.from(terr), dep, paths: null, tiles, objs: mapObjects(terr, seed), wmask: null, hasWater: terr.includes(WATER) };
}
export const mapObjs = () => world && world.objs;

/* ---------- cottura ---------- */
const SRC = typeof __TERRAIN_WORKER__ === 'string' ? __TERRAIN_WORKER__ : null; // eslint-disable-line no-undef
let workers = null, nextId = 1, inFlight = 0, lastMain = 0;
const jobs = new Map();
const vkey = v => `${v.canopy ? 'c' : 'n'}${v.dark ? 'd' : 'g'}`;
function pathsOf() {
  if (!world.paths) { try { world.paths = dirtPaths(); } catch (e) { world.paths = []; } }
  return world.paths;
}
const argsOf = (cx, cy, v) => ({ cx, cy, res: 1, seed: world.seed, useed: world.useed, tkey: world.tkey, terr: world.terr, dep: world.dep, paths: pathsOf(), canopy: !!v.canopy, dark: !!v.dark });
function toMain(why) {
  if (terrainStats.mode === 'principale') return;
  terrainStats.mode = 'principale'; terrainStats.why = why;
  if (workers) for (const w of workers) w.terminate();
  workers = [];
  // i lavori rimasti nel worker tornano in coda
  for (const j of jobs.values()) if (j.gen === gen && chunks.has(j.key)) queue.unshift(j.req);
  jobs.clear(); inFlight = 0;
}
function pool() {
  if (workers) return workers;
  workers = [];
  if (!SRC || typeof Worker !== 'function' || typeof Blob !== 'function') { toMain(SRC ? 'nessun Worker' : 'worker non incluso'); return workers; }
  try {
    const url = URL.createObjectURL(new Blob([SRC], { type: 'text/javascript' }));
    const n = clamp((navigator.hardwareConcurrency || 2) - 1, 1, 2);
    for (let i = 0; i < n; i++) {
      const w = new Worker(url);
      w.onmessage = e => done(e.data);
      w.onerror = e => { e.preventDefault && e.preventDefault(); toMain('errore del worker'); };
      workers.push(w);
    }
    terrainStats.mode = 'worker';
  } catch (e) { toMain('worker non avviato'); }
  return workers;
}
function done(d) {
  const j = jobs.get(d.id); if (!j) { if (d.bmp) d.bmp.close(); return; }
  jobs.delete(d.id); inFlight--;
  if (d.error) { toMain(d.error); queue.unshift(j.req); return; }
  terrainStats.workerMs += performance.now() - j.t0;
  if (j.gen !== gen) { d.bmp.close(); return; }
  ready(j.req, d.bmp); d.bmp.close();
}
// Segni che restano timbrati sulla tela della mappa (decals.js): painter(g, x0, y0, x1, y1) li ridisegna dentro un
// pezzo appena copiato (che li aveva coperti).
let painter = null;
export function setChunkPainter(fn) { painter = fn; }
// Disegna fn(g) sulla tela della mappa (coordinate del mondo).
export function paintChunks(x, y, r, fn) {
  if (!bg) return;
  bg.setTransform(1, 0, 0, 1, 0, 0); bg.globalCompositeOperation = 'source-over'; bg.globalAlpha = 1;
  fn(bg);
}
// Pezzo cotto: si copia nella tela della mappa, si ritimbrano i segni che lo toccano, la variante diventa quella mostrata.
function ready(req, img) {
  if (!chunks.has(req.key)) return;
  chunks.delete(req.key);
  const x0 = req.cx * CHUNK, y0 = req.cy * CHUNK;
  bg.setTransform(1, 0, 0, 1, 0, 0); bg.globalCompositeOperation = 'source-over'; bg.globalAlpha = 1;
  bg.drawImage(img, x0, y0, CHUNK, CHUNK);
  if (painter) { bg.save(); bg.beginPath(); bg.rect(x0, y0, CHUNK, CHUNK); bg.clip(); painter(bg, x0, y0, x0 + CHUNK, y0 + CHUNK); bg.restore(); }
  shown[req.cx + req.cy * NC] = req.v;
  terrainStats.baked++;
}
// Chiede il pezzo cx, cy nella variante v (se non è già quella mostrata o in cottura); front: prima degli altri.
function request(cx, cy, v, front) {
  const s = shown[cx + cy * NC];
  if (s && s.canopy === !!v.canopy && s.dark === !!v.dark) return;
  const key = `${vkey(v)}:${cx},${cy}`;
  if (chunks.has(key)) return;
  chunks.set(key, true);
  const req = { key, cx, cy, v: { canopy: !!v.canopy, dark: !!v.dark }, front };
  if (front) queue.unshift(req); else queue.push(req);
}
// A ogni fotogramma: manda in cottura i pezzi in coda (worker) o ne cuoce uno (filo principale).
export function pumpTerrain() {
  if (!world || !queue.length) return;
  const ws = pool();
  if (terrainStats.mode === 'worker') {
    while (queue.length && inFlight < ws.length * 2) {
      const req = queue.shift(); if (!chunks.has(req.key)) continue;
      const id = nextId++; jobs.set(id, { key: req.key, req, gen, t0: performance.now() }); inFlight++;
      ws[id % ws.length].postMessage({ id, args: argsOf(req.cx, req.cy, req.v) });
    }
    return;
  }
  // sul filo principale: i pezzi della visuale subito, uno per fotogramma; gli altri al massimo due al secondo
  const now = performance.now();
  while (queue.length) {
    const req = queue[0]; if (!chunks.has(req.key)) { queue.shift(); continue; }
    if (!req.front && now - lastMain < 500) break;
    queue.shift(); lastMain = now;
    const t0 = performance.now();
    try { const c = bakeChunk(argsOf(req.cx, req.cy, req.v), mkCanvas); ready(req, c); c.width = c.height = 0; } catch (e) { terrainStats.failed++; chunks.delete(req.key); }
    terrainStats.mainMs += performance.now() - t0;
    break;
  }
}

/* ---------- disegno ---------- */
// Parte in vista della tela della mappa (vr: rettangolo del mondo); i pezzi della visuale che non mostrano la
// variante v si chiedono per primi, poi gli altri della mappa, dal più vicino, così scorrendo sono già pronti.
// Restituisce i pezzi in vista senza chiome cotte (lì vanno gli alberi vivi) e quelli che mancano della tinta notturna.
// busy: il dispositivo non sta al passo (fotogrammi lunghi): il resto della mappa si cuoce piano, un pezzo al secondo,
// così il worker non toglie tempo al gioco; i pezzi della visuale si chiedono sempre subito.
const drawn = { bare: new Set(), undark: [] };
let lastRest = 0;
export function drawTerrain(g, vr, v, busy) {
  drawn.bare.clear(); drawn.undark.length = 0;
  if (!world) return drawn;
  const cx0 = clamp(Math.floor(vr.x0 / CHUNK), 0, NC - 1), cy0 = clamp(Math.floor(vr.y0 / CHUNK), 0, NC - 1);
  const cx1 = clamp(Math.floor(vr.x1 / CHUNK), 0, NC - 1), cy1 = clamp(Math.floor(vr.y1 / CHUNK), 0, NC - 1);
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    request(cx, cy, v, true);
    const s = shown[cx + cy * NC];
    if (!s || !s.canopy) drawn.bare.add(cx + cy * NC);
    if (v.dark && !(s && s.dark)) drawn.undark.push(cx, cy);
  }
  const x0 = Math.max(0, vr.x0), y0 = Math.max(0, vr.y0), x1 = Math.min(MW * TILE, vr.x1), y1 = Math.min(MH * TILE, vr.y1);
  if (x1 > x0 && y1 > y0) g.drawImage(big, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
  const now = performance.now();
  if (queue.length < 2 && (!busy || now - lastRest > 1000)) {
    // il resto della mappa, a cerchi attorno alla visuale
    lastRest = now;
    const mx = (cx0 + cx1) / 2, my = (cy0 + cy1) / 2, rest = [];
    for (let cy = 0; cy < NC; cy++) for (let cx = 0; cx < NC; cx++) { const s = shown[cx + cy * NC]; if (!s || s.canopy !== !!v.canopy || s.dark !== !!v.dark) rest.push([Math.hypot(cx - mx, cy - my), cx, cy]); }
    rest.sort((a, b) => a[0] - b[0]);
    for (const [, cx, cy] of rest.slice(0, terrainStats.mode === 'worker' && !busy ? 4 : 1)) request(cx, cy, v, false);
  }
  return drawn;
}
// Il punto x, y del mondo sta su un pezzo in vista senza chiome cotte?
export const bareAt = (x, y) => drawn.bare.has(clamp(Math.floor(x / CHUNK), 0, NC - 1) + clamp(Math.floor(y / CHUNK), 0, NC - 1) * NC);
// Pezzi della visuale tutti pronti nella variante v (per le foto dei test).
export function terrainReady(vr, v) {
  if (!world) return false;
  const cx0 = clamp(Math.floor(vr.x0 / CHUNK), 0, NC - 1), cy0 = clamp(Math.floor(vr.y0 / CHUNK), 0, NC - 1);
  const cx1 = clamp(Math.floor(vr.x1 / CHUNK), 0, NC - 1), cy1 = clamp(Math.floor(vr.y1 / CHUNK), 0, NC - 1);
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) { const s = shown[cx + cy * NC]; if (!s || s.canopy !== !!v.canopy || s.dark !== !!v.dark) return false; }
  return true;
}

/* ---------- maschera dell'acqua ---------- */
// A 1/4 di risoluzione, con le rive morbide e mosse dallo stesso rumore del terreno: serve all'acqua animata. Si
// calcola a righe, MASK_ROWS per fotogramma (niente fotogrammi lunghi): finché non è pronta l'acqua resta ferma.
const MASK_ROWS = 24;
export function waterMask() {
  if (!world || !world.hasWater) return null;
  const mw = MW * TILE / 4;
  let m = world.wmask;
  if (!m) {
    const c = mkCanvas(mw, mw), g = c.getContext('2d');
    m = world.wmask = { c, g, img: g.createImageData(mw, mw), y: 0, n1: makeNoise2(world.seed * 13 + 1), done: false };
  }
  if (m.done) return m.c;
  const Wt = (x, y) => (world.terr[clamp(x, 0, MW - 1) + clamp(y, 0, MH - 1) * MW] === WATER ? 1 : 0), n1 = m.n1, d = m.img.data;
  for (const y1 = Math.min(mw, m.y + MASK_ROWS); m.y < y1; m.y++) for (let x = 0; x < mw; x++) {
    const wx = x * 4 + 2, wy = m.y * 4 + 2;
    const tx = (wx + (n1(wx / 46, wy / 46) - 0.5) * 34) / TILE - 0.5, ty = (wy + (n1(wx / 46 + 31.7, wy / 46 + 11.3) - 0.5) * 34) / TILE - 0.5;
    const x0 = Math.floor(tx), y0 = Math.floor(ty), u = tx - x0, v = ty - y0;
    if (!Wt(x0, y0) && !Wt(x0 + 1, y0) && !Wt(x0, y0 + 1) && !Wt(x0 + 1, y0 + 1)) continue;
    let w = Wt(x0, y0) * (1 - u) * (1 - v) + Wt(x0 + 1, y0) * u * (1 - v) + Wt(x0, y0 + 1) * (1 - u) * v + Wt(x0 + 1, y0 + 1) * u * v;
    w = clamp((w - 0.55) * 6 + 0.5, 0, 1); d[(x + m.y * mw) * 4 + 3] = w * 255;
  }
  if (m.y < mw) return null;
  m.g.putImageData(m.img, 0, 0); m.done = true; m.img = null;
  return m.c;
}
// Il colpo è caduto in acqua? (schizzi e cerchi al posto della fiammata)
export const isWaterAt = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return tx >= 0 && ty >= 0 && tx < MW && ty < MH && terr[tx + ty * MW] === WATER; };
