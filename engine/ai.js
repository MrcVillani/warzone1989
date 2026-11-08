// IA del Direttorio Ferreo: economia, ricerca, edifici, produzione e attacchi a ondate.
// La stessa IA può guidare il lato del giocatore (aiTick(P), con S.autoplay): stato in S.aiP, tempi in AI_PLAYER;
// in missione persegue l'obiettivo (in «tieni le pompe» e «resisti» difende e non attacca).
import { TILE, MW, P, E, B0, B1, STRUCTS, CHASSIS, PROPS, WEAPONS, TECH_BY, AI_TECH, AI_TECH_P, AI_STALL, AI_ARMY, AI_RECALL, AI_PLAYER, BUILDER, UNIT_CAP } from './data.js';
import { S, occ, idx, deposits, explored, emit, dStats, armorOf, enemyCfg, makeUnit } from './world.js';
import { passable, nearestFree, reachMap, reachableAdj, formation } from './path.js';
import { cmdMove, cmdBuild, canPlace, placeStruct, enqueue, techAvail, startResearch, demolish, unitCount } from './orders.js';
import { ftile, gridRef } from './util.js';

// R: caselle raggiungibili dai genieri (reachMap); il posto scelto deve avere almeno una casella accanto raggiungibile.
// toward: casella verso cui si spinge in avanti (la base avversaria).
function aiSpot(o, type, base, forward, R, toward) {
  const dx = toward.x - base.x, dy = toward.y - base.y, dl = Math.hypot(dx, dy) || 1;
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
// Il giocatore guidato dall'IA, se l'acqua allunga molto la strada verso il nemico (hoverUseful), fa hovercraft
// per la quota AI_PLAYER.hover dei mezzi; il nemico non li usa (così la schermaglia resta quella di sempre).
export function aiDesign(o) {
  const T = S.tech[o], r = Math.random;
  const c = T.chX && r() < 0.45 ? 'X' : T.chH && r() < 0.6 ? 'H' : T.chM && r() < 0.85 ? 'M' : 'L';
  const heavy = c === 'H' || c === 'X';
  let p = T.prTR && heavy && r() < 0.55 ? 'TR' : T.prT && r() < (heavy ? 0.75 : 0.4) ? 'T' : T.prHT && r() < 0.85 ? 'HT' : 'W';
  if (o === P && T.prV && hoverUseful(o) && r() < (AI_PLAYER.hover ?? 0.7)) p = 'V';
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
// L'acqua allunga la strada via terra dalla base del lato verso il comando nemico più vicino di almeno
// AI_PLAYER.hoverGain volte rispetto a quella sull'acqua (o la base si raggiunge solo dall'acqua). Si calcola una volta
// per partita (il terreno non cambia) e resta nello stato dell'IA (campo hover).
function hoverUseful(o) {
  const ai = o === E ? S.ai : S.aiP;
  if (!ai) return false;
  if (ai.hover != null) return ai.hover;
  const own = S.ents.find(e => !e.dead && e.owner === o && e.type === 'hq'), foe = S.ents.find(e => !e.dead && e.owner !== o && e.type === 'hq');
  if (!own || !foe) return false;
  const dist = water => {
    const R = reachMap([[own.tx + 1, own.ty + 3]], water);
    let best = 0;
    for (let y = foe.ty - 2; y <= foe.ty + 4; y++) for (let x = foe.tx - 2; x <= foe.tx + 4; x++) {
      const v = x >= 0 && y >= 0 && x < MW && R[x + y * MW]; if (v && (!best || v < best)) best = v;
    }
    return best;
  };
  const land = dist(false), wet = dist(true);
  return (ai.hover = !!wet && (!land || land > wet * (AI_PLAYER.hoverGain ?? 1.6)));
}
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
// Bersaglio dell'avversario `foe` più vicino al punto: prima gli edifici, poi qualsiasi cosa.
function foeTarget(foe, fx, fy) {
  let best = null, bd = 1e18;
  for (const e of S.ents) { if (e.dead || e.owner !== foe || e.kind !== 'struct') continue; const d = (e.x - fx) ** 2 + (e.y - fy) ** 2; if (d < bd) { bd = d; best = e; } }
  if (!best) for (const e of S.ents) { if (e.dead || e.owner !== foe) continue; const d = (e.x - fx) ** 2 + (e.y - fy) ** 2; if (d < bd) { bd = d; best = e; } }
  return best;
}
// Valore di un gruppo di mezzi: somma dei costi dei progetti. foeWorth (lo usa solo il giocatore guidato dall'IA):
// l'esercito del lato più le sue torrette e i suoi bunker, contati per AI_PLAYER.defW volte il loro costo.
const unitWorth = u => u.builder ? 0 : CHASSIS[u.d.c].cost + PROPS[u.d.p].cost + WEAPONS[u.d.w].cost;
const worth = list => list.reduce((a, u) => a + unitWorth(u), 0);
function foeWorth(foe) {
  let v = 0;
  for (const e of S.ents) {
    if (e.dead || e.owner !== foe) continue;
    if (e.kind === 'unit') v += unitWorth(e);
    else if ((e.type === 'tower' || e.type === 'bunker') && e.built >= 1) v += STRUCTS[e.type].cost * (AI_PLAYER.defW ?? 0.5);
  }
  return v;
}
// Stato dell'IA del giocatore (S.aiP), creato al primo giro.
export function newAiState(D) { return { wave: 0, waveSize: D.w0, nextAttack: D.first, alert: null, skip: [] }; }
// L'IA del lato `o` in missione deve solo difendere: obiettivi «tieni le pompe», «resisti» e la prima parte di
// «resisti, poi distruggi». Il nemico non è mai in difesa pura (il suo comportamento lo decide S.ecfg).
function defensive(o) {
  const ob = S.objective;
  return o === P && !!ob && (ob.type === 'hold' || ob.type === 'survive' || (ob.type === 'survive_then_destroy' && ob.stage === 1));
}
// Punto di raduno davanti alla base, verso la base avversaria.
function rallyOf(base, toward) {
  const dx = toward.x - base.x, dy = toward.y - base.y, dl = Math.hypot(dx, dy) || 1;
  const rf = nearestFree(Math.round(base.x + dx / dl * 7), Math.round(base.y + dy / dl * 7), false, 8) || [base.x, base.y];
  return [(rf[0] + 0.5) * TILE, (rf[1] + 0.5) * TILE];
}
// Ondata da fuori mappa (nemico senza base, S.ecfg.waves === 'edge'): i mezzi compaiono vicino a uno dei punti
// d'ingresso in S.ai.spawns (caselle sul bordo), due punti insieme per le ondate grandi, e avanzano sul giocatore.
function edgeWave(o, ai, D) {
  const sp = ai.spawns || [];
  if (!sp.length) return;
  let n = Math.min(ai.waveSize, UNIT_CAP - unitCount(o), AI_ARMY - S.ents.filter(e => e.owner === o && e.kind === 'unit' && !e.dead).length);
  ai.wave++; ai.waveSize = Math.min(D.wmax, D.w0 + ai.wave * (D.wstep ?? 2)); ai.nextAttack = S.time + D.gap;
  if (n <= 0) return;
  const pts = n >= 6 && sp.length > 1 ? sp : [sp[(ai.wave - 1) % sp.length]];
  const sectors = [];
  for (let k = 0; k < pts.length; k++) {
    const m = Math.ceil(n / (pts.length - k)); n -= m;
    const tiles = formation(pts[k][0], pts[k][1], m, false);
    const grp = [];
    for (const [x, y] of tiles) { const u = makeUnit(o, aiDesign(o), (x + 0.5) * TILE, (y + 0.5) * TILE); u.role = 'atk'; S.stats.made[o]++; grp.push(u); }
    if (!grp.length) continue;
    const tg = foeTarget(1 - o, grp[0].x, grp[0].y);
    if (tg) cmdMove(grp, tg.x, tg.y, true);
    sectors.push(gridRef(pts[k][0], pts[k][1]));
    emit('ping', { x: grp[0].x, y: grp[0].y });
  }
  if (sectors.length) emit('toast', { text: `Intercettazione radio: reparti nemici entrano nel settore ${sectors.join(' e ')}.`, kind: 'warn' });
}
// Un giro dell'IA per il lato `o` (E se omesso: il Direttorio Ferreo).
export function aiTick(o = E) {
  const foe = o === E ? P : E;
  const ai = o === E ? S.ai : (S.aiP || (S.aiP = newAiState(AI_PLAYER)));
  const D = o === E ? enemyCfg() : AI_PLAYER;
  const build = D.build !== false, waves = D.waves || 'base', guard = defensive(o);
  const mine = S.ents.filter(e => e.owner === o && !e.dead);
  const structs = mine.filter(e => e.kind === 'struct'), units = mine.filter(e => e.kind === 'unit');
  const hqs = structs.filter(s => s.type === 'hq'), hq = hqs[0];
  const home = o === E ? B1 : B0;
  const base = hq ? { x: hq.tx + 1, y: hq.ty + 1 } : { x: home.x, y: home.y };
  // Verso dove spingersi: per il nemico la base del giocatore (B0); per il giocatore il comando nemico più vicino.
  let toward = B0;
  if (o === P) {
    toward = B1; let bd = 1e18;
    for (const e of S.ents) if (!e.dead && e.owner === foe && e.type === 'hq') { const d = Math.hypot(e.tx + 1 - base.x, e.ty + 1 - base.y); if (d < bd) { bd = d; toward = { x: e.tx + 1, y: e.ty + 1 }; } }
  }
  if (waves === 'edge' && S.time >= ai.nextAttack) edgeWave(o, ai, D);
  const builders = units.filter(u => u.builder), army = units.filter(u => !u.builder);
  const count = t => structs.filter(s => s.type === t).length;
  const res = () => S.res[o];
  // genieri
  if (build && hq && hq.built >= 1 && !hq.queue.length && builders.length < (S.time > 360 ? 4 : 3) && res() >= BUILDER.cost) enqueue(hq, null, o);
  // ricerca
  // Se un laboratorio resta libero per mancanza di gasolio, la produzione lascia da parte il costo della ricerca.
  let resReserve = 0;
  // Il giocatore usa AI_TECH_P (tutte le ricerche) e, se servono gli hovercraft, li ricerca appena può.
  const order = o === E ? AI_TECH : AI_TECH_P;
  for (const lab of structs.filter(s => s.type === 'lab' && s.built >= 1 && !s.rs)) {
    const next = (o === P && techAvail(o, 'prV') && hoverUseful(o) ? 'prV' : null) || order.find(id => techAvail(o, id));
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
  if (build && unfinished.length && builders.length) {
    const idle = builders.some(u => u.order.t === 'idle');
    unfinished = unfinished.filter(s => {
      const stuck = stalled(s, builders) || (idle && !reachableAdj(s.tx, s.ty, s.w, s.h, reachB()).length);
      if (!stuck) return true;
      if (s.type === 'pump') skip.push(s.tx + s.ty * MW);
      demolish(s); return false;
    });
  }
  const depOk = new Map(), depCheck = d => { const k = d.x + d.y * MW; if (!depOk.has(k)) depOk.set(k, depReachable(d, builders)); return depOk.get(k); };
  if (build) for (const b of builders.filter(u => u.order.t === 'idle')) {
    if (unfinished.length) {
      const s = unfinished.sort((a, c) => Math.hypot(a.x - b.x, a.y - b.y) - Math.hypot(c.x - b.x, c.y - b.y))[0];
      cmdBuild([b], s); s.aiA = S.time; continue;
    }
    const dmg = structs.find(s => s.built >= 1 && s.hp < s.max * 0.6);
    if (dmg) { cmdBuild([b], dmg); continue; }
    // build 'repair' (in missione): i genieri riparano soltanto, senza piazzare edifici nuovi.
    if (D.build === 'repair') continue;
    let plan = null;
    const reach = S.time > 420 || (o === P && S.objective && S.objective.type === 'hold') ? 40 : 28;
    const free = deposits.filter(d => !occ[d.x + d.y * MW] && !skip.includes(d.x + d.y * MW) && Math.hypot(d.x - base.x, d.y - base.y) < reach && !S.ents.some(e => e.owner === foe && !e.dead && e.kind === 'struct' && Math.hypot(e.x / TILE - d.x, e.y / TILE - d.y) < 8))
      .sort((a, c) => Math.hypot(a.x - base.x, a.y - base.y) - Math.hypot(c.x - base.x, c.y - base.y));
    // Il giocatore guidato dall'IA, con quattro pompe e senza fabbrica, mette prima la fabbrica; con molto gasolio da
    // parte non aspetta i cinque minuti per le altre fabbriche (fino a AI_PLAYER.factories).
    const facFirst = o === P && count('factory') === 0 && count('pump') >= 4 && res() >= 200;
    const dep = res() >= 50 && !facFirst ? free.find(depCheck) : null;
    // Il giocatore non può piazzare una pompa dove non ha mai visto: il geniere va prima a esplorare il giacimento.
    if (dep && o === P && !explored[dep.x + dep.y * MW]) { cmdMove([b], (dep.x + 0.5) * TILE, (dep.y + 1.5) * TILE, false); continue; }
    const towers = guard ? Math.min(8, 2 + Math.floor(S.time / 100)) : Math.min(6, 1 + Math.floor(S.time / 140));
    if (dep) plan = { type: 'pump', tx: dep.x, ty: dep.y };
    else if (count('factory') === 0 && (D.factories ?? 2) > 0) { if (res() >= 200) plan = aiSpot(o, 'factory', base, false, reachB(), toward); }
    else if (count('lab') === 0 && S.time > 40) { if (res() >= 150) plan = aiSpot(o, 'lab', base, false, reachB(), toward); }
    else if (count('tower') < towers && res() >= 190) plan = aiSpot(o, 'tower', base, true, reachB(), toward);
    else if (S.tech[o].stBK && count('bunker') < Math.min(3, 1 + Math.floor((S.time - 300) / 240)) && res() >= 380) plan = aiSpot(o, 'bunker', base, true, reachB(), toward);
    else if (count('factory') < (D.factories ?? 2) && (S.time > 300 || (o === P && res() >= 600)) && res() >= 260) plan = aiSpot(o, 'factory', base, false, reachB(), toward);
    else if (S.tech[o].stRP && count('depot') === 0 && res() >= 220) plan = aiSpot(o, 'depot', base, false, reachB(), toward);
    else if (count('lab') < 2 && S.time > 420 && res() >= 260) plan = aiSpot(o, 'lab', base, false, reachB(), toward);
    if (plan) { const s = placeStruct(o, plan.type, plan.tx, plan.ty); if (s) { cmdBuild([b], s); unfinished.push(s); } }
  }
  // punto di raduno davanti alla base, verso l'avversario; con più comandi ogni base ha il suo (rallies), e i mezzi
  // e le fabbriche usano quello del comando più vicino. Il giocatore che deve tenere le pompe si raduna tra le pompe.
  let rally = rallyOf(base, toward);
  if (guard && S.objective.type === 'hold') {
    const pumps = structs.filter(s => s.type === 'pump' && s.built >= 1);
    if (pumps.length) {
      const cx = pumps.reduce((a, s) => a + s.tx, 0) / pumps.length, cy = pumps.reduce((a, s) => a + s.ty, 0) / pumps.length;
      const f = nearestFree(Math.round((cx + base.x) / 2), Math.round((cy + base.y) / 2), false, 8);
      if (f) rally = [(f[0] + 0.5) * TILE, (f[1] + 0.5) * TILE];
    }
  }
  const rallies = hqs.length > 1 ? hqs.map((h, i) => ({ x: h.x, y: h.y, r: i ? rallyOf({ x: h.tx + 1, y: h.ty + 1 }, toward) : rally })) : null;
  const rallyFor = e => { if (!rallies) return rally; let b = rallies[0], bd = 1e18; for (const r of rallies) { const d = (r.x - e.x) ** 2 + (r.y - e.y) ** 2; if (d < bd) { bd = d; b = r; } } return b.r; };
  // produzione
  const freeDeps = deposits.some(d => !occ[d.x + d.y * MW] && !skip.includes(d.x + d.y * MW) && Math.hypot(d.x - base.x, d.y - base.y) < 28);
  const reserve = (freeDeps ? 50 : 0) + (count('lab') === 0 && S.time > 40 ? 150 : 0) + resReserve;
  // Il limite AI_ARMY conta anche i mezzi già in coda nelle fabbriche (anche quelle ancora in costruzione).
  const factories = structs.filter(s => s.type === 'factory');
  let armyN = army.length + factories.reduce((a, f) => a + f.queue.filter(q => q.d).length, 0);
  if (build) for (const f of factories.filter(s => s.built >= 1)) {
    f.rally = rallyFor(f);
    // Il progetto scelto resta in attesa (aiNext) finché non c'è il gasolio: così i mezzi costosi non vengono scartati.
    if (f.queue.length < 2 && armyN < AI_ARMY) {
      const d = f.aiNext || (f.aiNext = aiDesign(o));
      if (res() >= dStats(d, o).cost + reserve && enqueue(f, d, o)) { f.aiNext = null; armyN++; }
    }
  }
  // esercito: difesa, raduno, ondate
  for (const u of army) if (!u.role) u.role = 'def';
  const def = army.filter(u => u.role === 'def');
  const al = ai.alert, near = al && (hqs.length > 1 ? hqs.some(h => Math.hypot(al.x - h.x, al.y - h.y) < 20 * TILE) : Math.hypot(al.x / TILE - base.x, al.y / TILE - base.y) < 20);
  const alert = al && S.time - al.t < 4 && (near || (o === P && Math.hypot(al.x - rally[0], al.y - rally[1]) < 16 * TILE)) ? al : null;
  // Il giocatore che deve tenere le pompe ripulisce i giacimenti della sua metà: un edificio nemico entro 9 caselle da
  // un giacimento raggiungibile (a meno di 40 caselle dalla base) attira i difensori fermi, se sono almeno quattro.
  let sweep = null;
  if (!alert && guard && S.objective.type === 'hold' && def.length >= 4) {
    let bd = 1e18;
    for (const e of S.ents) {
      if (e.dead || e.owner !== foe || e.kind !== 'struct') continue;
      const d = Math.hypot(e.x / TILE - base.x, e.y / TILE - base.y);
      if (d < 40 && d < bd && deposits.some(p => Math.hypot(p.x + 0.5 - e.x / TILE, p.y + 0.5 - e.y / TILE) < 9 && Math.hypot(p.x - base.x, p.y - base.y) < 40)) { bd = d; sweep = e; }
    }
  }
  if (alert) { for (const u of def) if (u.order.t !== 'amove' && u.order.t !== 'attack') cmdMove([u], alert.x, alert.y, true); }
  else if (sweep) { const idle = def.filter(u => u.order.t === 'idle' || u.order.t === 'move'); if (idle.length) cmdMove(idle, sweep.x, sweep.y, true); }
  else for (const u of def) { const r = rallyFor(u); if (u.order.t === 'idle' && Math.hypot(u.x - r[0], u.y - r[1]) > 6 * TILE) cmdMove([u], r[0], r[1], true); }
  // Rinnovo dell'esercito al limite, quando il mezzo più vecchio è fatto di parti superate (l'IA ne ha già ricercate
  // di livello più alto): parte subito un'ondata con tutti i difensori, così l'esercito si consuma e la produzione
  // riprende con parti nuove. Se non ha difensori (sono tutti all'attacco e nessuno cade), richiama in base i mezzi
  // superati più vecchi, al massimo AI_RECALL alla volta, e li smonta al punto di raduno (role 'home').
  const best = bestTier(o);
  const atCap = !guard && armyN >= AI_ARMY && designTier(army.reduce((a, u) => u.id < a.id ? u : a).d) < best;
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
  // Il giocatore guidato dall'IA attacca solo se i difensori valgono (in gasolio) almeno AI_PLAYER.edge volte
  // l'esercito nemico più le sue difese fisse (contate per AI_PLAYER.defW volte il costo); al limite di mezzi attacca
  // comunque. Il primo attacco non parte prima di AI_PLAYER.first secondi.
  const strongEnough = o === E || armyN >= AI_ARMY || worth(def) >= (D.edge ?? 1.2) * foeWorth(foe);
  // In missione il nemico può tenere in base una quota dei difensori (S.ecfg.keep, i più nuovi): l'ondata parte con gli
  // altri. In schermaglia keep non c'è e parte tutto.
  const keepN = o === E && D.keep ? Math.floor(def.length * D.keep) : 0;
  const go = keepN ? def.slice().sort((a, b) => a.id - b.id).slice(0, def.length - keepN) : def;
  // Con keep l'ondata non chiede più mezzi di quanti ne possono partire al limite AI_ARMY: al più AI_ARMY difensori
  // (meno i mezzi già fuori, all'attacco o di ritorno), meno la quota tenuta in base. Se waveSize li supera, parte
  // con quelli (almeno uno). In schermaglia keep non c'è e serve waveSize.
  let need = ai.waveSize;
  if (o === E && D.keep) { const n = AI_ARMY - (army.length - def.length); need = Math.max(1, Math.min(need, n - Math.floor(n * D.keep))); }
  if (waves === 'base' && !guard && ((S.time >= ai.nextAttack && go.length >= need && strongEnough) || renew)) {
    const tg = foeTarget(foe, base.x * TILE, base.y * TILE);
    if (tg) {
      go.forEach(u => { u.role = 'atk'; });
      cmdMove(go, tg.x, tg.y, true);
      ai.wave++; ai.waveSize = Math.min(D.wmax, D.w0 + ai.wave * (D.wstep ?? 2)); ai.nextAttack = S.time + D.gap;
      // L'avviso solo per una colonna vera: i pochi mezzi nuovi mandati avanti dal rinnovo non lo ripetono di continuo.
      if (o === E && go.length >= D.w0) emit('toast', { text: 'Intercettazione radio: una colonna nemica si muove verso di te.', kind: 'warn' });
    }
  }
  for (const u of army) if (u.role === 'atk' && u.order.t === 'idle') { const tg = foeTarget(foe, u.x, u.y); if (tg) cmdMove([u], tg.x, tg.y, true); }
}
