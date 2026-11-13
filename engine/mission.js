// Missioni della campagna: preparazione della partita (basi, mezzi, ricerche del nemico), obiettivo e fine missione.
// I dati delle missioni sono in MISSIONS (data.js); qui solo le regole.
import { TILE, MW, MH, P, E, B0, B1, DIFF, MISSION_DIFF, TECH_BY, MISSION_BY, RANKS, HERO, VETERANS_MAX } from './data.js';
import { S, deposits, occ, emit, makeStruct, makeUnit, makeHero, setRank, rankFor, setWeather, validDesign } from './world.js';
import { formation, reachMap, passable, nearestFree } from './path.js';
import { canPlace } from './orders.js';
import { alive } from './sim.js';

/* ---------- preparazione ---------- */
// Configurazione del nemico della missione, scalata dalla difficoltà (i valori della missione sono per «Veterano»):
// in missione la differenza di ogni grandezza di DIFF rispetto a «Veterano» vale solo per la quota in
// MISSION_DIFF[diff] (per esempio rendita a «Comandante»: 1 + (1,3 − 1) × MISSION_DIFF.difficile.inc); a «Veterano»
// i valori sono quelli della missione. S.ecfg = {label, inc, rs, first, gap, w0, wmax, wstep, build, waves, maxTier, factories, keep};
// build è true, false o 'repair' (i genieri riparano soltanto, senza piazzare edifici nuovi).
function enemyConfig(en, diff) {
  const D = DIFF[diff], N = DIFF.normale, waves = en.waves || 'none', K = MISSION_DIFF[diff];
  const ratio = (k, key) => 1 + (D[key] / N[key] - 1) * k;
  return {
    label: D.label, inc: (1 + (D.inc - 1) * K.inc) * (en.inc ?? 1), rs: (1 + (D.rs - 1) * K.rs) * (en.rs ?? 1),
    first: waves === 'none' ? 1e9 : Math.round((en.first ?? N.first) * ratio(K.waves, 'first')),
    gap: Math.round((en.gap ?? N.gap) * ratio(K.waves, 'gap')),
    w0: Math.max(1, (en.w0 ?? N.w0) + Math.round((D.w0 - N.w0) * K.waves)),
    wmax: Math.max(1, Math.round((en.wmax ?? N.wmax) * ratio(K.waves, 'wmax'))),
    wstep: en.wstep ?? 2, build: en.build === 'repair' ? 'repair' : !!en.build, waves, maxTier: en.maxTier ?? 4, factories: en.factories ?? 2,
    keep: en.keep ?? 0,
  };
}
// Primo posto libero (con una casella di margine) cercando a spirale attorno al punto (cx, cy) spostato di `fwd`
// caselle verso (fx, fy) e di `side` di lato. Deterministico: niente numeri casuali.
function spotNear(type, cx, cy, fx, fy, fwd, side) {
  const px = Math.round(cx + fx * fwd - fy * side), py = Math.round(cy + fy * fwd + fx * side);
  for (let r = 0; r <= 10; r++) for (let y = py - r; y <= py + r; y++) for (let x = px - r; x <= px + r; x++) {
    if (Math.max(Math.abs(x - px), Math.abs(y - py)) !== r) continue;
    // canPlace con il lato E: le stesse regole senza il controllo dell'esplorato (la nebbia non c'è ancora).
    if (canPlace(E, type, x, y, 1)) return [x, y];
  }
  return null;
}
// Posizioni relative (avanti, di lato) dei vari edifici di una base, rispetto alla direzione dell'avversario.
const SLOTS = {
  factory: [[-1, 5], [-1, -5], [-5, 0]],
  lab: [[-4, -4], [-4, 4]],
  depot: [[-3, 0]],
  tower: [[5, -3], [5, 3], [7, 0], [4, -7], [4, 7], [8, -5]],
  bunker: [[7, -5], [7, 5], [9, 0]],
};
// Edifici già pronti di una base: elenco di tipi (giocatore) o conteggi per tipo (nemico, campi della base).
function buildBase(o, cx, cy, toward, list) {
  const dx = toward.x - cx, dy = toward.y - cy, dl = Math.hypot(dx, dy) || 1, fx = dx / dl, fy = dy / dl;
  const used = {};
  for (const type of list) {
    if (type === 'pump') {
      const d = deposits.filter(d => !occ[d.x + d.y * MW] && Math.hypot(d.x - cx, d.y - cy) < 14)
        .sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))[0];
      if (d) makeStruct('pump', o, d.x, d.y, true);
      continue;
    }
    const k = used[type] = (used[type] || 0) + 1, sl = SLOTS[type] || [[-3, 0]], [f, s] = sl[(k - 1) % sl.length];
    const at = spotNear(type, cx, cy, fx, fy, f + Math.floor((k - 1) / sl.length) * 2, s);
    if (at) makeStruct(type, o, at[0], at[1], true);
  }
}
// Mezzi in formazione attorno a una casella: progetti (d) o genieri (null).
function spawnUnits(o, tx, ty, list) {
  const tiles = formation(tx, ty, list.length, false);
  list.forEach((d, i) => { const t = tiles[i]; if (t) makeUnit(o, d, (t[0] + 0.5) * TILE, (t[1] + 0.5) * TILE); });
}
// Punti d'ingresso delle ondate da fuori mappa: una casella sul bordo destro e una sul bordo basso, libere e
// raggiungibili dalla base del giocatore, le più vicine a tre quarti del lato.
function edgeSpawns() {
  const R = reachMap([[B0.x, B0.y + 2]], false), out = [];
  for (const [ax, ay, horiz] of [[MW - 1, Math.round(MH * 0.7), false], [Math.round(MW * 0.7), MH - 1, true]]) {
    let best = null, bd = 1e9;
    for (let k = 0; k < (horiz ? MW : MH); k++) {
      const x = horiz ? k : ax, y = horiz ? ay : k;
      if (!R[x + y * MW] || !passable(x, y, false)) continue;
      const d = Math.abs((horiz ? x : y) - (horiz ? ax : ay)); if (d < bd) { bd = d; best = [x, y]; }
    }
    if (best) out.push(best);
  }
  return out;
}
// Veterani validi tra quelli passati a newGame: progetto conosciuto, grado 0–3 (almeno quello che spetta
// all'esperienza), esperienza almeno quella del grado; al più VETERANS_MAX.
function cleanVeterans(list) {
  const out = [];
  for (const v of list) {
    if (out.length >= VETERANS_MAX) break;
    if (!v || !validDesign(v.d)) continue;
    const r0 = Math.max(0, Math.min(RANKS.length - 1, Math.floor(Number(v.rank) || 0))), xp0 = Math.max(0, Number(v.xp) || 0);
    const rank = Math.max(r0, rankFor(xp0));
    out.push({ d: { c: v.d.c, p: v.d.p, w: v.d.w }, rank, xp: Math.max(xp0, RANKS[rank].kills) });
  }
  return out;
}
// Casella libera accanto al comando del giocatore per la Macchina di Villo: sotto l'angolo del comando verso il
// centro della mappa; `taken` (facoltativo): caselle già date ad altri mezzi (indici x + y * MW).
function heroSpot(hq, taken) {
  const tiles = formation(hq.tx + hq.w, hq.ty + hq.h, 12, false);
  const t = (taken && tiles.find(([x, y]) => !taken.has(x + y * MW))) || tiles[0] || nearestFree(hq.tx + hq.w, hq.ty + hq.h, false, 8);
  return t ? [(t[0] + 0.5) * TILE, (t[1] + 0.5) * TILE] : null;
}
// Prepara la missione M sullo stato appena creato (mappa già pronta): risorse, basi, mezzi, ricerche, obiettivo.
// veterans: mezzi portati dalla missione prima (opts.veterans di newGame). I veterani e la Macchina di Villo si
// creano per ultimi, così tutti gli altri mezzi ed edifici hanno gli stessi id di una missione senza di loro.
export function setupMission(M, veterans = []) {
  const pl = M.player || {}, en = M.enemy || {};
  S.ecfg = enemyConfig(en, S.diff);
  S.ai.waveSize = S.ecfg.w0; S.ai.nextAttack = S.ecfg.first;
  for (const id of en.tech || []) if (TECH_BY[id]) S.tech[E][id] = true;
  S.res = [pl.res ?? 600, en.res ?? 600];
  S.timeLimit = M.timeLimit ?? null;
  // giocatore: comando in B0, edifici, genieri e mezzi
  const hqP = makeStruct('hq', P, B0.x - 1, B0.y - 1, true);
  buildBase(P, B0.x, B0.y, B1, pl.structs || []);
  spawnUnits(P, B0.x - 1, B0.y + 3, Array(pl.builders ?? 2).fill(null));
  spawnUnits(P, B0.x + 3, B0.y, pl.units || []);
  // nemico: una o più basi
  const bases = [];
  for (const b of en.bases || []) {
    const cx = b.x ?? B1.x, cy = b.y ?? B1.y;
    if (b.hq) makeStruct('hq', E, cx - 1, cy - 1, true);
    const list = [];
    for (const t of ['factory', 'lab', 'depot', 'tower', 'bunker', 'pump']) for (let i = 0; i < (b[t === 'tower' ? 'towers' : t === 'bunker' ? 'bunkers' : t === 'pump' ? 'pumps' : t] || 0); i++) list.push(t);
    buildBase(E, cx, cy, B0, list);
    spawnUnits(E, cx + 1, cy - 3, Array(b.builders || 0).fill(null));
    spawnUnits(E, cx - 3, cy, b.units || []);
    bases.push({ x: cx, y: cy });
  }
  if (S.ecfg.waves === 'edge') S.ai.spawns = edgeSpawns();
  // veterani: sulle caselle subito dopo quelle dei mezzi di partenza, già al loro grado
  const vets = cleanVeterans(veterans), n0 = (pl.units || []).length;
  const tiles = formation(B0.x + 3, B0.y, n0 + vets.length, false), taken = new Set(tiles.map(t => t[0] + t[1] * MW));
  for (const t of formation(B0.x - 1, B0.y + 3, pl.builders ?? 2, false)) taken.add(t[0] + t[1] * MW);
  vets.forEach((v, i) => {
    const t = tiles[n0 + i]; if (!t) return;
    const u = makeUnit(P, v.d, (t[0] + 0.5) * TILE, (t[1] + 0.5) * TILE);
    u.xp = v.xp; setRank(u, v.rank); u.hp = u.max; u.vet = true;
  });
  // Macchina di Villo accanto al comando
  if (S.hero) { const at = heroSpot(hqP, taken); if (at) makeHero(at[0], at[1]); }
  S.objective = initObjective(M.objective, bases);
  updateObjective();
}

/* ---------- obiettivo ----------
   S.objective = {type, target, progress, done, failed, text} più i campi del tipo:
   outpost: need (pompe), pumpsOk (pompe avviate almeno una volta tutte insieme), killed;
   hold: need, secs, held (secondi consecutivi con almeno need pompe), since (inizio del tratto, o null);
   survive: secs; survive_then_destroy: secs, stage (1 resisti, 2 distruggi; la base distrutta già nella fase 1 vince
   subito), killed;
   destroy: killed (comandi, fabbriche e genieri nemici distrutti); destroy_all_bases: bases ([{x, y, down}]).
   sent: ultimo testo mandato con l'evento objective. */
function initObjective(spec, bases) {
  const o = { type: spec.type, target: 0, progress: 0, done: false, failed: false, text: '', sent: '' };
  if (spec.type === 'outpost') Object.assign(o, { need: spec.pumps || 4, pumpsOk: false, killed: 0 });
  else if (spec.type === 'hold') Object.assign(o, { need: spec.pumps || 6, secs: spec.time || 180, held: 0, since: null });
  else if (spec.type === 'survive') o.secs = spec.time || 600;
  else if (spec.type === 'survive_then_destroy') Object.assign(o, { secs: spec.time || 480, stage: 1, killed: 0 });
  else if (spec.type === 'destroy') o.killed = 0;
  else if (spec.type === 'destroy_all_bases') o.bases = bases.map(b => ({ x: b.x, y: b.y, down: false }));
  else throw new Error(`Obiettivo sconosciuto: ${spec.type}`);
  return o;
}
// Entità nemica che conta per l'obiettivo: nell'avamposto ogni edificio finito (i genieri e i cantieri no);
// altrimenti comando, fabbrica o geniere.
const keyEnt = (type, e) => type === 'outpost' ? e.kind === 'struct' && e.built >= 1 : (e.kind === 'struct' ? e.type === 'hq' || e.type === 'factory' : !!e.builder);
// Chiamata da kill (combat.js) per ogni entità distrutta in missione.
export function noteKill(e) {
  const o = S.objective;
  if (!o || e.owner !== E || o.killed == null || !keyEnt(o.type, e)) return;
  o.killed++;
}

/* ---------- Macchina di Villo ----------
   Se viene distrutta non si perde nulla: resta «dal carrozziere» per HERO.respawn secondi di gioco e poi torna accanto
   al comando del giocatore, se ce n'è ancora uno, con il grado e l'esperienza di prima. Non conta per la sconfitta
   (alive) né per gli obiettivi. */
// Chiamata da kill (combat.js) quando l'entità distrutta è la Macchina di Villo.
export function heroDown(e) {
  const h = S.hero;
  if (!h || h.id !== e.id) return;
  h.id = 0; h.down = true; h.backAt = S.time + HERO.respawn; h.xp = e.xp || 0; h.rank = e.rank || 0;
  emit('hero', { state: 'down', x: e.x, y: e.y });
  emit('toast', { text: `La macchina di Villo è dal carrozziere: torna tra ${HERO.respawn} secondi.`, kind: 'warn' });
}
// Da step: quando è l'ora rimette in campo la Macchina di Villo accanto al comando (se manca il comando aspetta).
export function heroTick() {
  const h = S.hero;
  if (!h || !h.down || S.time < h.backAt) return;
  const hq = S.ents.find(e => !e.dead && e.owner === P && e.type === 'hq' && e.built >= 1);
  const at = hq && heroSpot(hq);
  if (!at) return;
  const u = makeHero(at[0], at[1]);
  emit('hero', { state: 'back', x: u.x, y: u.y });
  emit('toast', { text: 'La macchina di Villo è tornata.', kind: '' });
}
const mmss = s => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
// st: edifici nemici finiti (quelli che contano nell'avamposto).
function enemyKeys() {
  let hq = 0, fac = 0, bld = 0, st = 0;
  for (const e of S.ents) {
    if (e.dead || e.owner !== E) continue;
    if (e.kind === 'struct') { if (e.built >= 1) st++; if (e.type === 'hq') hq++; else if (e.type === 'factory') fac++; }
    else if (e.builder) bld++;
  }
  return { hq, fac, bld, st };
}
function destroyText(k) {
  const parts = [];
  if (k.hq) parts.push(plural(k.hq, 'comando', 'comandi'));
  if (k.fac) parts.push(plural(k.fac, 'fabbrica', 'fabbriche'));
  if (k.bld) parts.push(plural(k.bld, 'geniere', 'genieri'));
  return parts.length ? `Base nemica · restano ${parts.join(', ')}` : 'Base nemica distrutta';
}
// Ricalcola avanzamento, testo e completamento dell'obiettivo.
export function updateObjective() {
  const o = S.objective; if (!o) return;
  const k = enemyKeys();
  const remaining = k.hq + k.fac + k.bld;
  switch (o.type) {
    case 'outpost': {
      const p = S.ents.filter(e => !e.dead && e.owner === P && e.type === 'pump' && e.built >= 1).length;
      if (p >= o.need) o.pumpsOk = true;
      const pd = o.pumpsOk ? o.need : Math.min(p, o.need);
      o.target = o.need + o.killed + k.st; o.progress = pd + o.killed;
      o.text = `${o.pumpsOk ? 'Pompe avviate' : 'Pompe attive'}: ${pd}/${o.need} · edifici nemici rimasti: ${k.st}`;
      o.done = o.pumpsOk && k.st === 0;
      break;
    }
    case 'hold': {
      const p = S.ents.filter(e => !e.dead && e.owner === P && e.type === 'pump' && e.built >= 1).length;
      if (p >= o.need) { if (o.since == null) o.since = S.time; o.held = S.time - o.since; }
      else { o.since = null; o.held = 0; }
      o.target = o.secs; o.progress = Math.min(o.secs, Math.floor(o.held));
      o.done = o.held >= o.secs;
      o.text = `Pompe attive: ${p}/${o.need} · tienile per ${mmss(o.secs - o.held)}`;
      break;
    }
    case 'survive':
      o.target = o.secs; o.progress = Math.min(o.secs, Math.floor(S.time));
      o.done = S.time >= o.secs;
      o.text = `Resisti ancora ${mmss(o.secs - S.time)}`;
      break;
    case 'survive_then_destroy':
      if (o.stage === 1 && S.time >= o.secs) {
        o.stage = 2;
        emit('toast', { text: 'I rinforzi sono arrivati: passa al contrattacco e distruggi la base nemica.', kind: 'warn' });
        // Con la fase 2 può cambiare anche il meteo (MISSIONS[].weather2).
        const M = MISSION_BY[S.mission];
        if (M && M.weather2) setWeather(M.weather2);
      }
      // La base nemica distrutta già durante la resistenza vince subito la missione.
      if (o.stage === 1 && alive(E)) {
        o.target = o.secs; o.progress = Math.floor(S.time);
        o.text = `Resisti ancora ${mmss(o.secs - S.time)}, poi distruggi la base`;
      } else {
        o.target = o.killed + remaining; o.progress = o.killed;
        o.text = destroyText(k);
        o.done = !alive(E);
      }
      break;
    case 'destroy':
      o.target = o.killed + remaining; o.progress = o.killed;
      o.text = destroyText(k);
      o.done = !alive(E);
      break;
    case 'destroy_all_bases': {
      const R = 12 * TILE;
      for (const b of o.bases) b.down = !S.ents.some(e => !e.dead && e.owner === E && (e.type === 'hq' || e.type === 'factory') && Math.hypot(e.x - (b.x + 0.5) * TILE, e.y - (b.y + 0.5) * TILE) < R);
      const down = o.bases.filter(b => b.down).length;
      o.target = o.bases.length; o.progress = down;
      const left = k.hq + k.fac;
      o.done = down === o.bases.length && left === 0;
      o.text = `Basi nemiche distrutte: ${down}/${o.bases.length}` + (down === o.bases.length && left ? ` · resta ${plural(left, 'edificio chiave', 'edifici chiave')}` : '');
      break;
    }
  }
}
function sendObjective(force) {
  const o = S.objective;
  const key = `${o.text}|${o.done}|${o.failed}`;
  if (!force && key === o.sent) return;
  o.sent = key;
  emit('objective', { type: o.type, progress: o.progress, target: o.target, text: o.text, done: o.done });
}
// Ogni 0,5 s in missione (da step): aggiorna l'obiettivo, manda l'evento se è cambiato e decide la fine.
// La vittoria arriva con l'obiettivo; la sconfitta se il giocatore perde comando, fabbriche e genieri o se scade
// S.timeLimit.
export function missionTick() {
  if (!S.objective || S.phase !== 'play') return;
  updateObjective();
  const o = S.objective;
  let end = null;
  if (o.done) end = { won: true, reason: 'objective' };
  else if (!alive(P)) end = { won: false, reason: 'destroyed' };
  else if (S.timeLimit && S.time >= S.timeLimit) end = { won: false, reason: 'time' };
  if (end && !end.won) o.failed = true;
  sendObjective(false);
  if (end) { S.phase = end.won ? 'won' : 'lost'; emit('end', end); }
}
