// Generazione della mappa: simmetrica rispetto al centro, così i due schieramenti partono alla pari.
import { MW, MH, N, GROUND, DIRT, WATER, ROCK, FOREST, B0, B1, ENEMY_BASE2 } from './data.js';
import { mulberry32, makeNoise } from './util.js';

export function genMap(seed) {
  const rnd = mulberry32(seed);
  const n1 = makeNoise(rnd), n2 = makeNoise(rnd), n3 = makeNoise(rnd);
  const t = new Uint8Array(N);
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const h = n1(x / 10, y / 10) * 0.62 + n1(x / 4 + 40, y / 4 + 40) * 0.38;
    const f = n2(x / 6, y / 6) * 0.7 + n2(x / 2.5, y / 2.5) * 0.3;
    const d = n3(x / 8, y / 8);
    let v = GROUND;
    if (h < 0.31) v = WATER; else if (h > 0.70) v = ROCK; else if (f > 0.64) v = FOREST; else if (d > 0.6) v = DIRT;
    t[x + y * MW] = v;
  }
  for (let i = 0; i < N / 2; i++) t[N - 1 - i] = t[i];
  const inb = (x, y) => x >= 0 && y >= 0 && x < MW && y < MH;
  const setS = (x, y, v) => { if (!inb(x, y)) return; const i = x + y * MW; t[i] = v; t[N - 1 - i] = v; };
  const clearS = (x, y) => { if (!inb(x, y)) return; const v = t[x + y * MW]; if (v !== GROUND && v !== DIRT) setS(x, y, GROUND); };
  const disc = (cx, cy, r) => { for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) clearS(x, y); };
  const line = (x0, y0, x1, y1, r) => {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2); let jx = 0, jy = 0;
    for (let s = 0; s <= steps; s++) { const k = s / steps; jx = (jx + (rnd() - 0.5) * 0.7) * 0.9; jy = (jy + (rnd() - 0.5) * 0.7) * 0.9; disc(x0 + (x1 - x0) * k + jx, y0 + (y1 - y0) * k + jy, r); }
  };
  disc(B0.x, B0.y, 6.5);
  const deps = [];
  const okDep = (x, y) => x >= 2 && y >= 2 && x < MW - 2 && y < MH - 2 && deps.every(d => Math.abs(d.x - x) + Math.abs(d.y - y) >= 3);
  const addDep = (x, y) => { deps.push({ x, y }, { x: MW - 1 - x, y: MH - 1 - y }); disc(x, y, 1.2); };
  for (const [a, r] of [[-0.25, 5.5], [0.55, 6.5], [1.15, 6], [1.8, 5.5]]) {
    const aa = a + (rnd() - 0.5) * 0.25;
    const x = Math.round(B0.x + Math.cos(aa) * r), y = Math.round(B0.y + Math.sin(aa) * r);
    if (okDep(x, y)) addDep(x, y);
  }
  let tries = 0, mids = 0;
  while (mids < 4 && tries < 600) {
    tries++;
    const x = 4 + Math.floor(rnd() * (MW - 8)), y = 4 + Math.floor(rnd() * (MH - 8));
    if (x + y * MW >= N / 2) continue;
    if (Math.hypot(x - B0.x, y - B0.y) < 13 || Math.hypot(x - B1.x, y - B1.y) < 16) continue;
    if (Math.hypot(x - (MW - 1 - x), y - (MH - 1 - y)) < 6) continue;
    if (!okDep(x, y) || !okDep(MW - 1 - x, MH - 1 - y)) continue;
    addDep(x, y); mids++;
  }
  const mx = MW / 2 + (rnd() - 0.5) * 18, my = MH / 2 + (rnd() - 0.5) * 18;
  line(B0.x, B0.y, mx, my, 1.4); line(mx, my, MW / 2 - 0.5, MH / 2 - 0.5, 1.4);
  const ax = 10 + rnd() * 16, ay = MH / 2 + 4 + rnd() * 10;
  line(B0.x, B0.y, ax, ay, 1.1); line(ax, ay, MW / 2 - 0.5, MH / 2 - 0.5, 1.1);
  const reach = bfsReach(t, B0.x, B0.y);
  for (const d of deps) if (d.x + d.y * MW < N / 2 && !reach[d.x + d.y * MW]) line(d.x, d.y, B0.x, B0.y, 1.0);
  for (const d of deps) { const i = d.x + d.y * MW; if (t[i] !== GROUND && t[i] !== DIRT) t[i] = GROUND; }
  return { t, deps };
}

export function bfsReach(t, sx, sy) {
  const r = new Uint8Array(N), q = [sx + sy * MW]; r[q[0]] = 1;
  while (q.length) {
    const i = q.pop(), x = i % MW, y = (i / MW) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
      const j = nx + ny * MW; if (r[j]) continue;
      if (t[j] === GROUND || t[j] === DIRT) { r[j] = 1; q.push(j); }
    }
  }
  return r;
}

/* ---------- ritocchi per le missioni della campagna ----------
   missionMap(seed, opts) parte da genMap(seed) e applica ritocchi deterministici (stesso seme, stessa mappa):
   - opts.lake: lago lungo la diagonale tra le due metà della mappa, con due guadi stretti ai lati (FORDS);
     i giacimenti finiti in acqua o non più raggiungibili spariscono;
   - opts.bases === 2: spiazzo per una seconda base nemica in ENEMY_BASE2 (e il suo speculare), con tre giacimenti
     e strade verso la base nemica principale e verso il centro.
   Senza ritocchi restituisce esattamente genMap(seed). La mappa resta simmetrica rispetto al centro. */
// Guadi del lago: centro (x, y) sulla diagonale x + y = MW - 1; il secondo è lo speculare del primo.
export const FORDS = [{ x: 17, y: MH - 1 - 17 }, { x: MW - 1 - 17, y: 17 }];
export const LAKE_HALF = 5; // metà larghezza del lago, misurata su x + y
export function missionMap(seed, opts) {
  const m = genMap(seed);
  if (!opts) return m;
  const t = m.t, rnd = mulberry32((seed ^ 0x5eed) >>> 0);
  const sym = (x, y, v) => { if (x < 0 || y < 0 || x >= MW || y >= MH) return; const i = x + y * MW; t[i] = v; t[N - 1 - i] = v; };
  // Terra: toglie roccia e bosco (non l'acqua, se water è false).
  const land = (x, y, water) => { if (x < 0 || y < 0 || x >= MW || y >= MH) return; const v = t[x + y * MW]; if (v === ROCK || v === FOREST || (water && v === WATER)) sym(x, y, GROUND); };
  const disc = (cx, cy, r, water) => { for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) land(x, y, water); };
  const line = (x0, y0, x1, y1, r, water) => {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2); let jx = 0, jy = 0;
    for (let s = 0; s <= steps; s++) { const k = s / steps; jx = (jx + (rnd() - 0.5) * 0.7) * 0.9; jy = (jy + (rnd() - 0.5) * 0.7) * 0.9; disc(x0 + (x1 - x0) * k + jx, y0 + (y1 - y0) * k + jy, r, water); }
  };
  const inLake = (x, y) => Math.abs(x + y - (MW - 1)) <= LAKE_HALF;
  if (opts.lake) {
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (inLake(x, y)) t[x + y * MW] = WATER;
    // guadi: strisce larghe 3 caselle in diagonale, perpendicolari al lago, di terra battuta
    for (const f of FORDS) for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++)
      if (inLake(x, y) && Math.abs((x - y) - (f.x - f.y)) <= 1) t[x + y * MW] = DIRT;
    // dai guadi verso le due basi, solo sulla terra (il lago resta)
    for (const f of FORDS) {
      const a = LAKE_HALF + 1;
      line(f.x - a / 2, f.y - a / 2, B0.x, B0.y, 1.1, false);
      line(f.x + a / 2, f.y + a / 2, B1.x, B1.y, 1.1, false);
    }
  }
  if (opts.bases === 2) {
    const b = ENEMY_BASE2;
    disc(b.x, b.y, 6, true);
    line(b.x, b.y, B1.x, B1.y, 1.3, !opts.lake);
    line(b.x, b.y, MW / 2 - 0.5, MH / 2 - 0.5, 1.2, !opts.lake);
    // via i giacimenti sotto il futuro comando, poi tre giacimenti attorno alla base
    const far = d => Math.hypot(d.x - b.x, d.y - b.y) > 3 && Math.hypot(d.x - (MW - 1 - b.x), d.y - (MH - 1 - b.y)) > 3;
    m.deps = m.deps.filter(far);
    const okDep = (x, y) => x >= 2 && y >= 2 && x < MW - 2 && y < MH - 2 && m.deps.every(d => Math.abs(d.x - x) + Math.abs(d.y - y) >= 3);
    for (const [dx, dy] of [[-5, 1], [-3, 4], [1, 5], [-5, -3]]) {
      const x = b.x + dx, y = b.y + dy;
      if (okDep(x, y)) { m.deps.push({ x, y }, { x: MW - 1 - x, y: MH - 1 - y }); disc(x, y, 1.2, true); }
    }
  }
  // giacimenti: niente in acqua; quelli irraggiungibili da entrambe le basi (a piedi) spariscono
  for (const d of m.deps) { const i = d.x + d.y * MW; if (t[i] !== WATER && t[i] !== GROUND && t[i] !== DIRT) t[i] = GROUND; }
  const r0 = bfsReach(t, B0.x, B0.y), r1 = bfsReach(t, B1.x, B1.y);
  const ok = d => { const i = d.x + d.y * MW; return t[i] !== WATER && (r0[i] || r1[i]); };
  m.deps = m.deps.filter(d => ok(d) && ok({ x: MW - 1 - d.x, y: MH - 1 - d.y }));
  return m;
}
