// Passabilità e percorsi (A* su griglia a 8 direzioni, senza tagliare gli angoli).
import { MW, MH, N, GROUND, DIRT, WATER } from './data.js';
import { terr, occ } from './world.js';
import { ftile } from './util.js';

export function passable(x, y, water) {
  if (x < 0 || y < 0 || x >= MW || y >= MH) return false;
  const i = x + y * MW; if (occ[i]) return false;
  const v = terr[i]; return v === GROUND || v === DIRT || (water && v === WATER);
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
export function findPath(sx, sy, gx, gy, water) {
  if (!passable(gx, gy, water)) { const f = nearestFree(gx, gy, water, 10); if (!f) return null; gx = f[0]; gy = f[1]; }
  if (sx === gx && sy === gy) return [];
  stampV++; hI.length = 0; hF.length = 0;
  const s = sx + sy * MW, goal = gx + gy * MW;
  const h = (x, y) => { const dx = Math.abs(x - gx), dy = Math.abs(y - gy); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
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
      const gg = gS[c] + cost;
      if (stamp[n] !== stampV || gg < gS[n]) { stamp[n] = stampV; gS[n] = gg; from[n] = c; hpush(n, gg + h(nx, ny)); }
    }
  }
  const path = []; let c = best;
  while (c !== -1 && c !== s) { path.push([c % MW, (c / MW) | 0]); c = from[c]; }
  return path.reverse();
}
export function pathTo(u, wx, wy) {
  const p = findPath(ftile(u.x), ftile(u.y), ftile(wx), ftile(wy), u.water);
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
