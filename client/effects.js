// Effetti visivi nati dagli eventi del motore («fx», «unit», «placed», «built»): esplosioni a fasi (lampo, palla di
// fuoco, onda d'urto e anello di polvere, detriti, fungo di fumo, cratere), vampe per arma con bossoli e fumo, colpi
// in acqua (schizzi e cerchi), scintille, relitti in fiamme con la torretta sbalzata e il fumo piegato dal vento,
// edifici che crollano a fasi, scarichi dei mezzi, polvere, fumo dei mezzi danneggiati. Qui nascono e avanzano;
// drawSmoke e drawHot li disegnano. La quantità segue il livello di qualità e «riduci movimento». Solo disegno.
import { TILE, MW, MH, P, CHASSIS, S, vis, ent, canSee, ftile, towerWeapon } from '../engine/index.js';
import { fxs, view, cam, reducedMotion } from './state.js';
import { fxq } from './quality.js';
import { shakeOn } from './prefs.js';
import { poseOf, kick, RECOIL, openDoor, makeFireball, wreckShape, pruneAnim } from './anim.js';
import { WEAPON_REACH, TURRET_SC } from './vehicles.js';
import { scorchMark, craterMark, stampTracks } from './decals.js';
import { isWaterAt } from './terrain.js';
import { glow, GLOW_R, GLOW_W, GLOW_G, FB, FB2 } from './light.js';
import { WIND, NIGHT } from './look.js';
import { burnK } from './weather.js';
import { unitDims } from './dims.js';

const MAXP_RM = 320, MAX_WRECKS = [12, 20, 40, 60], MAX_RUINS = 10;
// Relitti ed edifici crollati restano sul campo: durata in secondi per livello di qualità (minima … alta).
const WRECK_LIFE = [9, 11, 18, 24], RUIN_LIFE = [12, 14, 24, 30];
export const ruins = [];
// Densità degli effetti: «Riduci movimento» la dimezza, il livello di qualità la riduce ancora.
export const dens = () => (reducedMotion() ? 0.5 : 1) * fxq.q.dens;
const maybe = k => k >= 1 || Math.random() < k;
export const clock = () => performance.now() / 1000;
// Nuova particella, se c'è posto (il limite tiene basso il costo per fotogramma).
export function addP(k, x, y, vx, vy, life, s, vz) {
  const parts = fxs.parts, max = fxq.q.maxP; if (parts.length >= (reducedMotion() ? Math.min(MAXP_RM, max) : max)) return;
  parts.push({ k, x, y, vx, vy, life, max: life, s, z: 0, vz: vz || 0 });
}
export function nearView(x, y, m) { const vw = view.cw / cam.z, vh = view.ch / cam.z; return x > cam.x - m && x < cam.x + vw + m && y > cam.y - m && y < cam.y + vh + m; }
// Il giocatore vede questo punto? Gli effetti del nemico nella nebbia non si mostrano.
export function seenAt(x, y) { const tx = ftile(x), ty = ftile(y); return tx >= 0 && ty >= 0 && tx < MW && ty < MH && vis && vis[tx + ty * MW] === 1; }
const boomKind = e => e.kind || (e.size >= 2 ? 'struct' : Math.abs(e.size - 0.9) < 0.01 ? 'unit' : 'shot');
// Mezzo o edificio appena distrutto: è ancora nell'elenco (il motore lo toglie a fine passo), segnato come morto.
function deadAt(x, y, kind) { for (const e of S.ents) if (e.dead && e.kind === kind && e.x === x && e.y === y) return e; return null; }
// Scossa dello schermo: solo se accesa nei Comandi, senza «riduci movimento» e non in qualità minima.
export const shakeAllowed = () => shakeOn() && !reducedMotion() && fxq.q.shake;
export function shake(x, y, amp) {
  if (!shakeAllowed() || amp <= 0) return;
  const hw = view.cw / cam.z / 2, hh = view.ch / cam.z / 2;
  const f = Math.max(0, 1 - Math.hypot(x - cam.x - hw, y - cam.y - hh) / (Math.max(hw, hh) * 1.6));
  fxs.shake = Math.min(9, fxs.shake + amp * f);
}

/* ---------- esplosioni ---------- */
// Colpo in acqua: due cerchi che si allargano e gli schizzi che ricadono.
function splash(x, y, size) {
  fxs.fx.push({ k: 'ripple', x, y, life: 1.8, max: 1.8, s: 10 + 8 * size });
  fxs.fx.push({ k: 'ripple', x, y, life: 1.3, max: 1.3, s: 6 + 5 * size });
  for (let i = 0, n = Math.max(3, 10 * size * dens()); i < n; i++) { const a = Math.random() * 7, v = 10 + Math.random() * 30; addP('spray', x, y, Math.cos(a) * v, Math.sin(a) * v, 0.9 + Math.random() * 0.5, 2 + Math.random() * 2, 60 + Math.random() * 80 * size); }
}
function boom(x, y, size, kind) {
  const rm = reducedMotion(), q = dens(), Q = fxq.q, lvl = fxq.level, { fx } = fxs;
  if (kind === 'struct') shake(x, y, 6);
  else if (size >= 1.4) shake(x, y, 1.8 * size);
  const wet = kind === 'shot' && isWaterAt(x, y);
  if (kind === 'unit') {
    // relitto con la sagoma del mezzo: brucia, poi annerisce e sbiadisce; la torretta salta in aria e ricade
    const u = deadAt(x, y, 'unit'), v = u && poseOf(u.id), sh = wreckShape(u), a = v ? v.a : u ? u.ang : Math.random() * 7;
    while (fxs.wrecks.length >= MAX_WRECKS[lvl]) fxs.wrecks.shift();
    const fly = u && !u.builder && !u.hero && !rm && Q.glow ? { vx: (Math.random() - 0.5) * 50, vy: (Math.random() - 0.5) * 50, vz: 120 + Math.random() * 60, spin: (Math.random() - 0.5) * 9, dur: 0 } : null;
    if (fly) fly.dur = 2 * fly.vz / 340;
    fxs.wrecks.push({
      x: v ? v.x : x, y: v ? v.y : y, a, L: sh.L, W: sh.W, tr: sh.p === 'W' || sh.p === 'V' ? 0 : 1,
      ta: (Math.random() - 0.5) * 2.4, tx: (Math.random() - 0.5) * 4, tl: u && !u.builder && !u.hero ? 6 + sh.L * 0.35 : 0,
      t: 0, life: WRECK_LIFE[lvl] * (rm ? 0.7 : 1), ph: Math.random() * 6, fly,
      // burn: quota della vita in cui il relitto brucia (la metà sotto la pioggia); rank, owner: il relitto di un
      // veterano conserva le cromature, quello di un asso anche l'alettone
      burn: 0.3 * burnK(), rank: u && !u.builder ? u.rank || 0 : 0, owner: u ? u.owner : 0, hero: !!(u && u.hero),
    });
  } else if (kind === 'struct') {
    // edificio che crolla a fasi (structs.js): qui solo l'inizio, polvere e detriti arrivano in updParts
    const s = deadAt(x, y, 'struct');
    if (s) {
      while (ruins.length >= MAX_RUINS) ruins.shift();
      ruins.push({ s, x: s.x, y: s.y, id: s.id, kind: 'struct', t: 0, life: RUIN_LIFE[lvl], img: null, d1: false, d2: false });
    }
  }
  if (!nearView(x, y, 160)) return;
  if (wet) { splash(x, y, size); fx.push({ k: 'flashW', x, y, life: 0.1, max: 0.1, s: 8 * size }); return; }
  // segno che resta: cratere per i colpi grossi e i mezzi, la bruciatura degli edifici arriva dall'evento «scorch»
  if (kind === 'unit') craterMark(x, y, 12);
  else if (kind === 'shot' && size >= 1.2) craterMark(x, y, 11 * size);
  const L = 0.16 + 0.08 * size;
  fx.push({ k: 'light', x, y, life: L, max: L, s: 26 * size });
  if (Q.glow) fx.push({ k: 'flashW', x, y, life: 0.12, max: 0.12, s: (kind === 'shot' ? 9 : 13) * size });
  if (Q.glow || kind !== 'shot') fx.push({ k: 'shock', x, y, life: 0.32, max: 0.32, s: 20 * size });
  fx.push({ k: 'ring', x, y, life: 0.4, max: 0.4, s: 12 * size });
  // palla di fuoco a fasi: più sbuffi nei livelli alti
  const np = kind === 'struct' ? 9 : kind === 'unit' ? 6 : size >= 1.5 ? 5 : 3;
  const fl = kind === 'struct' ? 1.4 : kind === 'unit' ? 0.9 : 0.45 + 0.15 * size;
  fx.push(makeFireball(x, y, (kind === 'shot' ? 6 : kind === 'unit' ? 12 : 9) * size, fl, lvl <= 1 ? Math.max(2, np >> 1) : lvl === 2 ? Math.ceil(np * 0.75) : np));
  const n = Math.round(7 * size * q), long = kind === 'struct' ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 7, v = 20 + Math.random() * 70 * size;
    addP('fire', x, y, Math.cos(a) * v, Math.sin(a) * v, 0.3 + Math.random() * 0.35, 2 + Math.random() * 3 * size);
    addP('smoke', x + (Math.random() - 0.5) * 10 * size, y + (Math.random() - 0.5) * 10 * size, (Math.random() - 0.5) * 14, -6 - Math.random() * 10, (1.2 + Math.random() * 1.3) * long, 4 + Math.random() * 4 * size);
  }
  // fumo scuro che sale dopo la fiammata e si allarga disperdendosi
  if (kind !== 'shot' || size >= 1.5) for (let i = 0, m = Math.round((kind === 'struct' ? 8 : 4) * q); i < m; i++) {
    addP('dsmoke', x + (Math.random() - 0.5) * 8 * size, y + (Math.random() - 0.5) * 8 * size, (Math.random() - 0.5) * 10, -12 - Math.random() * 14, (1.8 + Math.random()) * long, 3.5 + Math.random() * 2.5 * Math.sqrt(size));
  }
  // detriti che volano, rimbalzano e restano a terra
  for (let i = 0, nd = Math.round((kind === 'shot' ? 3 : 7) * size * q); i < nd; i++) { const a = Math.random() * 7, v = 35 + Math.random() * 90; addP('debris', x, y, Math.cos(a) * v, Math.sin(a) * v, 1.2 + Math.random() * 0.7, 1.4 + Math.random() * 1.8, 60 + Math.random() * 90 * size); }
  // anello di polvere che corre sul terreno (colpi grossi, mezzi, edifici)
  if (kind !== 'shot' || size >= 1.2) for (let i = 0, m = Math.round((kind === 'struct' ? 22 : 12) * q); i < m; i++) {
    const a = i / m * Math.PI * 2 + Math.random() * 0.3, v = (kind === 'struct' ? 90 : 60) + Math.random() * 30;
    addP('dust', x + Math.cos(a) * 6, y + Math.sin(a) * 5, Math.cos(a) * v, Math.sin(a) * v * 0.8, 0.9 + Math.random() * 0.5, 4 + Math.random() * 3);
  }
  // fungo di fumo: colonna che sale e cappello che si allarga, piegati dal vento
  if (Q.mush && !rm && (kind === 'struct' || size >= 1.5 || kind === 'unit')) {
    const life = kind === 'struct' ? 4.5 : 3.2;
    fx.push({ k: 'mush', x, y, life, max: life, s: kind === 'struct' ? 1.6 : kind === 'unit' ? 0.8 : 1, ph: Math.random() * 7 });
  }
}

/* ---------- vampe ---------- */
// Vampa di sparo, diversa per arma: [stile, scala, durata]. Le armi nuove riusano gli stili con una scala più grande.
const MZ = {
  MG: ['mg', 1, 0.06], HMG: ['hmg', 1, 0.07], CN: ['cn', 1, 0.1], CN75: ['cn', 1.25, 0.11], CN105: ['cn', 1.5, 0.12],
  HW: ['cn', 1.75, 0.14], RK: ['rk', 1, 0.09], AT: ['rk', 1.1, 0.1], MRL: ['rk', 1.35, 0.11], MO: ['mo', 1, 0.09], FL: ['fl', 1, 0.08],
};
// La direzione si ricava dal tiratore più vicino alla bocca dell'arma; la vampa sta in cima alla canna disegnata,
// segue il mezzo dove è disegnato (posizione ammorbidita) e la torretta rincula.
function muzzle(ev) {
  if (!nearView(ev.x, ev.y, 60)) return;
  const w = ev.w || (ev.s <= 3 ? 'MG' : 'CN'), [st, sc, life] = MZ[w] || MZ.CN;
  let a = Math.random() * 7, bd = 900, who = null;
  for (const s of S.ents) {
    if (s.dead || (ev.owner != null && s.owner !== ev.owner) || (s.kind === 'struct' && s.type !== 'tower' && s.type !== 'bunker')) continue;
    const dx = ev.x - s.x, dy = ev.y - s.y; if (dx > 34 || dx < -34 || dy > 34 || dy < -34) continue;
    const d = dx * dx + dy * dy; if (d < bd && d > 4) { bd = d; a = Math.atan2(dy, dx); who = s; }
  }
  let x = ev.x, y = ev.y;
  if (who) {
    const v = who.kind === 'unit' && poseOf(who.id), cx = v ? v.x : who.x, cy = v ? v.y : who.y;
    const tw = who.kind === 'unit' ? null : who.type === 'bunker' ? 'CN75' : towerWeapon(who.owner).key;
    const reach = who.kind === 'unit' ? (who.d ? (WEAPON_REACH[who.d.w] || 12) * (TURRET_SC[who.d.c] || 1) : 0) : (WEAPON_REACH[tw] || 12) * (tw === 'CN75' ? (who.type === 'bunker' ? 1.1 : 1) : 1.15);
    if (reach && w !== 'FL') { x = cx + Math.cos(a) * reach; y = cy + Math.sin(a) * reach; }
    else if (v) { x += v.x - who.x; y += v.y - who.y; }
    if (!reducedMotion()) kick(who.id, RECOIL[w] || 0, clock());
  }
  fxs.fx.push({ k: 'muzzle', st, sc, x, y, a, life, max: life });
  // alone di luce sul terreno attorno alla bocca (solo dove ci sono i bagliori; le mitragliatrici leggere solo in alta)
  if (fxq.q.glow && st !== 'fl' && (fxq.level === 3 || st !== 'mg')) {
    const gl = life * 1.6 + 0.04;
    fxs.fx.push({ k: 'glight', x, y, a, life: gl, max: gl, s: (st === 'cn' ? 26 : st === 'rk' ? 22 : st === 'mo' ? 18 : st === 'hmg' ? 15 : 11) * sc });
  }
  const c = Math.cos(a), s = Math.sin(a), q = fxq.q.dens;
  // bossoli che saltano dal fianco del mezzo e rimbalzano
  if (fxq.q.casings && who && who.kind === 'unit' && (st === 'mg' || st === 'hmg' || st === 'cn') && maybe(q * (st === 'mg' ? 0.5 : 1))) {
    const sd = Math.random() < 0.5 ? -1 : 1, v = poseOf(who.id), ux = v ? v.x : who.x, uy = v ? v.y : who.y;
    addP('casing', ux - s * sd * 4, uy + c * sd * 4, -s * sd * (40 + Math.random() * 30) - c * 10, c * sd * (40 + Math.random() * 30) - s * 10, 1.4, st === 'cn' ? 1.8 : 1.1, 50 + Math.random() * 40);
  }
  if (st === 'hmg' && Math.random() < 0.35 * q) addP('smoke', x + c * 3, y + s * 3, c * 14, s * 14 - 4, 0.45, 1.6);
  if (st === 'cn') {
    const v = 24 * sc;
    if (maybe(q)) for (const side of [-1, 1]) addP('smoke', x, y, -s * side * v + c * 8, c * side * v + s * 8, 0.6 * sc, 2.4 * sc);
    if (maybe(q)) addP('smoke', x + c * 4, y + s * 4, c * 28 * sc, s * 28 * sc, 0.5 * sc, 2.6 * sc);
    if (w === 'HW') for (let i = 0, n = 6 * dens(); i < n; i++) { const b = Math.random() * 7, u = 20 + Math.random() * 20; addP('dust', x - c * 14, y - s * 14, Math.cos(b) * u, Math.sin(b) * u, 1.1, 4); }
  } else if (st === 'rk') {
    const n = Math.round(3 * sc * sc * Math.min(1, q + 0.15));
    for (let i = 0; i < n; i++) { const v = 30 + Math.random() * 30 * sc; addP('smoke', x - c * 10, y - s * 10, -c * v + (Math.random() - 0.5) * 24 * sc, -s * v + (Math.random() - 0.5) * 24 * sc, 0.75 * sc, 3 * sc); }
  } else if (st === 'mo') {
    for (let i = 0; i < 2; i++) if (maybe(q)) addP('smoke', x, y, (Math.random() - 0.5) * 12, -20 - Math.random() * 12, 0.9, 3);
  }
}
export function spawnFx(e) {
  const { fx } = fxs;
  switch (e.k) {
    case 'boom': { const kind = boomKind(e); if (kind === 'shot' ? seenAt(e.x, e.y) : (e.owner === P || seenAt(e.x, e.y))) boom(e.x, e.y, e.size, kind); break; }
    case 'scorch': scorchMark(e.x, e.y, e.r, 0.45); break;
    case 'flash': if (e.owner === P || seenAt(e.x, e.y)) muzzle(e); break;
    case 'tracer': if (nearView(e.x1, e.y1, 80)) fx.push({ k: 'tracer', x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, life: 0.07, max: 0.07 }); break;
    case 'hit':
      if (!nearView(e.x, e.y, 40)) break;
      if (isWaterAt(e.x, e.y)) { if (maybe(fxq.q.dens + 0.3)) splash(e.x, e.y, 0.4); break; }
      fx.push({ k: 'ring', x: e.x, y: e.y, life: 0.2, max: 0.2, s: 8 });
      if (fxq.q.glow) fx.push({ k: 'light', x: e.x, y: e.y, life: 0.08, max: 0.08, s: 12 });
      // scintille sul metallo e qualche lingua di fuoco
      for (let i = 0, n = Math.round(6 * fxq.q.dens); i < n; i++) { const a = Math.random() * 7, v = 60 + Math.random() * 120; addP('spark', e.x, e.y, Math.cos(a) * v, Math.sin(a) * v, 0.25 + Math.random() * 0.2, 1.2); }
      for (let i = 0, n = Math.round(4 * fxq.q.dens); i < n; i++) addP('fire', e.x, e.y, (Math.random() - 0.5) * 80, (Math.random() - 0.5) * 80, 0.25, 2);
      break;
    // con molte particelle già in volo (salve di razzi) la scia di fumo si dirada
    case 'trail': if (Math.random() < (fxs.parts.length > fxq.q.maxP / 2 ? 0.35 : 0.8) * fxq.q.dens && nearView(e.x, e.y, 30)) addP('smoke', e.x, e.y, 0, -4, 0.6, 2.2); break;
    case 'spark': if (maybe(fxq.q.dens) && nearView(e.x, e.y, 30)) addP('spark', e.x, e.y, (Math.random() - 0.5) * 60, -Math.random() * 50, 0.35, 1.5); break;
    case 'spray': if (maybe(fxq.q.dens) && nearView(e.x, e.y, 30)) addP('spray', e.x, e.y, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, 0.6, 3); break;
    case 'chimney': if (maybe(fxq.q.dens) && nearView(e.x, e.y, 60)) addP('smoke', e.x, e.y, 6 + Math.random() * 6, -4 - Math.random() * 6, 2.4, 4); break;
    case 'flame': {
      // getto del lanciafiamme: lingua di fuoco animata, fiamme che volano verso il bersaglio, fumo e terreno annerito
      if (!(e.owner === P || seenAt(e.x2, e.y2)) || !nearView(e.x2, e.y2, 80)) break;
      const r = e.r || 24, dx = e.x2 - e.x1, dy = e.y2 - e.y1, d = Math.hypot(dx, dy) || 1, q = dens();
      fx.push({ k: 'flame', x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, r, life: 0.36, max: 0.36, ph: Math.random() * 7 });
      for (let i = 0; i < 5 * q; i++) { const k = 0.25 + Math.random() * 0.75, v = 40 + Math.random() * 50; addP('fire', e.x1 + dx * k, e.y1 + dy * k, dx / d * v + (Math.random() - 0.5) * 30, dy / d * v + (Math.random() - 0.5) * 30, 0.22 + Math.random() * 0.2, 2 + Math.random() * 2.5); }
      for (let i = 0; i < 4 * q; i++) { const a = Math.random() * 7, rr0 = Math.random() * r * 0.75; addP('fire', e.x2 + Math.cos(a) * rr0, e.y2 + Math.sin(a) * rr0, (Math.random() - 0.5) * 12, -10 - Math.random() * 16, 0.35 + Math.random() * 0.25, 2 + Math.random() * 2.2); }
      if (Math.random() < 0.9 * q) addP('smoke', e.x2 + (Math.random() - 0.5) * r * 0.6, e.y2 + (Math.random() - 0.5) * r * 0.6, 3 + Math.random() * 5, -10 - Math.random() * 10, 1.6, 3.8);
      if (maybe(fxq.q.dens)) scorchMark(e.x2 + (Math.random() - 0.5) * r * 0.5, e.y2 + (Math.random() - 0.5) * r * 0.5, r * 0.55, 0.13);
      break;
    }
    case 'repair':
      // modulo riparazione: arco verde-azzurro tra i due mezzi e scintille di saldatura sul mezzo riparato
      if (!(e.owner === P || seenAt(e.x2, e.y2)) || !nearView(e.x2, e.y2, 60)) break;
      fx.push({ k: 'repair', x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, life: 0.3, max: 0.3 });
      for (let i = 0, n = Math.max(1, Math.round(4 * dens())); i < n; i++) addP('rspark', e.x2 + (Math.random() - 0.5) * 8, e.y2 + (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 56, -Math.random() * 44, 0.32 + Math.random() * 0.15, 1.4);
      break;
  }
}
// Polvere a terra (mezzo che esce, edificio che si posa o crolla). big: più grande, più veloce e più lunga.
export function dust(x, y, r, n, big = 1) {
  n = Math.max(1, Math.round(n * fxq.q.dens));
  for (let i = 0; i < n; i++) { const a = Math.random() * 7; addP('dust', x + Math.cos(a) * r, y + Math.sin(a) * r * 0.7, Math.cos(a) * 22 * big, Math.sin(a) * 16 * big, (0.8 + Math.random() * 0.5) * big, (3 + Math.random() * 2) * big); }
}
// Polvere dietro un mezzo che corre sullo sterrato (chiamata dal disegno del mezzo).
export function vdust(x, y, vx, vy, life, s) { addP('vdust', x, y, vx, vy, life, s); }
// Mezzo appena consegnato: esce dalla porta della fabbrica con una breve dissolvenza.
export function unitSpawned(d) {
  if (d.id == null) return;
  fxs.spawns.set(d.id, clock());
  if (d.x != null) {
    let door = null, bd = (TILE * 3) ** 2;
    for (const s of S.ents) {
      if (s.dead || s.kind !== 'struct' || s.owner !== d.owner || (s.type !== 'factory' && s.type !== 'hq')) continue;
      const dx = d.x - s.x, dy = d.y - (s.ty + s.h) * TILE, dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; door = s; }
    }
    if (door) openDoor(door.id, clock());
  }
  if (d.x != null && (d.owner === P || seenAt(d.x, d.y)) && nearView(d.x, d.y, 40)) dust(d.x, d.y - 10, 4, reducedMotion() ? 2 : 5);
}
// Cantiere appena piazzato: «si posa» sul terreno.
export function structPlaced(d) { if (d.id != null && !fxs.settle.has(d.id)) fxs.settle.set(d.id, { t0: clock(), dust: false }); }
export function structBuilt(d) {
  const s = ent(d.id); if (!s || (s.owner !== P && !canSee(P, s)) || !nearView(s.x, s.y, 60)) return;
  dust(s.x, s.y, s.w * TILE * 0.45, reducedMotion() ? 3 : 8);
}
// Segno dell'ordine: frecce che convergono sul punto. Su telefono è più grande (si vede sotto il dito).
const coarseQ = typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)') : null;
export function mark(x, y, c) { fxs.fx.push({ k: 'mark', x, y, life: 0.65, max: 0.65, c, s: coarseQ && coarseQ.matches ? 1.6 : 1 }); }
export function resetEffects() {
  fxs.parts.length = 0; fxs.fx.length = 0; fxs.pings.length = 0; fxs.wrecks.length = 0;
  fxs.settle.clear(); fxs.spawns.clear(); fxs.shake = 0; fxs.boxSel = null;
  ruins.length = 0;
}

/* ---------- avanzamento ---------- */
function wake(u) {
  const c = Math.cos(u.ang), s = Math.sin(u.ang), bx = u.x - c * 10, by = u.y - s * 10;
  for (const side of [-1, 1]) addP('wake', bx, by, -s * side * 16 - c * 6, c * side * 16 - s * 6, 1.1, 2);
}
let pruneT = 2;
const DRIFT = { smoke: 0.7, dsmoke: 1, dust: 0.7, vdust: 0.5, exh: 0.7 };
export function updParts(dt) {
  const parts = fxs.parts, damp = Math.exp(-dt * 5);
  let j = 0;
  for (const p of parts) {
    p.life -= dt; if (p.life <= 0) continue;
    p.x += p.vx * dt; p.y += p.vy * dt;
    const dr = DRIFT[p.k];
    // fumo e polvere vanno col vento, sempre di più man mano che salgono
    if (dr) { p.x += WIND.x * dr * dt * (1.4 - p.life / p.max); p.y += WIND.y * dr * dt; }
    if (p.k === 'debris' || p.k === 'casing' || p.k === 'spray') {
      // detriti, bossoli e schizzi: cadono, rimbalzano un paio di volte, poi restano fermi e sbiadiscono
      p.z += p.vz * dt; p.vz -= 340 * dt;
      if (p.z < 0) {
        if (p.k === 'debris' && p.vz < -45 && fxq.level === 3 && parts.length < fxq.q.maxP * 0.8) addP('dust', p.x, p.y, 0, -3, 0.5, 1.6);
        p.z = 0; p.vz = p.vz < -25 ? -p.vz * 0.42 : 0; p.vx *= 0.45; p.vy *= 0.45;
      }
    } else if (p.k === 'dsmoke') { p.vx *= damp ** 0.15; p.vy *= damp ** 0.1; }
    else if (p.k !== 'smoke' && p.k !== 'exh') { p.vx *= damp; p.vy *= damp; }
    parts[j++] = p;
  }
  parts.length = j;
  j = 0; for (const f of fxs.fx) { f.life -= dt; if (f.life > 0) fxs.fx[j++] = f; } fxs.fx.length = j;
  fxs.shake = fxs.shake > 0.05 ? fxs.shake * Math.exp(-dt * 8) : 0;
  if (!S) return;
  const q = (reducedMotion() ? 0.5 : 1) * fxq.q.dmg;
  // relitti: bruciano (primo 30% della vita) con una colonna di fumo scuro piegata dal vento, poi fumano piano
  j = 0;
  for (const w of fxs.wrecks) {
    w.t += dt; if (w.t >= w.life) continue;
    fxs.wrecks[j++] = w;
    if (!nearView(w.x, w.y, 40)) continue;
    const burning = w.t < w.life * (w.burn || 0.3);
    if (w.t < w.life * 0.7 && Math.random() < dt * (burning ? 6 : 2.5) * q) addP('dsmoke', w.x + (Math.random() - 0.5) * 6, w.y - 4, (Math.random() - 0.5) * 6, -22 - Math.random() * 14, 2.6 + Math.random(), 3.4 + Math.random() * 2);
    if (burning && Math.random() < dt * 9 * q) addP('fire', w.x + (Math.random() - 0.5) * 8, w.y + (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 8, -12 - Math.random() * 12, 0.45, 2.2);
    if (w.t < w.life * 0.6 && Math.random() < dt * (burning ? 4 : 1.4) * q) addP('smoke', w.x, w.y, 4 + Math.random() * 5, -8 - Math.random() * 8, 1.8, burning ? 3 : 2.4);
    // la torretta sbalzata ricade: un po' di polvere dove tocca terra
    if (w.fly && !w.fly.landed && w.t >= w.fly.dur) { w.fly.landed = true; dust(w.x + Math.cos(w.a) * w.tx + w.fly.vx * w.fly.dur, w.y + Math.sin(w.a) * w.tx + w.fly.vy * w.fly.dur, 3, 4, 0.7); }
  }
  fxs.wrecks.length = j;
  // edifici crollati: crepe e prima polvere (0,45 s), il tetto cede (1,1 s) con detriti; fiamme sulle macerie per
  // qualche secondo, fumo denso più a lungo
  const rm = reducedMotion();
  j = 0;
  for (const r of ruins) {
    const t0 = r.t; r.t += dt; if (r.t >= r.life) continue;
    ruins[j++] = r;
    if (!nearView(r.x, r.y, 80)) continue;
    const s = r.s, hw = s.w * TILE * 0.5, hh = s.h * TILE * 0.5, area = s.w * s.h;
    for (const st of [0.45, 1.1]) if (t0 < st && r.t >= st) {
      const n = Math.round((rm ? 6 : 22) * fxq.q.dens + 4);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 7, v = 30 + Math.random() * 60;
        addP('dust', r.x + Math.cos(a) * hw * 0.8, r.y + Math.sin(a) * hh * 0.8, Math.cos(a) * v, Math.sin(a) * v * 0.7 - 6, 1.6 + Math.random(), 6 + Math.random() * 5);
        if (i % 3 === 0) addP('debris', r.x + (Math.random() - 0.5) * hw, r.y + (Math.random() - 0.5) * hh, Math.cos(a) * v, Math.sin(a) * v, 1.6, 1.6 + Math.random() * 2, 50 + Math.random() * 70);
      }
    }
    if (r.t < 5 && Math.random() < dt * 5 * area * q) addP('fire', r.x + (Math.random() - 0.5) * 1.6 * hw, r.y + (Math.random() - 0.5) * 1.6 * hh, (Math.random() - 0.5) * 10, -14 - Math.random() * 14, 0.55, 2.5 + Math.random() * 1.5);
    if (r.t < 12 && Math.random() < dt * (r.t < 5 ? 3 : 1.2) * area * q) addP('dsmoke', r.x + (Math.random() - 0.5) * hw, r.y + (Math.random() - 0.5) * hh, (Math.random() - 0.5) * 8, -18 - Math.random() * 12, 3, 4 + Math.random() * 3);
  }
  ruins.length = j;
  // mezzi ed edifici danneggiati: fumo sotto metà dei punti struttura, fuoco sotto un quarto;
  // scarichi: sbuffi dai tubi dietro i mezzi in vista (più fitti in partenza)
  const ex = fxq.q.exhaust * (rm ? 0.5 : 1);
  for (const e of S.ents) {
    if (e.dead || !nearView(e.x, e.y, 40)) continue;
    if (ex && e.kind === 'unit' && !e.builder) {
      const v = poseOf(e.id), acc = v && v.acc > 20, mv = v && v.spd > 5;
      // lo scarico grosso del veterano sbuffa di più, il doppio scarico dell'asso ancora di più e da tutti e due i tubi
      const rk = e.rank || 0, rx = rk >= 3 ? 2.6 : rk >= 2 ? 1.5 : 1;
      if (Math.random() < dt * ex * rx * (acc ? 4 : mv ? 1.4 : 0.35) && (e.owner === P || canSee(P, e))) {
        const { L, W } = unitDims(e), c = Math.cos(e.ang), sn = Math.sin(e.ang), sd = rk === 2 ? 1 : Math.random() < 0.5 ? -1 : 1, off = rk >= 2 ? W * 0.5 - 3 : W * 0.25, back = L * 0.5 + (rk >= 2 ? 2 : 0);
        addP('exh', (v ? v.x : e.x) - c * back - sn * sd * off, (v ? v.y : e.y) - sn * back + c * sd * off, -c * 14 + (Math.random() - 0.5) * 6, -sn * 14 + (Math.random() - 0.5) * 6, 0.8 + Math.random() * 0.5, (acc ? 2.4 : 1.6) * (rk >= 3 ? 1.35 : rk >= 2 ? 1.2 : 1));
      }
    }
    if (e.hp >= e.max * 0.5 || (e.kind === 'struct' && e.built < 1)) continue;
    if (e.owner !== P && !canSee(P, e)) continue;
    const big = e.kind === 'struct';
    const ox = big ? (Math.random() - 0.5) * e.w * TILE * 0.6 : (Math.random() - 0.5) * 4, oy = big ? (Math.random() - 0.5) * e.h * TILE * 0.6 : (Math.random() - 0.5) * 4;
    if (Math.random() < dt * (big ? 6 : 3.5) * q) addP('smoke', e.x + ox, e.y + oy, 4 + Math.random() * 4, -8 - Math.random() * 8, 1.6, big ? 4 : 2.6);
    if (e.hp < e.max * 0.25 && Math.random() < dt * (big ? 10 : 7) * q) addP('fire', e.x + ox, e.y + oy, (Math.random() - 0.5) * 8, -10 - Math.random() * 12, 0.45, big ? 3 : 2);
  }
  stampTracks(dt, fxq.q.tracks, u => { if (nearView(u.x, u.y, 40)) wake(u); });
  const now = clock();
  for (const [id, t0] of fxs.spawns) if (now - t0 > 1.5) fxs.spawns.delete(id);
  for (const [id, v] of fxs.settle) if (now - v.t0 > 1.5) fxs.settle.delete(id);
  if ((pruneT -= dt) <= 0) { pruneT = 2; pruneAnim(now); }
}

/* ---------- disegno ---------- */
// Sbuffo con volume: tre grumi, chiaro verso la luce (in alto a sinistra), scuro sotto. Di notte più scuro.
const puffs = new Map();
function puff(rgb, night) {
  const key = `${rgb}:${night ? 1 : 0}`; let c = puffs.get(key); if (c) return c;
  const k = night ? NIGHT.smoke : 1, col = rgb.map(v => v * k);
  c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  for (const [x, y, r, f] of [[26, 34, 18, 0.9], [38, 32, 16, 0.85], [32, 24, 17, 1]]) {
    const gr = g.createRadialGradient(x - 6, y - 7, 2, x, y, r);
    gr.addColorStop(0, `rgba(${col.map(v => Math.min(255, v * 1.45 * f) | 0)},0.95)`); gr.addColorStop(0.6, `rgba(${col.map(v => v * f | 0)},0.8)`); gr.addColorStop(1, `rgba(${col.map(v => v * 0.6 | 0)},0)`);
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  puffs.set(key, c); return c;
}
const SMOKE = [92, 90, 82], DARK = [40, 37, 34], DUST = [150, 130, 96], EXH = [150, 156, 160], SPRAY = [220, 232, 236];
const sp = (g, img, x, y, r, a) => { if (a <= 0.01 || r <= 0) return; g.globalAlpha = a > 1 ? 1 : a; g.drawImage(img, x - r, y - r, r * 2, r * 2); };
// Fumo, polvere, scarichi, detriti, bossoli, schizzi, scie, funghi e cerchi nell'acqua (modalità normale).
export function drawSmoke(g, inView, night) {
  const SM = puff(SMOKE, night), DS = puff(DARK, night), DU = puff(DUST, night), EX = puff(EXH, night), WA = puff(SPRAY, night);
  for (const p of fxs.parts) {
    if (!inView(p.x, p.y, 30)) continue;
    const k = p.life / p.max;
    switch (p.k) {
      case 'smoke': sp(g, SM, p.x, p.y, p.s * (2 - k) * 1.4, 0.55 * k); break;
      case 'dsmoke': sp(g, DS, p.x, p.y, p.s * (0.8 + 2.2 * (1 - k)) * 1.3, 0.75 * k * Math.min(1, (1 - k) * 6)); break;
      case 'dust': sp(g, DU, p.x, p.y, p.s * (2.4 - k), 0.45 * k); break;
      case 'vdust': sp(g, DU, p.x, p.y, p.s * (2.4 - 1.2 * k), 0.36 * k); break;
      case 'exh': sp(g, EX, p.x, p.y, p.s * (1.6 - k) * 1.2, 0.35 * k); break;
      case 'debris': case 'casing':
        g.globalAlpha = Math.min(1, k * 2.5);
        if (p.z > 1) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(p.x, p.y, p.s, p.s * 0.6); }
        g.fillStyle = p.k === 'casing' ? '#d8b04a' : k > 0.8 ? '#d9743a' : '#28261f'; g.fillRect(p.x, p.y - p.z, p.s, p.s * (p.k === 'casing' ? 0.5 : 1)); break;
      case 'spray':
        if (p.z > 1) { g.globalAlpha = 0.2 * k; g.fillStyle = '#000'; g.fillRect(p.x, p.y, 1.4, 1.4); }
        sp(g, WA, p.x, p.y - p.z, p.s * (1.4 - k * 0.4), 0.6 * k); break;
      case 'wake': g.globalAlpha = 0.4 * k; g.strokeStyle = '#d2e6e8'; g.lineWidth = 1; g.beginPath(); g.arc(p.x, p.y, p.s * (3 - 2 * k), 0, 7); g.stroke(); break;
      case 'rspark': g.globalAlpha = k; g.fillStyle = k > 0.5 ? '#e4fff2' : '#7fe6c0'; g.fillRect(p.x, p.y, p.s, p.s); break;
    }
  }
  for (const f of fxs.fx) {
    if (f.k === 'mush' && inView(f.x, f.y, 120)) {
      const q = 1 - f.life / f.max, H = (20 + 70 * Math.sqrt(q)) * f.s, a = Math.min(1, (1 - q) * 2.2) * 0.85, bend = WIND.x * q * 1.6;
      for (let i = 0; i < 6; i++) sp(g, DS, f.x + bend * i / 6, f.y - H * i / 6, (6 + 3 * i / 6) * f.s * (0.7 + q), a * 0.8);
      for (let i = 0; i < 7; i++) { const an = i / 7 * Math.PI * 2 + f.ph, R = (8 + 16 * q) * f.s; sp(g, i % 2 ? DS : SM, f.x + bend + Math.cos(an) * R, f.y - H + Math.sin(an) * R * 0.45, (8 + 10 * q) * f.s, a); }
    } else if (f.k === 'ripple' && inView(f.x, f.y, 60)) {
      const k = f.life / f.max; g.strokeStyle = '#e8f2f0'; g.lineWidth = 1.2;
      g.globalAlpha = 0.6 * k; g.beginPath(); g.ellipse(f.x, f.y, f.s * (1.6 - k) * 1.6, f.s * (1.6 - k) * 1.1, 0, 0, 7); g.stroke();
      g.globalAlpha = 0.3 * k; g.beginPath(); g.ellipse(f.x, f.y, f.s * (1.6 - k), f.s * (1.6 - k) * 0.7, 0, 0, 7); g.stroke();
    }
  }
  g.globalAlpha = 1;
}
// Palla di fuoco: sbuffi che si accendono uno dopo l'altro (lampo, fiamma che si allarga e sale, brace), additivi.
function drawFireball(g, f) {
  const p = 1 - f.life / f.max, P = f.puffs;
  for (let i = 0; i < P.length; i += 4) {
    const q = (p - P[i + 3]) / 0.7; if (q < 0 || q > 1) continue;
    const e = 1 - (1 - q) * (1 - q);
    glow(g, f.x + P[i] * (0.6 + 0.6 * e), f.y + P[i + 1] * (0.6 + 0.6 * e) - q * f.R * 0.35, P[i + 2] * (0.5 + 1.1 * e), 1 - q * 0.7, q < 0.5 ? FB : FB2);
  }
}
function drawMuzzle(g, f, at, home) {
  const k = f.life / f.max, sc = f.sc || 1;
  at(g, f.x, f.y, f.a, sc); g.globalAlpha = Math.min(1, k * 1.4);
  if (f.st === 'mg') {
    g.fillStyle = '#ffe9a6';
    for (const yy of [-1.6, 1.6]) { g.beginPath(); g.moveTo(-1, yy); g.lineTo(3, yy - 1.3); g.lineTo(9, yy); g.lineTo(3, yy + 1.3); g.closePath(); g.fill(); }
  } else if (f.st === 'hmg') {
    g.fillStyle = '#ffe9a6'; g.beginPath(); g.moveTo(-1, 0); g.lineTo(4, -2.4); g.lineTo(12, 0); g.lineTo(4, 2.4); g.closePath(); g.fill();
    g.fillStyle = '#ffc266'; g.beginPath(); g.moveTo(2, 0); g.lineTo(3.5, -5); g.lineTo(5, 0); g.lineTo(3.5, 5); g.closePath(); g.fill();
  } else if (f.st === 'cn') {
    g.fillStyle = '#fff1c4'; g.beginPath(); g.moveTo(-2, 0); g.lineTo(4, -3.5); g.lineTo(15, 0); g.lineTo(4, 3.5); g.closePath(); g.fill();
    g.fillStyle = '#ffc266'; g.beginPath(); g.moveTo(1, 0); g.lineTo(3, -9); g.lineTo(6, 0); g.lineTo(3, 9); g.closePath(); g.fill();
  } else if (f.st === 'rk') {
    g.fillStyle = '#ffb347'; g.beginPath(); g.moveTo(-16, 0); g.lineTo(-6, -3); g.lineTo(-2, 0); g.lineTo(-6, 3); g.closePath(); g.fill();
    g.fillStyle = '#fff0c0'; g.beginPath(); g.arc(1, 0, 2.5, 0, 7); g.fill();
  } else if (f.st === 'fl') {
    g.fillStyle = '#ff9a3c'; g.beginPath(); g.ellipse(3, 0, 5, 3, 0, 0, 7); g.fill();
  } else {
    g.fillStyle = '#ffd890'; g.beginPath(); g.arc(1, 0, 4 * k + 1, 0, 7); g.fill();
  }
  if (k > 0.45 && f.st !== 'fl') { g.globalAlpha = (k - 0.45) / 0.55; g.fillStyle = '#fffdf2'; g.beginPath(); g.arc(1.5, 0, f.st === 'cn' ? 2.8 : f.st === 'mg' ? 1.3 : 1.9, 0, 7); g.fill(); }
  home(g); g.globalAlpha = 1;
  return (f.st === 'mg' ? 9 : f.st === 'hmg' ? 12 : f.st === 'cn' ? 22 : f.st === 'rk' ? 16 : 12) * sc;
}
// Getto del lanciafiamme (modalità additiva): tre lingue sovrapposte che si allungano verso il bersaglio e tremano.
function drawFlame(g, f, t) {
  const k = f.life / f.max, ext = Math.min(1, (1 - k) / 0.2), dx = f.x2 - f.x1, dy = f.y2 - f.y1, d = Math.hypot(dx, dy) || 1;
  const len = d * ext, fl = 1 + 0.2 * Math.sin(t * 47 + f.ph), wEnd = Math.min(f.r * 0.6, 5 + len * 0.28) * fl, al = Math.min(1, k * 2.4);
  g.save(); g.translate(f.x1, f.y1); g.rotate(Math.atan2(dy, dx));
  const tongue = (w0, w1, l, c, a) => {
    g.globalAlpha = a; g.fillStyle = c; g.beginPath(); g.moveTo(0, -w0);
    g.quadraticCurveTo(l * 0.55, -w1 * 1.15, l, -w1 * 0.55); g.quadraticCurveTo(l + w1 * 0.9, 0, l, w1 * 0.55);
    g.quadraticCurveTo(l * 0.55, w1 * 1.15, 0, w0); g.closePath(); g.fill();
  };
  tongue(1.8, wEnd, len, '#c4502a', 0.6 * al); tongue(1.2, wEnd * 0.62, len * 0.86, '#ff9a3c', 0.7 * al); tongue(0.6, wEnd * 0.3, len * 0.6, '#ffe6a0', 0.85 * al);
  g.restore();
  glow(g, f.x2, f.y2, f.r * 0.95 * fl, 0.5 * al); glow(g, f.x1, f.y1, 9, 0.5 * al);
}
// Raggio del modulo riparazione (modalità additiva): arco tremolante dal braccio della gru al mezzo riparato.
function drawRepair(g, f) {
  const k = f.life / f.max, dx = f.x2 - f.x1, dy = f.y2 - f.y1, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
  const sx = f.x1 + ux * Math.min(12, d * 0.4), sy = f.y1 + uy * Math.min(12, d * 0.4), n = 6;
  g.beginPath(); g.moveTo(sx, sy);
  for (let i = 1; i < n; i++) { const q = i / n, j = (Math.random() - 0.5) * 5; g.lineTo(sx + (f.x2 - sx) * q - uy * j, sy + (f.y2 - sy) * q + ux * j); }
  g.lineTo(f.x2, f.y2);
  g.globalAlpha = 1; g.strokeStyle = `rgba(70,200,160,${0.35 * k})`; g.lineWidth = 3; g.stroke();
  g.strokeStyle = `rgba(210,255,235,${0.9 * k})`; g.lineWidth = 1; g.stroke();
  glow(g, f.x2, f.y2, 9, 0.7 * k, GLOW_R); glow(g, sx, sy, 5, 0.5 * k, GLOW_R);
}
// Luci additive: fuoco, scintille, palle di fuoco, lampi, vampe e la loro luce sul terreno, traccianti, fiamme,
// relitti e macerie che bruciano, mezzi ed edifici in fiamme (burning); poi onde d'urto e anelli (modalità normale).
// at/home: piazzare una sagoma ruotata e tornare al mondo (render.js). full: bagliori completi.
export function drawHot(g, inView, t, burning, full, at, home) {
  g.globalCompositeOperation = 'lighter';
  for (const p of fxs.parts) {
    if (!inView(p.x, p.y, 20)) continue;
    const k = p.life / p.max;
    if (p.k === 'fire') glow(g, p.x, p.y, (p.s * k + 1) * 2.4, k);
    else if (p.k === 'spark') { g.globalAlpha = k; g.strokeStyle = '#ffeaa0'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); g.stroke(); }
  }
  for (const f of fxs.fx) {
    const k = f.life / f.max;
    if (f.k === 'fball') { if (inView(f.x, f.y, f.R * 2)) drawFireball(g, f); }
    else if (f.k === 'light') { if (inView(f.x, f.y, f.s * 1.6)) glow(g, f.x, f.y, f.s * (0.7 + 0.5 * (1 - k)) * 1.6, k); }
    else if (f.k === 'glight') { if (inView(f.x, f.y, f.s)) { const o = f.s * 0.3; glow(g, f.x + Math.cos(f.a) * o, f.y + Math.sin(f.a) * o, f.s * (0.85 + 0.3 * (1 - k)) * 1.3, 0.55 * k * k, GLOW_G); } }
    else if (f.k === 'flashW') { if (inView(f.x, f.y, f.s * 2)) glow(g, f.x, f.y, f.s * (1.6 - 0.6 * k) * 1.4, k, GLOW_W); }
    else if (f.k === 'muzzle') { if (inView(f.x, f.y, 30)) { const r = drawMuzzle(g, f, at, home); if (full || f.st === 'cn' || f.st === 'rk') glow(g, f.x, f.y, r * 1.1, 0.7 * k, GLOW_W); } }
    else if (f.k === 'tracer') { g.globalAlpha = 0.5 * k; g.strokeStyle = '#ffb860'; g.lineWidth = 3; g.beginPath(); g.moveTo(f.x1, f.y1); g.lineTo(f.x2, f.y2); g.stroke(); g.globalAlpha = k; g.strokeStyle = '#fff0b8'; g.lineWidth = 1; g.stroke(); }
    else if (f.k === 'flame') { if (inView(f.x2, f.y2, 60)) drawFlame(g, f, t); }
    else if (f.k === 'repair') { if (inView(f.x2, f.y2, 40)) drawRepair(g, f); }
    else if (f.k === 'mush' && k > 0.75 && inView(f.x, f.y, 120)) { const q = 1 - k, H = (20 + 70 * Math.sqrt(q)) * f.s; glow(g, f.x + WIND.x * q * 1.6, f.y - H, 12 * f.s, (0.25 - q) * 3, FB); }
  }
  for (const w of fxs.wrecks) if (w.t < w.life * (w.burn || 0.3) && inView(w.x, w.y, 30)) glow(g, w.x, w.y, 18, 0.4 + 0.15 * Math.sin(t * 13 + w.ph));
  for (const r of ruins) if (r.t < 6 && inView(r.x, r.y, 60)) glow(g, r.x, r.y, 40, 0.5 * (1 - r.t / 6) + 0.1 * Math.sin(t * 11 + r.id));
  for (const b of burning) if (full || b.kind === 'struct') glow(g, b.x, b.y, b.kind === 'struct' ? b.w * TILE * 0.7 : 14, 0.32 + 0.12 * Math.sin(t * 13 + b.id));
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  for (const f of fxs.fx) {
    if ((f.k !== 'ring' && f.k !== 'shock') || !inView(f.x, f.y, 80)) continue;
    const k = f.life / f.max;
    if (f.k === 'ring') { g.strokeStyle = `rgba(255,190,110,${0.8 * k})`; g.lineWidth = 2; g.beginPath(); g.arc(f.x, f.y, f.s * (1.4 - k), 0, 7); g.stroke(); }
    else {
      // onda d'urto a terra: anello chiaro sottile e anello di polvere più largo
      const R = f.s * (0.3 + 2.2 * (1 - k));
      g.strokeStyle = `rgba(255,248,225,${0.5 * k})`; g.lineWidth = 1 + 1.5 * k; g.beginPath(); g.ellipse(f.x, f.y, R, R * 0.85, 0, 0, 7); g.stroke();
      g.strokeStyle = `rgba(150,128,92,${0.35 * k})`; g.lineWidth = 4 * k + 1; g.beginPath(); g.ellipse(f.x, f.y, R * 0.8, R * 0.68, 0, 0, 7); g.stroke();
    }
  }
}
