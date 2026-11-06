import { TILE } from './data.js';

export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export function makeNoise(rnd) {
  const g = new Float32Array(32 * 32); for (let i = 0; i < g.length; i++) g[i] = rnd();
  const v = (x, y) => g[(x & 31) + (y & 31) * 32], sm = t => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), u = sm(x - xi), w = sm(y - yi);
    const a = v(xi, yi), b = v(xi + 1, yi), c = v(xi, yi + 1), d = v(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
  };
}
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
export const turnToward = (a, b, s) => { const d = angDiff(a, b); return Math.abs(d) <= s ? b : a + Math.sign(d) * s; };
export const ftile = v => Math.floor(v / TILE);
// Riferimento di settore sulla carta: colonne A–H, righe 1–8, quadrati da 8 caselle.
export const gridRef = (tx, ty) => 'ABCDEFGH'[clamp(Math.floor(tx / 8), 0, 7)] + (clamp(Math.floor(ty / 8), 0, 7) + 1);
