// Passabilità e percorsi (A* su griglia a 8 direzioni, senza tagliare gli angoli).
import { MW, MH, N, WATER, ROAD, WALKABLE } from './data.js';
import { terr, occ, hasRoad, roadMul } from './world.js';
import { ftile } from './util.js';

export function passable(x, y, water) {
  if (x < 0 || y < 0 || x >= MW || y >= MH) return false;
  const i = x + y * MW; if (occ[i]) return false;
  const v = terr[i]; return WALKABLE[v] === 1 || (!!water && v === WATER);
}
export function nearestFree(tx, ty, water, maxR = 12) {
  for (let r = 0; r <= maxR; r++) {
    let best = null, bd = 1e9;
    for (let y = ty - r; y <= ty + r; y++) for (let x = tx - r; x <= tx + r; x++) {
      if (Math.max(Math.abs(x - tx), Math.abs(y - ty)) !== r) continue;
      if (passable(x, y, water)) { const d = (x - tx) ** 2 + (y - ty) ** 2; if (d < bd) { bd = d; best = [x, y]; } }
    }
    if (best) return best;
  }
  return null;
}

const gS = new Float32Array(N), from = new Int32Array(N), stamp = new Uint32Array(N), closed = new Uint32Array(N);
let stampV = 0; const hI = [], hF = [];
function hpush(i, f) { hI.push(i); hF.push(f); let c = hI.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (hF[p] <= hF[c]) break; [hI[p], hI[c]] = [hI[c], hI[p]]; [hF[p], hF[c]] = [hF[c], hF[p]]; c = p; } }
function hpop() {
  const top = hI[0], li = hI.pop(), lf = hF.pop();
  if (hI.length) {
    hI[0] = li; hF[0] = lf; let c = 0;
    for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < hI.length && hF[l] < hF[m]) m = l; if (r < hI.length && hF[r] < hF[m]) m = r; if (m === c) break; [hI[m], hI[c]] = [hI[c], hI[m]]; [hF[m], hF[c]] = [hF[c], hF[m]]; c = m; }
  }
  return top;
}
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];

// Restituisce le caselle da attraversare (esclusa quella di partenza). Se la meta non è raggiungibile,
// porta il più vicino possibile; oltre 5000 espansioni si ferma alla casella migliore trovata.
// road: moltiplicatore di velocità del mezzo sulla strada (roadMul): entrare in una casella di strada costa 1/road,
// così il percorso preferisce le strade quando fanno guadagnare tempo. Sulle mappe senza strade (hasRoad falso) il
// calcolo è quello di sempre.
export function findPath(sx, sy, gx, gy, water, road = 1) {
  if (!passable(gx, gy, water)) { const f = nearestFree(gx, gy, water, 10); if (!f) return null; gx = f[0]; gy = f[1]; }
  if (sx === gx && sy === gy) return [];
  stampV++; hI.length = 0; hF.length = 0;
  const s = sx + sy * MW, goal = gx + gy * MW;
  const rk = hasRoad && road > 1 ? 1 / road : 1;
  // Con le strade la stima si riduce dello stesso fattore, così resta ottimistica e il percorso più rapido si trova.
  const h = rk === 1
    ? (x, y) => { const dx = Math.abs(x - gx), dy = Math.abs(y - gy); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); }
    : (x, y) => { const dx = Math.abs(x - gx), dy = Math.abs(y - gy); return (Math.max(dx, dy) + 0.414 * Math.min(dx, dy)) * rk; };
  stamp[s] = stampV; gS[s] = 0; from[s] = -1; hpush(s, h(sx, sy));
  let best = s, bestH = h(sx, sy), exp = 0;
  while (hI.length) {
    const c = hpop(); if (closed[c] === stampV) continue; closed[c] = stampV;
    if (c === goal) { best = c; break; }
    const cx = c % MW, cy = (c / MW) | 0, hc = h(cx, cy);
    if (hc < bestH) { bestH = hc; best = c; }
    if (++exp > 5000) break;
    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (!passable(nx, ny, water)) continue;
      if (dx && dy && (!passable(cx + dx, cy, water) || !passable(cx, cy + dy, water))) continue;
      const n = nx + ny * MW; if (closed[n] === stampV) continue;
      const gg = gS[c] + (rk !== 1 && terr[n] === ROAD ? cost * rk : cost);
      if (stamp[n] !== stampV || gg < gS[n]) { stamp[n] = stampV; gS[n] = gg; from[n] = c; hpush(n, gg + h(nx, ny)); }
    }
  }
  const path = []; let c = best;
  while (c !== -1 && c !== s) { path.push([c % MW, (c / MW) | 0]); c = from[c]; }
  return path.reverse();
}
// Caselle raggiungibili da una o più caselle di partenza, con le stesse regole di findPath (8 direzioni, senza
// tagliare gli angoli). Restituisce per ogni casella 0 se non è raggiungibile, altrimenti 1 + il numero di passi
// (ogni passo, anche in diagonale, conta 1). Le caselle di partenza contano come raggiunte anche se occupate.
// `block` è l'indice di una casella da trattare come occupata (per esempio il giacimento di una futura pompa).
export function reachMap(starts, water, block = -1) {
  const r = new Uint16Array(N), ok = new Uint8Array(N), q = new Int32Array(N);
  for (let i = 0; i < N; i++) { const v = terr[i]; ok[i] = !occ[i] && (WALKABLE[v] === 1 || (water && v === WATER)) ? 1 : 0; }
  if (block >= 0 && block < N) ok[block] = 0;
  let qh = 0, qt = 0;
  for (const [x, y] of starts) {
    if (x < 0 || y < 0 || x >= MW || y >= MH) continue;
    const i = x + y * MW; if (!r[i]) { r[i] = 1; q[qt++] = i; }
  }
  while (qh < qt) {
    const c = q[qh++], cx = c % MW, cy = (c / MW) | 0, v = r[c] + 1;
    const l = cx > 0 && ok[c - 1], rt = cx < MW - 1 && ok[c + 1], u = cy > 0 && ok[c - MW], d = cy < MH - 1 && ok[c + MW];
    if (l && !r[c - 1]) { r[c - 1] = v; q[qt++] = c - 1; }
    if (rt && !r[c + 1]) { r[c + 1] = v; q[qt++] = c + 1; }
    if (u && !r[c - MW]) { r[c - MW] = v; q[qt++] = c - MW; }
    if (d && !r[c + MW]) { r[c + MW] = v; q[qt++] = c + MW; }
    // In diagonale solo se entrambe le caselle di lato sono libere (come findPath).
    if (l && u && ok[c - MW - 1] && !r[c - MW - 1]) { r[c - MW - 1] = v; q[qt++] = c - MW - 1; }
    if (rt && u && ok[c - MW + 1] && !r[c - MW + 1]) { r[c - MW + 1] = v; q[qt++] = c - MW + 1; }
    if (l && d && ok[c + MW - 1] && !r[c + MW - 1]) { r[c + MW - 1] = v; q[qt++] = c + MW - 1; }
    if (rt && d && ok[c + MW + 1] && !r[c + MW + 1]) { r[c + MW + 1] = v; q[qt++] = c + MW + 1; }
  }
  return r;
}
// Caselle attorno al rettangolo (tx, ty, w, h) segnate in una mappa di reachMap.
export function reachableAdj(tx, ty, w, h, R) {
  const out = [];
  for (let y = ty - 1; y <= ty + h; y++) for (let x = tx - 1; x <= tx + w; x++) {
    if (x >= tx && x < tx + w && y >= ty && y < ty + h) continue;
    if (x < 0 || y < 0 || x >= MW || y >= MH || !R[x + y * MW]) continue;
    out.push([x, y]);
  }
  return out;
}
export function pathTo(u, wx, wy) {
  const p = findPath(ftile(u.x), ftile(u.y), ftile(wx), ftile(wy), u.water, roadMul(u));
  u.path = p && p.length ? p : null; u.pi = 0; u.stk = 0; u.sx0 = u.x; u.sy0 = u.y;
}
// Caselle libere vicine a un punto, per disporre un gruppo senza ammassarlo.
export function formation(tx, ty, n, water) {
  const st = passable(tx, ty, water) ? [tx, ty] : nearestFree(tx, ty, water, 10);
  if (!st) return [];
  const out = [], seen = new Set([st[0] + st[1] * MW]), q = [st];
  while (q.length && out.length < n) {
    const c = q.shift(); out.push(c);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = c[0] + dx, y = c[1] + dy, k = x + y * MW;
      if (seen.has(k) || !passable(x, y, water)) continue; seen.add(k); q.push([x, y]);
    }
  }
  return out;
}
