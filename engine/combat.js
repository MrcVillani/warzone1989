// Distanze, bersagli, danni, colpi e proiettili.
import { TILE, P, E, STRUCTS, WEAPONS, RANKS, RANK_XP } from './data.js';
import { S, idx, proj, emit, ent, armorOf, canSee, markOcc, dmgMul, weatherNow, gainXp, heroLevel } from './world.js';
import { noteKill, heroDown } from './mission.js';
import { angDiff, turnToward, ftile, gridRef } from './util.js';

// Distanza dal bordo del bersaglio: rettangolo per gli edifici, cerchio per i mezzi.
export function edist(a, t) {
  if (t.kind === 'struct') {
    const x0 = t.tx * TILE, y0 = t.ty * TILE, x1 = x0 + t.w * TILE, y1 = y0 + t.h * TILE;
    const dx = Math.max(x0 - a.x, 0, a.x - x1), dy = Math.max(y0 - a.y, 0, a.y - y1);
    return Math.hypot(dx, dy);
  }
  return Math.max(0, Math.hypot(a.x - t.x, a.y - t.y) - t.rad);
}
// Nemico più vicino entro R pixel; i bersagli armati hanno la precedenza su pompe e genieri.
export function nearestEnemy(u, R, minR) {
  let best = null, bd = 1e9;
  for (const e of S.ents) {
    if (e.dead || e.owner === u.owner) continue;
    if (Math.abs(e.x - u.x) > R + 100 || Math.abs(e.y - u.y) > R + 100) continue;
    const d = edist(u, e); if (d > R || (minR && d < minR * TILE)) continue;
    if (!canSee(u.owner, e)) continue;
    const armed = (e.kind === 'unit' && !e.builder) || e.type === 'tower';
    const score = d * (armed ? 1 : 1.35);
    if (score < bd) { bd = score; best = e; }
  }
  return best;
}
// La corazza toglie danno, ma ogni colpo fa almeno il 35% del suo valore.
export function damageAfterArmor(dmg, armor) { return Math.max(dmg * 0.35, dmg - armor); }

// Danno di un colpo dell'arma w (facoltativa) sul bersaglio, con le regole speciali dell'arma:
// armorK (quanto conta la corazza), vsStruct (moltiplicatore contro gli edifici), antiArmor (+frazione per punto di corazza).
export function hitDamage(t, dmg, w) {
  let a = armorOf(t);
  if (w) {
    if (w.armorK != null) a *= w.armorK;
    if (w.vsStruct && t.kind === 'struct') dmg *= w.vsStruct;
    if (w.antiArmor) dmg *= 1 + w.antiArmor * armorOf(t);
  }
  return damageAfterArmor(dmg, a);
}
// src (facoltativo): id del mezzo o dell'edificio che ha sparato; se il colpo distrugge il bersaglio, l'esperienza
// va a lui (vedi kill).
export function damage(t, dmg, owner, w, src) {
  if (!t || t.dead) return;
  t.hp -= hitDamage(t, dmg, w);
  if (t.kind === 'unit') t.fought = S.time;
  if (t.owner === P && S.time - S.lastWarn > 12) {
    S.lastWarn = S.time;
    emit('toast', { text: `Contatto nemico nel settore ${gridRef(ftile(t.x), ftile(t.y))}.`, kind: 'bad' });
    emit('ping', { x: t.x, y: t.y });
  }
  if (t.owner === E) S.ai.alert = { x: t.x, y: t.y, t: S.time };
  else if (S.aiP) S.aiP.alert = { x: t.x, y: t.y, t: S.time };
  if (t.hp <= 0) kill(t, owner, src);
}
// by: lato che ha distrutto l'entità (per le statistiche); src (facoltativo): id di chi ha dato il colpo di grazia.
// Se è un mezzo armato ancora vivo dell'altro lato prende RANK_XP.kill di esperienza (torrette, bunker e genieri no).
export function kill(e, by, src) {
  if (e.dead) return;
  e.dead = true; idx.delete(e.id);
  if (e.kind === 'struct') {
    markOcc(e, 0);
    emit('fx', { k: 'boom', x: e.x, y: e.y, size: 1.4 + e.w * 0.45, owner: e.owner, kind: 'struct' });
    emit('fx', { k: 'scorch', x: e.x, y: e.y, r: e.w * TILE * 0.75 });
    const D = STRUCTS[e.type];
    if (e.owner === P) emit('toast', { text: `${D.name} ${D.m ? 'distrutto' : 'distrutta'}.`, kind: 'bad' });
    if (e.owner === E && e.type === 'hq') emit('toast', { text: 'Comando nemico distrutto.', kind: 'warn' });
  } else {
    emit('fx', { k: 'boom', x: e.x, y: e.y, size: 0.9, owner: e.owner, kind: 'unit' });
    emit('fx', { k: 'scorch', x: e.x, y: e.y, r: 13 });
  }
  if (by != null && by !== e.owner) S.stats.kills[by]++;
  const killer = src ? ent(src) : null;
  if (killer && killer.owner !== e.owner) gainXp(killer, RANK_XP.kill);
  if (e.hero) heroDown(e);
  if (S.objective) noteKill(e);
  S.stats.lost[e.owner]++;
}
// Danno ad area ai soli nemici: pieno al centro, metà sul bordo del raggio r (caselle).
export function areaDamage(x, y, r, dmg, owner, w, src) {
  const R = r * TILE;
  for (const e of S.ents) {
    if (e.dead || e.owner === owner) continue;
    if (Math.abs(e.x - x) > R + 100 || Math.abs(e.y - y) > R + 100) continue;
    const d = edist({ x, y }, e); if (d > R) continue;
    damage(e, dmg * (1 - 0.5 * d / R), owner, w, src);
  }
}
// extra (facoltativo): campi in più per l'evento dell'esplosione (per la Macchina di Villo: hero, big).
export function explodeAt(x, y, r, dmg, owner, size, w, src, extra) {
  areaDamage(x, y, r, dmg, owner, w, src);
  emit('fx', Object.assign({ k: 'boom', x, y, size, owner, kind: 'shot' }, extra));
}
// Colpo dell'arma w verso il bersaglio t. Il danno include, al momento dello sparo, le ricerche di danno del
// tiratore, il suo grado (RANKS[].dmg) e, per le armi di famiglia 'fire', il meteo (WEATHER[].fire); i proiettili
// portano wk (chiave dell'arma) per le regole speciali all'impatto e src (id di chi ha sparato) per l'esperienza.
// by (facoltativo): il mezzo o l'edificio che spara; senza, il colpo non ha grado e non dà esperienza.
export function fire(x, y, ang, t, w, owner, len, by) {
  const mx = x + Math.cos(ang) * len, my = y + Math.sin(ang) * len;
  const unit = by && by.kind === 'unit' ? by : null, src = by ? by.id : 0;
  const base = w.hero ? heroLevel().dmg : w.dmg;
  const dmg = base * dmgMul(owner, w.family) * (w.family === 'fire' ? weatherNow().fire : 1) * (unit ? (RANKS[unit.rank] || RANKS[0]).dmg : 1), wk = w.key;
  if (unit) unit.fought = S.time;
  if (w.proj === 'bass') {
    // Bassi a palla: la scarica esplode subito sul bersaglio; ogni bigEvery colpi del mezzo è un colpo grosso.
    const n = unit ? (unit.shots = (unit.shots || 0) + 1) : 0, big = n > 0 && n % w.bigEvery === 0;
    const fxk = big ? { hero: true, big: true } : { hero: true };
    emit('fx', Object.assign({ k: 'flash', x: mx, y: my, s: big ? 9 : 6, w: wk, owner, tx: t.x, ty: t.y }, fxk));
    explodeAt(t.x, t.y, big ? w.bigSplash : w.splash, big ? dmg * w.bigDmg : dmg, owner, big ? 2.4 : 1.5, w, src, fxk);
    return;
  }
  emit('fx', { k: 'flash', x: mx, y: my, s: w.proj === 'tracer' ? 3 : w.proj === 'flame' ? 4 : 6, w: wk, owner });
  if (w.proj === 'tracer') {
    emit('fx', { k: 'tracer', x1: mx, y1: my, x2: t.x + (Math.random() - 0.5) * 10, y2: t.y + (Math.random() - 0.5) * 10 });
    damage(t, dmg, owner, w, src);
  } else if (w.proj === 'flame') {
    emit('fx', { k: 'flame', x1: mx, y1: my, x2: t.x, y2: t.y, r: w.splash * TILE, owner });
    areaDamage(t.x, t.y, w.splash, dmg, owner, w, src);
  } else if (w.proj === 'shell' || w.proj === 'missile') {
    proj.push({ k: w.proj, x: mx, y: my, tid: t.id, tx: t.x, ty: t.y, spd: w.speed, dmg, splash: 0, owner, a: ang, wk, src });
  } else if (w.proj === 'rocket') {
    const n = w.salvo || 2, spread = n > 2 ? 26 : 14;
    for (let i = 0; i < n; i++) {
      const side = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
      const ox = Math.cos(ang + Math.PI / 2) * 3 * side, oy = Math.sin(ang + Math.PI / 2) * 3 * side;
      proj.push({ k: 'rocket', x: mx + ox, y: my + oy, tid: t.id, tx: t.x, ty: t.y, ox: (Math.random() - 0.5) * spread, oy: (Math.random() - 0.5) * spread, spd: w.speed * (0.92 + Math.random() * 0.16), dmg: dmg / n, splash: w.splash, owner, a: ang, wk, src });
    }
  } else if (w.proj === 'mortar') {
    const sc = w.splash > 1.5 ? 34 : 22;
    const tx = t.x + (Math.random() - 0.5) * sc, ty = t.y + (Math.random() - 0.5) * sc, d = Math.hypot(tx - mx, ty - my);
    proj.push({ k: 'mortar', sx: mx, sy: my, x: mx, y: my, tx, ty, t: 0, dur: 0.7 + d / 300, dmg, splash: w.splash, owner, h: 0, wk, bs: w.splash > 1.5 ? 1.6 : 1.1, src });
  }
}
export function aimFire(e, t, w, dt, len) {
  const a = Math.atan2(t.y - e.y, t.x - e.x);
  e.tang = turnToward(e.tang, a, 5 * dt);
  if (e.cd > 0) return;
  if (Math.abs(angDiff(e.tang, a)) > 0.22) return;
  fire(e.x, e.y, e.tang, t, w, e.owner, len, e);
  e.cd = w.rof * (0.9 + Math.random() * 0.2);
}
export function updProj(dt) {
  for (const p of proj) {
    if (p.k === 'mortar') {
      p.t += dt; const k = Math.min(1, p.t / p.dur);
      p.x = p.sx + (p.tx - p.sx) * k; p.y = p.sy + (p.ty - p.sy) * k; p.h = Math.sin(Math.PI * k) * (24 + p.dur * 46);
      if (k >= 1) { explodeAt(p.tx, p.ty, p.splash, p.dmg, p.owner, p.bs || 1.1, WEAPONS[p.wk], p.src); p.done = true; }
      continue;
    }
    const t = ent(p.tid);
    if (t && !t.dead) { p.tx = t.x + (p.ox || 0); p.ty = t.y + (p.oy || 0); }
    const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy), st = p.spd * dt;
    p.a = Math.atan2(dy, dx);
    if (d <= st + 3) {
      p.done = true;
      const w = WEAPONS[p.wk];
      if (p.splash) explodeAt(p.tx, p.ty, p.splash, p.dmg, p.owner, 0.55, w, p.src);
      else { if (t && !t.dead) damage(t, p.dmg, p.owner, w, p.src); emit('fx', { k: 'hit', x: p.tx, y: p.ty }); }
      continue;
    }
    p.x += dx / d * st; p.y += dy / d * st;
    if (p.k === 'rocket' || p.k === 'missile') emit('fx', { k: 'trail', x: p.x, y: p.y });
  }
  let j = 0; for (const p of proj) if (!p.done) proj[j++] = p; proj.length = j;
}
