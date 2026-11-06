// IA del Direttorio Ferreo: economia, ricerca, edifici, produzione e attacchi a ondate.
import { TILE, MW, P, E, B0, B1, STRUCTS, TECH_BY, DIFF, AI_TECH, AI_STALL, BUILDER } from './data.js';
import { S, occ, deposits, emit, dStats } from './world.js';
import { passable, nearestFree, reachMap, reachableAdj } from './path.js';
import { cmdMove, cmdBuild, canPlace, placeStruct, enqueue, techAvail, startResearch, demolish } from './orders.js';
import { ftile } from './util.js';

// R: caselle raggiungibili dai genieri (reachMap); il posto scelto deve avere almeno una casella accanto raggiungibile.
function aiSpot(o, type, base, forward, R) {
  const dx = B0.x - base.x, dy = B0.y - base.y, dl = Math.hypot(dx, dy) || 1;
  let px = base.x, py = base.y;
  if (forward) { const k = 5 + Math.random() * 3, side = (Math.random() - 0.5) * 9; px += dx / dl * k - dy / dl * side; py += dy / dl * k + dx / dl * side; }
  else { const a = Math.random() * Math.PI * 2, k = 4 + Math.random() * 4; px += Math.cos(a) * k; py += Math.sin(a) * k; }
  px = Math.round(px); py = Math.round(py);
  for (let r = 0; r <= 12; r++) for (let y = py - r; y <= py + r; y++) for (let x = px - r; x <= px + r; x++) {
    if (Math.max(Math.abs(x - px), Math.abs(y - py)) !== r) continue;
    if (canPlace(o, type, x, y, 1) && reachableAdj(x, y, STRUCTS[type].w, STRUCTS[type].h, R).length) return { type, tx: x, ty: y };
  }
  return null;
}
export function aiDesign(o) {
  const T = S.tech[o], r = Math.random;
  const c = T.chH && r() < 0.55 ? 'H' : T.chM && r() < 0.8 ? 'M' : 'L';
  const p = T.prT && r() < 0.6 ? 'T' : T.prHT && r() < 0.85 ? 'HT' : 'W';
  let ws = ['MG']; if (T.wCN) ws.push('CN', 'CN'); if (T.wRK) ws.push('RK', 'RK'); if (T.wMO) ws.push('MO');
  if (ws.length > 1 && r() < 0.8) ws = ws.filter(w => w !== 'MG');
  return { c, p, w: ws[Math.floor(r() * ws.length)] };
}
const tileOf = u => [ftile(u.x), ftile(u.y)];
// Il giacimento ha almeno una casella accanto raggiungibile da un geniere, contando la pompa già al suo posto.
function depReachable(d, builders) {
  return reachableAdj(d.x, d.y, 1, 1, reachMap(builders.map(tileOf), false, d.x + d.y * MW)).length > 0;
}
// Edificio incompiuto fermo: per AI_STALL secondi con genieri assegnati, né la costruzione avanza né un geniere si
// avvicina di almeno una casella lungo il percorso. Conta come assegnato anche un geniere che l'IA ci ha mandato al
// controllo precedente e che ha già rinunciato. Il tempo senza genieri assegnati non conta. Campi sull'edificio:
// aiA (ultimo invio di un geniere), aiB (avanzamento visto), aiD (passi del geniere assegnato più vicino, 1e9 se
// nessuno), aiT (ultimo progresso), aiC (ultimo controllo).
function stalled(s, builders) {
  const on = builders.filter(u => u.order.t === 'build' && u.order.id === s.id);
  if (s.aiB == null) { s.aiB = s.built; s.aiD = 1e9; s.aiT = s.aiC = S.time; }
  if (on.length) {
    const starts = [];
    for (let y = s.ty - 1; y <= s.ty + s.h; y++) for (let x = s.tx - 1; x <= s.tx + s.w; x++)
      if ((x < s.tx || x >= s.tx + s.w || y < s.ty || y >= s.ty + s.h) && passable(x, y, false)) starts.push([x, y]);
    const R = reachMap(starts, false);
    const d = Math.min(...on.map(u => { const v = R[ftile(u.x) + ftile(u.y) * MW]; return v ? v - 1 : 1e9; }));
    if (s.aiD >= 1e9) s.aiD = d;
    else if (d < s.aiD - 1) { s.aiD = d; s.aiT = S.time; }
  } else if (!(S.time - (s.aiA ?? -1e9) < 0.75)) { s.aiT += S.time - s.aiC; s.aiD = 1e9; }
  if (s.built > s.aiB) { s.aiB = s.built; s.aiT = S.time; }
  s.aiC = S.time;
  return S.time - s.aiT > AI_STALL;
}
function playerTarget(fx, fy) {
  let best = null, bd = 1e18;
  for (const e of S.ents) { if (e.dead || e.owner !== P || e.kind !== 'struct') continue; const d = (e.x - fx) ** 2 + (e.y - fy) ** 2; if (d < bd) { bd = d; best = e; } }
  if (!best) for (const e of S.ents) { if (e.dead || e.owner !== P) continue; const d = (e.x - fx) ** 2 + (e.y - fy) ** 2; if (d < bd) { bd = d; best = e; } }
  return best;
}
export function aiTick() {
  const o = E, ai = S.ai, D = DIFF[S.diff];
  const mine = S.ents.filter(e => e.owner === o && !e.dead);
  const structs = mine.filter(e => e.kind === 'struct'), units = mine.filter(e => e.kind === 'unit');
  const hq = structs.find(s => s.type === 'hq');
  const base = hq ? { x: hq.tx + 1, y: hq.ty + 1 } : { x: B1.x, y: B1.y };
  const builders = units.filter(u => u.builder), army = units.filter(u => !u.builder);
  const count = t => structs.filter(s => s.type === t).length;
  const res = () => S.res[o];
  // genieri
  if (hq && hq.built >= 1 && !hq.queue.length && builders.length < (S.time > 360 ? 4 : 3) && res() >= BUILDER.cost) enqueue(hq, null, o);
  // ricerca
  for (const lab of structs.filter(s => s.type === 'lab' && s.built >= 1 && !s.rs)) {
    const next = AI_TECH.find(id => techAvail(o, id));
    if (next && res() >= TECH_BY[next].cost + 40) startResearch(o, lab, next);
  }
  // costruzione
  // Un incompiuto che nessun geniere raggiunge, o fermo da troppo, si smonta (con rimborso) e si passa oltre;
  // il suo giacimento non viene più scelto.
  const skip = ai.skip || (ai.skip = []);
  let unfinished = structs.filter(s => s.built < 1);
  // Caselle raggiungibili dai genieri: si calcolano solo se servono, una volta per giro.
  let R0 = null;
  const reachB = () => R0 || (R0 = reachMap(builders.map(tileOf), false));
  if (unfinished.length && builders.length) {
    const idle = builders.some(u => u.order.t === 'idle');
    unfinished = unfinished.filter(s => {
      const stuck = stalled(s, builders) || (idle && !reachableAdj(s.tx, s.ty, s.w, s.h, reachB()).length);
      if (!stuck) return true;
      if (s.type === 'pump') skip.push(s.tx + s.ty * MW);
      demolish(s); return false;
    });
  }
  const depOk = new Map(), depCheck = d => { const k = d.x + d.y * MW; if (!depOk.has(k)) depOk.set(k, depReachable(d, builders)); return depOk.get(k); };
  for (const b of builders.filter(u => u.order.t === 'idle')) {
    if (unfinished.length) {
      const s = unfinished.sort((a, c) => Math.hypot(a.x - b.x, a.y - b.y) - Math.hypot(c.x - b.x, c.y - b.y))[0];
      cmdBuild([b], s); s.aiA = S.time; continue;
    }
    const dmg = structs.find(s => s.built >= 1 && s.hp < s.max * 0.6);
    if (dmg) { cmdBuild([b], dmg); continue; }
    let plan = null;
    const reach = S.time > 420 ? 40 : 28;
    const free = deposits.filter(d => !occ[d.x + d.y * MW] && !skip.includes(d.x + d.y * MW) && Math.hypot(d.x - base.x, d.y - base.y) < reach && !S.ents.some(e => e.owner === P && !e.dead && e.kind === 'struct' && Math.hypot(e.x / TILE - d.x, e.y / TILE - d.y) < 8))
      .sort((a, c) => Math.hypot(a.x - base.x, a.y - base.y) - Math.hypot(c.x - base.x, c.y - base.y));
    const dep = res() >= 50 ? free.find(depCheck) : null;
    if (dep) plan = { type: 'pump', tx: dep.x, ty: dep.y };
    else if (count('factory') === 0) { if (res() >= 200) plan = aiSpot(o, 'factory', base, false, reachB()); }
    else if (count('lab') === 0 && S.time > 40) { if (res() >= 150) plan = aiSpot(o, 'lab', base, false, reachB()); }
    else if (count('tower') < Math.min(6, 1 + Math.floor(S.time / 140)) && res() >= 190) plan = aiSpot(o, 'tower', base, true, reachB());
    else if (count('factory') < 2 && S.time > 300 && res() >= 260) plan = aiSpot(o, 'factory', base, false, reachB());
    else if (S.tech[o].stRP && count('depot') === 0 && res() >= 220) plan = aiSpot(o, 'depot', base, false, reachB());
    else if (count('lab') < 2 && S.time > 420 && res() >= 260) plan = aiSpot(o, 'lab', base, false, reachB());
    if (plan) { const s = placeStruct(o, plan.type, plan.tx, plan.ty); if (s) { cmdBuild([b], s); unfinished.push(s); } }
  }
  // punto di raduno davanti alla base, verso il giocatore
  const dx = B0.x - base.x, dy = B0.y - base.y, dl = Math.hypot(dx, dy) || 1;
  const rf = nearestFree(Math.round(base.x + dx / dl * 7), Math.round(base.y + dy / dl * 7), false, 8) || [base.x, base.y];
  const rally = [(rf[0] + 0.5) * TILE, (rf[1] + 0.5) * TILE];
  // produzione
  const freeDeps = deposits.some(d => !occ[d.x + d.y * MW] && !skip.includes(d.x + d.y * MW) && Math.hypot(d.x - base.x, d.y - base.y) < 28);
  const reserve = (freeDeps ? 50 : 0) + (count('lab') === 0 && S.time > 40 ? 150 : 0);
  for (const f of structs.filter(s => s.type === 'factory' && s.built >= 1)) {
    f.rally = rally;
    if (f.queue.length < 2 && army.length < 40) { const d = aiDesign(o); if (res() >= dStats(d, o).cost + reserve) enqueue(f, d, o); }
  }
  // esercito: difesa, raduno, ondate
  for (const u of army) if (!u.role) u.role = 'def';
  const def = army.filter(u => u.role === 'def');
  const alert = ai.alert && S.time - ai.alert.t < 4 && Math.hypot(ai.alert.x / TILE - base.x, ai.alert.y / TILE - base.y) < 20 ? ai.alert : null;
  if (alert) { for (const u of def) if (u.order.t !== 'amove' && u.order.t !== 'attack') cmdMove([u], alert.x, alert.y, true); }
  else for (const u of def) if (u.order.t === 'idle' && Math.hypot(u.x - rally[0], u.y - rally[1]) > 6 * TILE) cmdMove([u], rally[0], rally[1], true);
  if (S.time >= ai.nextAttack && def.length >= ai.waveSize) {
    const tg = playerTarget(base.x * TILE, base.y * TILE);
    if (tg) {
      def.forEach(u => { u.role = 'atk'; });
      cmdMove(def, tg.x, tg.y, true);
      ai.wave++; ai.waveSize = Math.min(D.wmax, D.w0 + ai.wave * 2); ai.nextAttack = S.time + D.gap;
      emit('toast', { text: 'Intercettazione radio: una colonna nemica si muove verso di te.', kind: 'warn' });
    }
  }
  for (const u of army) if (u.role === 'atk' && u.order.t === 'idle') { const tg = playerTarget(u.x, u.y); if (tg) cmdMove([u], tg.x, tg.y, true); }
}
