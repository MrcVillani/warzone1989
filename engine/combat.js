// Distanze, bersagli, danni, colpi e proiettili.
import { TILE, P, E, STRUCTS } from './data.js';
import { S, idx, proj, emit, ent, armorOf, canSee, markOcc } from './world.js';
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

export function damage(t, dmg, owner) {
  if (!t || t.dead) return;
  t.hp -= damageAfterArmor(dmg, armorOf(t));
  if (t.owner === P && S.time - S.lastWarn > 12) {
    S.lastWarn = S.time;
    emit('toast', { text: `Contatto nemico nel settore ${gridRef(ftile(t.x), ftile(t.y))}.`, kind: 'bad' });
    emit('ping', { x: t.x, y: t.y });
  }
  if (t.owner === E) S.ai.alert = { x: t.x, y: t.y, t: S.time };
  if (t.hp <= 0) kill(t, owner);
}
export function kill(e, by) {
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
  S.stats.lost[e.owner]++;
}
export function explodeAt(x, y, r, dmg, owner, size) {
  const R = r * TILE;
  for (const e of S.ents) {
    if (e.dead || e.owner === owner) continue;
    if (Math.abs(e.x - x) > R + 100 || Math.abs(e.y - y) > R + 100) continue;
    const d = edist({ x, y }, e); if (d > R) continue;
    damage(e, dmg * (1 - 0.5 * d / R), owner);
  }
  emit('fx', { k: 'boom', x, y, size, owner, kind: 'shot' });
}
export function fire(x, y, ang, t, w, owner, len) {
  const mx = x + Math.cos(ang) * len, my = y + Math.sin(ang) * len;
  emit('fx', { k: 'flash', x: mx, y: my, s: w.proj === 'tracer' ? 3 : 6, w: w.key, owner });
  if (w.proj === 'tracer') {
    emit('fx', { k: 'tracer', x1: mx, y1: my, x2: t.x + (Math.random() - 0.5) * 10, y2: t.y + (Math.random() - 0.5) * 10 });
    damage(t, w.dmg, owner);
  } else if (w.proj === 'shell') {
    proj.push({ k: 'shell', x: mx, y: my, tid: t.id, tx: t.x, ty: t.y, spd: w.speed, dmg: w.dmg, splash: 0, owner, a: ang });
  } else if (w.proj === 'rocket') {
    for (const side of [-1, 1]) {
      const ox = Math.cos(ang + Math.PI / 2) * 3 * side, oy = Math.sin(ang + Math.PI / 2) * 3 * side;
      proj.push({ k: 'rocket', x: mx + ox, y: my + oy, tid: t.id, tx: t.x, ty: t.y, ox: (Math.random() - 0.5) * 14, oy: (Math.random() - 0.5) * 14, spd: w.speed * (0.92 + Math.random() * 0.16), dmg: w.dmg / 2, splash: w.splash, owner, a: ang });
    }
  } else if (w.proj === 'mortar') {
    const tx = t.x + (Math.random() - 0.5) * 22, ty = t.y + (Math.random() - 0.5) * 22, d = Math.hypot(tx - mx, ty - my);
    proj.push({ k: 'mortar', sx: mx, sy: my, x: mx, y: my, tx, ty, t: 0, dur: 0.7 + d / 300, dmg: w.dmg, splash: w.splash, owner, h: 0 });
  }
}
export function aimFire(e, t, w, dt, len) {
  const a = Math.atan2(t.y - e.y, t.x - e.x);
  e.tang = turnToward(e.tang, a, 5 * dt);
  if (e.cd > 0) return;
  if (Math.abs(angDiff(e.tang, a)) > 0.22) return;
  fire(e.x, e.y, e.tang, t, w, e.owner, len);
  e.cd = w.rof * (0.9 + Math.random() * 0.2);
}
export function updProj(dt) {
  for (const p of proj) {
    if (p.k === 'mortar') {
      p.t += dt; const k = Math.min(1, p.t / p.dur);
      p.x = p.sx + (p.tx - p.sx) * k; p.y = p.sy + (p.ty - p.sy) * k; p.h = Math.sin(Math.PI * k) * (24 + p.dur * 46);
      if (k >= 1) { explodeAt(p.tx, p.ty, p.splash, p.dmg, p.owner, 1.1); p.done = true; }
      continue;
    }
    const t = ent(p.tid);
    if (t && !t.dead) { p.tx = t.x + (p.ox || 0); p.ty = t.y + (p.oy || 0); }
    const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy), st = p.spd * dt;
    p.a = Math.atan2(dy, dx);
    if (d <= st + 3) {
      p.done = true;
      if (p.splash) explodeAt(p.tx, p.ty, p.splash, p.dmg, p.owner, 0.55);
      else { if (t && !t.dead) damage(t, p.dmg, p.owner); emit('fx', { k: 'hit', x: p.tx, y: p.ty }); }
      continue;
    }
    p.x += dx / d * st; p.y += dy / d * st;
    if (p.k === 'rocket') emit('fx', { k: 'trail', x: p.x, y: p.y });
  }
  let j = 0; for (const p of proj) if (!p.done) proj[j++] = p; proj.length = j;
}
