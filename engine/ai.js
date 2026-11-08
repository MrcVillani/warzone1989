// IA del Direttorio Ferreo: economia, ricerca, edifici, produzione e attacchi a ondate.
import { TILE, MW, P, E, B0, B1, STRUCTS, CHASSIS, PROPS, WEAPONS, TECH_BY, DIFF, AI_TECH, AI_STALL, AI_ARMY, AI_RECALL, BUILDER } from './data.js';
import { S, occ, idx, deposits, emit, dStats, armorOf } from './world.js';
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
// Progetto per la prossima produzione dell'IA: il telaio e la propulsione migliori che ha (con un po' di varietà),
// un'arma principale forte; in piccola quota riparatori e artiglieria, anticarro quando il giocatore ha mezzi corazzati.
export function aiDesign(o) {
  const T = S.tech[o], r = Math.random;
  const c = T.chX && r() < 0.45 ? 'X' : T.chH && r() < 0.6 ? 'H' : T.chM && r() < 0.85 ? 'M' : 'L';
  const heavy = c === 'H' || c === 'X';
  const p = T.prTR && heavy && r() < 0.55 ? 'TR' : T.prT && r() < (heavy ? 0.75 : 0.4) ? 'T' : T.prHT && r() < 0.85 ? 'HT' : 'W';
  let n = 0, sup = 0, art = 0, foes = 0, armored = 0;
  for (const e of S.ents) {
    if (e.dead || e.kind !== 'unit' || e.builder) continue;
    if (e.owner === o) { n++; const f = WEAPONS[e.d.w].family; if (f === 'support') sup++; else if (f === 'artillery') art++; }
    else { foes++; if (armorOf(e) >= 4) armored++; }
  }
  let w;
  if (T.wRP && n >= 5 && sup < n * 0.1 && r() < 0.5) w = 'RP';
  else if ((T.wHW || T.wMO) && n >= 6 && art < n * 0.15 && r() < 0.5) w = T.wHW && r() < 0.8 ? 'HW' : T.wMO ? 'MO' : 'HW';
  else if (T.wAT && foes >= 3 && armored >= foes * 0.3 && r() < 0.6) w = 'AT';
  else {
    const ws = [T.wHMG ? 'HMG' : 'MG'];
    const cn = T.wCN105 ? 'CN105' : T.wCN75 ? 'CN75' : T.wCN ? 'CN' : null;
    if (cn) ws.push(cn, cn, cn);
    if (T.wFL) ws.push('FL');
    if (T.wMRL) ws.push('MRL', 'MRL'); else if (T.wRK) ws.push('RK', 'RK');
    if (ws.length > 1 && r() < 0.8) ws.shift();
    w = ws[Math.floor(r() * ws.length)];
  }
  return { c, p, w };
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
// Livello di un progetto: quello della sua parte migliore. bestTier: il livello più alto tra le parti sbloccate.
const designTier = d => Math.max(CHASSIS[d.c].tier, PROPS[d.p].tier, WEAPONS[d.w].tier);
function bestTier(o) {
  let t = 1;
  for (const parts of [CHASSIS, PROPS, WEAPONS]) for (const k in parts) { const x = parts[k]; if (!x.req || S.tech[o][x.req]) t = Math.max(t, x.tier); }
  return t;
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
  // Se un laboratorio resta libero per mancanza di gasolio, la produzione lascia da parte il costo della ricerca.
  let resReserve = 0;
  for (const lab of structs.filter(s => s.type === 'lab' && s.built >= 1 && !s.rs)) {
    const next = AI_TECH.find(id => techAvail(o, id));
    if (next && res() >= TECH_BY[next].cost + 40) startResearch(o, lab, next);
    else if (next && army.length >= 3) resReserve = TECH_BY[next].cost;
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
    else if (S.tech[o].stBK && count('bunker') < Math.min(3, 1 + Math.floor((S.time - 300) / 240)) && res() >= 380) plan = aiSpot(o, 'bunker', base, true, reachB());
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
  const reserve = (freeDeps ? 50 : 0) + (count('lab') === 0 && S.time > 40 ? 150 : 0) + resReserve;
  // Il limite AI_ARMY conta anche i mezzi già in coda nelle fabbriche (anche quelle ancora in costruzione).
  const factories = structs.filter(s => s.type === 'factory');
  let armyN = army.length + factories.reduce((a, f) => a + f.queue.filter(q => q.d).length, 0);
  for (const f of factories.filter(s => s.built >= 1)) {
    f.rally = rally;
    // Il progetto scelto resta in attesa (aiNext) finché non c'è il gasolio: così i mezzi costosi non vengono scartati.
    if (f.queue.length < 2 && armyN < AI_ARMY) {
      const d = f.aiNext || (f.aiNext = aiDesign(o));
      if (res() >= dStats(d, o).cost + reserve && enqueue(f, d, o)) { f.aiNext = null; armyN++; }
    }
  }
  // esercito: difesa, raduno, ondate
  for (const u of army) if (!u.role) u.role = 'def';
  const def = army.filter(u => u.role === 'def');
  const alert = ai.alert && S.time - ai.alert.t < 4 && Math.hypot(ai.alert.x / TILE - base.x, ai.alert.y / TILE - base.y) < 20 ? ai.alert : null;
  if (alert) { for (const u of def) if (u.order.t !== 'amove' && u.order.t !== 'attack') cmdMove([u], alert.x, alert.y, true); }
  else for (const u of def) if (u.order.t === 'idle' && Math.hypot(u.x - rally[0], u.y - rally[1]) > 6 * TILE) cmdMove([u], rally[0], rally[1], true);
  // Rinnovo dell'esercito al limite, quando il mezzo più vecchio è fatto di parti superate (l'IA ne ha già ricercate
  // di livello più alto): parte subito un'ondata con tutti i difensori, così l'esercito si consuma e la produzione
  // riprende con parti nuove. Se non ha difensori (sono tutti all'attacco e nessuno cade), richiama in base i mezzi
  // superati più vecchi, al massimo AI_RECALL alla volta, e li smonta al punto di raduno (role 'home').
  const best = bestTier(o);
  const atCap = armyN >= AI_ARMY && designTier(army.reduce((a, u) => u.id < a.id ? u : a).d) < best;
  const renew = atCap && def.length > 0;
  for (const u of army) if (u.role === 'home' && u.order.t === 'idle') {
    if (Math.hypot(u.x - rally[0], u.y - rally[1]) < 4 * TILE) { u.dead = true; idx.delete(u.id); }
    else cmdMove([u], rally[0], rally[1], false);
  }
  if (atCap && !def.length) {
    const home = army.filter(u => u.role === 'home').length;
    const old = army.filter(u => u.role === 'atk' && designTier(u.d) < best).sort((a, b) => a.id - b.id).slice(0, Math.max(0, AI_RECALL - home));
    for (const u of old) { u.role = 'home'; cmdMove([u], rally[0], rally[1], false); }
  }
  if ((S.time >= ai.nextAttack && def.length >= ai.waveSize) || renew) {
    const tg = playerTarget(base.x * TILE, base.y * TILE);
    if (tg) {
      def.forEach(u => { u.role = 'atk'; });
      cmdMove(def, tg.x, tg.y, true);
      ai.wave++; ai.waveSize = Math.min(D.wmax, D.w0 + ai.wave * 2); ai.nextAttack = S.time + D.gap;
      // L'avviso solo per una colonna vera: i pochi mezzi nuovi mandati avanti dal rinnovo non lo ripetono di continuo.
      if (def.length >= D.w0) emit('toast', { text: 'Intercettazione radio: una colonna nemica si muove verso di te.', kind: 'warn' });
    }
  }
  for (const u of army) if (u.role === 'atk' && u.order.t === 'idle') { const tg = playerTarget(u.x, u.y); if (tg) cmdMove([u], tg.x, tg.y, true); }
}
