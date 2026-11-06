// Aggiornamento di mezzi ed edifici e passo di simulazione.
import { TILE, MW, P, E, DIRT, WATER, STRUCTS, CHASSIS, WEAPONS, TECH_BY, DIFF, TOWER_MG, TOWER_CN, PUMP_RATE } from './data.js';
import { S, terr, emit, ent, makeUnit, canSee, updateFog } from './world.js';
import { passable, nearestFree, pathTo } from './path.js';
import { setIdle, cmdMove } from './orders.js';
import { edist, nearestEnemy, aimFire, updProj } from './combat.js';
import { aiTick } from './ai.js';
import { turnToward, angDiff, ftile, gridRef } from './util.js';

export function followPath(u, dt) {
  if (!u.path || u.pi >= u.path.length) { u.path = null; return true; }
  const n = u.path[u.pi];
  if (!passable(n[0], n[1], u.water)) {
    const g = u.path[u.path.length - 1]; pathTo(u, (g[0] + 0.5) * TILE, (g[1] + 0.5) * TILE);
    return !u.path;
  }
  const px = (n[0] + 0.5) * TILE, py = (n[1] + 0.5) * TILE, dx = px - u.x, dy = py - u.y, d = Math.hypot(dx, dy);
  const lastWp = u.pi === u.path.length - 1;
  if (d < (lastWp ? 3 : 12)) { u.pi++; if (u.pi >= u.path.length) { u.path = null; return true; } return false; }
  const a = Math.atan2(dy, dx);
  u.ang = turnToward(u.ang, a, 4.5 * dt);
  const al = Math.cos(angDiff(u.ang, a));
  const onDirt = terr[ftile(u.x) + ftile(u.y) * MW] === DIRT;
  const sp = u.speed * Math.max(0.25, al) * (onDirt ? 0.92 : 1);
  const st = Math.min(d, sp * dt);
  u.x += dx / d * st; u.y += dy / d * st; u.moving = true;
  if (u.water && terr[ftile(u.x) + ftile(u.y) * MW] === WATER && Math.random() < dt * 14) emit('fx', { k: 'spray', x: u.x - Math.cos(u.ang) * 10, y: u.y - Math.sin(u.ang) * 10 });
  u.stk = (u.stk || 0) + dt;
  if (u.stk > 1.2) {
    if (Math.hypot(u.x - u.sx0, u.y - u.sy0) < 6) {
      u.fails = (u.fails || 0) + 1;
      if (u.fails > 3) { u.fails = 0; u.path = null; return true; }
      const g = u.path[u.path.length - 1]; pathTo(u, (g[0] + 0.5) * TILE, (g[1] + 0.5) * TILE);
    } else u.fails = 0;
    u.stk = 0; u.sx0 = u.x; u.sy0 = u.y;
  }
  return false;
}
function chase(u, t, dt) {
  u.chaseT = (u.chaseT || 0) - dt;
  if (!u.path || u.chaseT <= 0) { pathTo(u, t.x, t.y); u.chaseT = 1.2; }
  followPath(u, dt);
}
function adjTile(s, u) {
  let best = null, bd = 1e18;
  for (let y = s.ty - 1; y <= s.ty + s.h; y++) for (let x = s.tx - 1; x <= s.tx + s.w; x++) {
    if (x >= s.tx && x < s.tx + s.w && y >= s.ty && y < s.ty + s.h) continue;
    if (!passable(x, y, u.water)) continue;
    const d = ((x + 0.5) * TILE - u.x) ** 2 + ((y + 0.5) * TILE - u.y) ** 2;
    if (d < bd) { bd = d; best = [x, y]; }
  }
  return best;
}
function completeStruct(s) {
  s.built = 1; S.stats.built[s.owner]++;
  const D = STRUCTS[s.type];
  if (s.owner === P) emit('toast', { text: `${D.name} ${D.m ? 'pronto' : 'pronta'} nel settore ${gridRef(s.tx, s.ty)}.` });
}
function buildTick(u, dt) {
  const s = ent(u.order.id);
  if (!s || s.dead || (s.built >= 1 && s.hp >= s.max)) { setIdle(u); return; }
  if (edist(u, s) > TILE * 0.9) {
    if (!u.path) {
      u.bfails = (u.bfails || 0) + 1;
      if (u.bfails > 5) { setIdle(u); return; }
      const g = adjTile(s, u); if (!g) { setIdle(u); return; }
      pathTo(u, (g[0] + 0.5) * TILE, (g[1] + 0.5) * TILE);
    }
    followPath(u, dt); return;
  }
  u.path = null; u.bfails = 0; u.working = true;
  u.ang = turnToward(u.ang, Math.atan2(s.y - u.y, s.x - u.x), 3 * dt);
  const D = STRUCTS[s.type];
  if (s.built < 1) {
    s.built = Math.min(1, s.built + dt / D.time);
    s.hp = Math.min(s.max, s.hp + s.max * 0.95 * dt / D.time);
    if (s.built >= 1) completeStruct(s);
  } else s.hp = Math.min(s.max, s.hp + 32 * dt);
  if (Math.random() < dt * 9) emit('fx', { k: 'spark', x: (s.tx + Math.random() * s.w) * TILE, y: (s.ty + Math.random() * s.h) * TILE });
}
export function updUnit(u, dt) {
  u.moving = false; u.working = false;
  if (u.cd > 0) u.cd -= dt;
  const w = u.d ? WEAPONS[u.d.w] : null;
  const tx = ftile(u.x), ty = ftile(u.y);
  if (!passable(tx, ty, u.water)) {
    // Il mezzo è finito sotto un edificio appena piazzato: esce verso la casella libera più vicina.
    const f = nearestFree(tx, ty, u.water, 6);
    if (f) { const px = (f[0] + 0.5) * TILE, py = (f[1] + 0.5) * TILE, dx = px - u.x, dy = py - u.y, d = Math.hypot(dx, dy) || 1, st = Math.min(d, 90 * dt); u.x += dx / d * st; u.y += dy / d * st; }
    return;
  }
  let t = null;
  if (w) {
    t = ent(u.tgt) || null;
    if (t && (t.dead || !canSee(u.owner, t))) { t = null; u.tgt = 0; }
    if (u.order.t === 'attack') {
      const ot = ent(u.order.id);
      if (!ot || ot.dead || !canSee(u.owner, ot)) { setIdle(u); t = null; u.tgt = 0; }
      else { t = ot; u.tgt = ot.id; }
    }
    u.scan -= dt;
    if (u.order.t !== 'attack' && u.scan <= 0) {
      u.scan = 0.3 + Math.random() * 0.1;
      const R = (u.order.t === 'move' ? w.range : w.range + 2.5) * TILE;
      if (!t || edist(u, t) > R) { t = nearestEnemy(u, R, w.minRange); u.tgt = t ? t.id : 0; }
    }
  }
  const o = u.order, inRange = t && edist(u, t) <= w.range * TILE * 0.92;
  switch (o.t) {
    case 'move': if (followPath(u, dt)) setIdle(u); break;
    case 'amove':
      if (t) { if (!inRange) chase(u, t, dt); else u.path = null; }
      else {
        if (!u.path) pathTo(u, o.x, o.y);
        if (followPath(u, dt)) setIdle(u);
      }
      break;
    case 'attack': if (t) { if (!inRange) chase(u, t, dt); else u.path = null; } break;
    case 'idle':
      if (t) {
        if (!inRange) { if (Math.hypot(t.x - u.gx, t.y - u.gy) < 9 * TILE) chase(u, t, dt); else { t = null; u.tgt = 0; u.path = null; } }
        else u.path = null;
      }
      if (!t) {
        if (Math.hypot(u.x - u.gx, u.y - u.gy) > TILE * 1.2) { if (!u.path) pathTo(u, u.gx, u.gy); if (followPath(u, dt)) { u.gx = u.x; u.gy = u.y; } }
        else u.path = null;
      }
      break;
    case 'build': buildTick(u, dt); break;
  }
  if (w) {
    if (t && !t.dead) {
      const d = edist(u, t);
      if (d <= w.range * TILE && !(w.minRange && d < w.minRange * TILE)) aimFire(u, t, w, dt, CHASSIS[u.d.c].size[0] * 0.55 + 4);
      else u.tang = turnToward(u.tang, u.ang, 2 * dt);
    } else u.tang = turnToward(u.tang, u.ang, 2 * dt);
  }
}
function exitPoint(s) {
  const f = nearestFree(s.tx + Math.floor(s.w / 2), s.ty + s.h, false, 8);
  return f ? [(f[0] + 0.5) * TILE, (f[1] + 0.5) * TILE] : [s.x, s.y + s.h * TILE];
}
export function pumpRate(owner) { return PUMP_RATE * (S.tech[owner].pump2 ? 1.5 : 1) * (owner === E ? DIFF[S.diff].inc : 1); }
export function updStruct(s, dt) {
  if (s.built < 1) return;
  if (s.type === 'pump') { S.res[s.owner] += pumpRate(s.owner) * dt; return; }
  if ((s.type === 'factory' || s.type === 'hq') && s.queue.length) {
    const q = s.queue[0]; q.t += dt;
    if (s.type === 'factory' && Math.random() < dt * 3) emit('fx', { k: 'chimney', x: s.tx * TILE + s.w * TILE - 16, y: s.ty * TILE + 18 });
    if (q.t >= q.total) {
      s.queue.shift();
      const [x, y] = exitPoint(s);
      const u = makeUnit(s.owner, q.d, x, y);
      u.ang = u.tang = Math.PI / 2;
      S.stats.made[s.owner]++;
      if (s.rally) cmdMove([u], s.rally[0], s.rally[1], s.owner === E); else cmdMove([u], x, y + TILE * 1.5, false);
    }
  }
  if (s.type === 'lab' && s.rs) {
    s.rs.t += dt;
    if (s.rs.t >= s.rs.total) {
      const id = s.rs.id; S.tech[s.owner][id] = true; s.rs = null;
      if (s.owner === P) emit('toast', { text: `Ricerca completata: ${TECH_BY[id].name}.` });
    }
  }
  if (s.type === 'tower') {
    if (s.cd > 0) s.cd -= dt;
    const w = S.tech[s.owner].twCN ? TOWER_CN : TOWER_MG;
    let t = ent(s.tgt);
    s.scan -= dt;
    if (!t || t.dead || edist(s, t) > w.range * TILE || !canSee(s.owner, t)) {
      t = null; s.tgt = 0;
      if (s.scan <= 0) { s.scan = 0.3; t = nearestEnemy(s, w.range * TILE, 0); s.tgt = t ? t.id : 0; }
    }
    if (t) aimFire(s, t, w, dt, 12);
  }
  if (s.type === 'depot') {
    const R = 3.5 * TILE;
    for (const u of S.ents) {
      if (u.kind !== 'unit' || u.owner !== s.owner || u.dead || u.hp >= u.max) continue;
      if (Math.hypot(u.x - s.x, u.y - s.y) > R) continue;
      u.hp = Math.min(u.max, u.hp + 14 * dt);
      if (Math.random() < dt * 3) emit('fx', { k: 'spark', x: u.x, y: u.y });
    }
  }
}
function separate() {
  const us = S.ents.filter(e => e.kind === 'unit' && !e.dead);
  for (let i = 0; i < us.length; i++) {
    const a = us[i];
    for (let j = i + 1; j < us.length; j++) {
      const b = us[j];
      const dx = b.x - a.x, dy = b.y - a.y, md = (a.rad + b.rad) * 0.85;
      if (Math.abs(dx) > md || Math.abs(dy) > md) continue;
      const d = Math.hypot(dx, dy) || 0.01; if (d >= md) continue;
      const push = (md - d) * 0.5, nx = dx / d, ny = dy / d;
      const ax = a.x - nx * push, ay = a.y - ny * push, bx = b.x + nx * push, by = b.y + ny * push;
      if (passable(ftile(ax), ftile(ay), a.water)) { a.x = ax; a.y = ay; }
      if (passable(ftile(bx), ftile(by), b.water)) { b.x = bx; b.y = by; }
    }
  }
}
// Un lato è ancora in gioco finché ha un comando, una fabbrica o un geniere.
export function alive(o) { return S.ents.some(e => !e.dead && e.owner === o && ((e.kind === 'struct' && (e.type === 'hq' || e.type === 'factory')) || (e.kind === 'unit' && e.builder))); }
function checkEnd() {
  if (S.phase !== 'play') return;
  if (!alive(E)) { S.phase = 'won'; emit('end', { won: true }); }
  else if (!alive(P)) { S.phase = 'lost'; emit('end', { won: false }); }
}
// Un passo di simulazione di dt secondi.
export function step(dt) {
  if (!S || S.phase !== 'play') return;
  S.time += dt;
  for (const e of S.ents) { if (e.dead) continue; if (e.kind === 'struct') updStruct(e, dt); else updUnit(e, dt); }
  separate();
  updProj(dt);
  const T = S.timers;
  if ((T.fog -= dt) <= 0) { updateFog(); T.fog = 0.2; }
  if ((T.ai -= dt) <= 0) { aiTick(); T.ai = 0.5; }
  if ((T.end -= dt) <= 0) { T.end = 1; checkEnd(); }
  if (S.ents.some(e => e.dead)) S.ents = S.ents.filter(e => !e.dead);
}
