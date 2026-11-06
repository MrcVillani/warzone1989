// Stato della partita, entità, visibilità ed eventi verso il client.
// Le variabili esportate con `let` sono binding "vivi": chi le importa legge sempre il valore attuale,
// ma solo questo modulo le riassegna.
import { TILE, MW, MH, N, P, E, B0, STRUCTS, CHASSIS, PROPS, WEAPONS, DIFF, BUILDER } from './data.js';
import { genMap } from './map.js';
import { ftile } from './util.js';

export let S = null;
export let terr = null, deposits = [], depIdx = null, occ = null, vis = null, explored = null;
export const idx = new Map();
export const proj = [];

/* ---------- eventi ----------
   Il motore non disegna e non conosce il DOM: comunica con il client tramite eventi.
   toast {text, kind} · ping {x, y} · fx {k, ...} · world {} · fog {} · end {won} */
const listeners = new Set();
export function onEvent(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function emit(type, data = {}) { for (const f of listeners) f(type, data); }

/* ---------- entità ---------- */
export function ent(id) { return id ? idx.get(id) : undefined; }
export function markOcc(s, v) { for (let y = s.ty; y < s.ty + s.h; y++) for (let x = s.tx; x < s.tx + s.w; x++) occ[x + y * MW] = v; }
function addEnt(e) { e.id = S.nextId++; S.ents.push(e); idx.set(e.id, e); if (e.kind === 'struct') markOcc(e, e.id); return e; }

export function makeStruct(type, owner, tx, ty, built) {
  const D = STRUCTS[type];
  return addEnt({
    kind: 'struct', type, owner, tx, ty, w: D.w, h: D.h, x: (tx + D.w / 2) * TILE, y: (ty + D.h / 2) * TILE,
    max: D.hp, hp: built ? D.hp : D.hp * 0.05, built: built ? 1 : 0, queue: [], rally: null, rs: null,
    cd: 0, tang: owner === P ? 0.8 : -2.3, tgt: 0, scan: 0, phase: Math.random() * 6, seen: false,
  });
}
export function dStats(d, owner) {
  const c = CHASSIS[d.c], p = PROPS[d.p], w = WEAPONS[d.w];
  const cost = c.cost + p.cost + w.cost;
  return {
    hp: Math.round(c.hp * p.hpm), armor: c.armor + (owner != null && S && S.tech[owner].arm ? 2 : 0),
    speed: 62 * p.speed * (1.12 - 0.12 * c.wt), cost, time: Math.round(5 + cost / 14),
    dps: w.dmg / w.rof, range: w.range,
  };
}
export function designName(d) { return `${CHASSIS[d.c].name} ${WEAPONS[d.w].short} ${PROPS[d.p].short}`; }
export function makeUnit(owner, d, x, y) {
  const builder = !d;
  const st = builder ? BUILDER : dStats(d, owner);
  const a = owner === P ? 0.8 : -2.3;
  return addEnt({
    kind: 'unit', owner, d: d ? { c: d.c, p: d.p, w: d.w } : null, builder, x, y, ang: a, tang: a,
    hp: st.hp, max: st.hp, speed: st.speed, water: !builder && PROPS[d.p].water, rad: builder ? 9 : CHASSIS[d.c].rad,
    order: { t: 'idle' }, gx: x, gy: y, cd: 0, tgt: 0, scan: Math.random() * 0.3, path: null, pi: 0, role: null,
  });
}
export function armorOf(e) {
  if (e.kind === 'struct') return STRUCTS[e.type].armor;
  return (e.builder ? BUILDER.armor : CHASSIS[e.d.c].armor) + (S.tech[e.owner].arm ? 2 : 0);
}

/* ---------- partita ---------- */
export function newGame(diff, seed) {
  S = {
    seed, diff, time: 0, nextId: 1, ents: [], res: [600, 600], tech: [{}, {}],
    designs: [{ c: 'L', p: 'W', w: 'MG' }],
    ai: { wave: 0, waveSize: DIFF[diff].w0, nextAttack: DIFF[diff].first, alert: null },
    stats: { built: [0, 0], lost: [0, 0], kills: [0, 0], made: [0, 0] },
    timers: { fog: 0, ai: 0, end: 0 }, lastWarn: -99,
    phase: 'play', explored: null,
  };
  setupWorld();
  for (const o of [P, E]) {
    const m = (x, y) => o === P ? [x, y] : [MW - 1 - x, MH - 1 - y];
    const [hx, hy] = m(B0.x, B0.y);
    makeStruct('hq', o, hx - 1, hy - 1, true);
    for (const [x, y] of [[8, 12], [10, 12]]) { const [a, b] = m(x, y); makeUnit(o, null, (a + 0.5) * TILE, (b + 0.5) * TILE); }
    for (const [x, y] of [[12, 8], [12, 10]]) { const [a, b] = m(x, y); makeUnit(o, { c: 'L', p: 'W', w: 'MG' }, (a + 0.5) * TILE, (b + 0.5) * TILE); }
  }
  updateFog();
  return S;
}
function setupWorld() {
  const m = genMap(S.seed); terr = m.t; deposits = m.deps;
  depIdx = new Int16Array(N).fill(-1); deposits.forEach((d, i) => { depIdx[d.x + d.y * MW] = i; });
  occ = new Int32Array(N); vis = new Uint8Array(N);
  explored = S.explored ? Uint8Array.from(S.explored) : new Uint8Array(N);
  idx.clear(); proj.length = 0;
  emit('world');
}
export function loadState(st) {
  S = st;
  S.timers = S.timers || { fog: 0, ai: 0, end: 0 };
  if (S.lastWarn == null) S.lastWarn = -99;
  setupWorld();
  for (const e of S.ents) { idx.set(e.id, e); if (e.kind === 'struct') markOcc(e, e.id); }
  updateFog();
  return S;
}
export function serialize() { return S ? Object.assign({}, S, { explored: Array.from(explored) }) : null; }

/* ---------- visibilità del giocatore ---------- */
export function canSee(owner, e) {
  if (owner === E || e.owner === owner) return true;
  if (e.kind === 'struct') {
    for (let y = e.ty; y < e.ty + e.h; y++) for (let x = e.tx; x < e.tx + e.w; x++) if (vis[x + y * MW]) return true;
    return false;
  }
  return vis[ftile(e.x) + ftile(e.y) * MW] === 1;
}
export function updateFog() {
  vis.fill(0);
  for (const e of S.ents) {
    if (e.dead || e.owner !== P) continue;
    let r, cx, cy;
    if (e.kind === 'struct') { r = e.built >= 1 ? STRUCTS[e.type].sight : 2.5; cx = e.tx + e.w / 2; cy = e.ty + e.h / 2; }
    else { r = e.builder ? 5.5 : 6.5; cx = e.x / TILE; cy = e.y / TILE; }
    const r2 = r * r;
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(MH - 1, Math.ceil(cy + r)); y++)
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(MW - 1, Math.ceil(cx + r)); x++)
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r2) { vis[x + y * MW] = 1; explored[x + y * MW] = 1; }
  }
  for (const e of S.ents) if (e.kind === 'struct' && e.owner === E && !e.seen && canSee(P, e)) e.seen = true;
  emit('fog');
}
