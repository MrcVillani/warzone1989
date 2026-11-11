// Stato della partita, entità, visibilità ed eventi verso il client.
// Le variabili esportate con `let` sono binding "vivi": chi le importa legge sempre il valore attuale,
// ma solo questo modulo le riassegna.
import { TILE, MW, MH, N, P, E, B0, B1, ROAD, STRUCTS, CHASSIS, PROPS, WEAPONS, DIFF, BUILDER, TECH_BY, TOWER_MG, TOWER_CN, TOWER_CN75, DEFAULT_DESIGNS, missionOf } from './data.js';
import { genMap, missionMap } from './map.js';
import { MAP_BY, drawnMap } from './maps/index.js';
import { setupMission } from './mission.js';
import { formation } from './path.js';
import { ftile } from './util.js';

export let S = null;
export let terr = null, deposits = [], depIdx = null, occ = null, vis = null, explored = null;
// bases: centri dei due comandi della mappa ([P, E]): B0 e B1 sulla mappa generata, quelli del disegno sulle mappe
// disegnate. hasRoad: la mappa ha strade (solo allora A* tiene conto della velocità sulla strada).
export let bases = [B0, B1], hasRoad = false;
export const idx = new Map();
export const proj = [];

/* ---------- eventi ----------
   Il motore non disegna e non conosce il DOM: comunica con il client tramite eventi.
   toast {text, kind} · ping {x, y} · fx {k, ...} · world {} · fog {} · end {won}
   fx con k = 'flash': anche w (chiave dell'arma in WEAPONS; per torrette e bunker quella usata) e owner (chi spara);
   fx con k = 'flame' {x1, y1, x2, y2, r, owner}: getto del lanciafiamme (r = raggio dell'area in pixel);
   fx con k = 'repair' {x1, y1, x2, y2, owner}: raggio del modulo riparazione dal mezzo che ripara a quello riparato;
   fx con k = 'boom': anche owner e kind: 'unit' o 'struct' per la distruzione di un'entità (owner = lato
   dell'entità distrutta), 'shot' per l'esplosione di un proiettile (owner = lato del tiratore).
   unit {owner, id, x, y}: una fabbrica o il comando consegnano un mezzo (anche un geniere).
   built {owner, id, type}: un edificio è finito (non per quelli che nascono già pronti, come il comando iniziale).
   research {owner, id}: una ricerca è completata (id della ricerca in TECH).
   placed {owner, id, type}: un cantiere è stato piazzato (solo se il piazzamento riesce).
   objective {type, progress, target, text, done}: l'avanzamento dell'obiettivo della missione è cambiato (solo in
   campagna, al più due volte al secondo).
   end {won, reason}: fine partita; reason: 'objective' (obiettivo della missione raggiunto), 'destroyed' (un lato ha
   perso comando, fabbriche e genieri: la vittoria in schermaglia e ogni sconfitta), 'time' (tempo della missione
   scaduto). */
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
// Effetti delle ricerche completate da un lato (campo eff in TECH): somma del valore `key` (dmg: solo la famiglia).
export function techSum(owner, key, family) {
  if (owner == null || !S || !S.tech[owner]) return 0;
  let v = 0;
  for (const id in S.tech[owner]) {
    if (!S.tech[owner][id]) continue;
    const e = TECH_BY[id] && TECH_BY[id].eff; if (!e || e[key] == null) continue;
    if (key === 'dmg') { if (e.dmg[0] === family) v += e.dmg[1]; } else v += e[key];
  }
  return v;
}
export const armorBonus = owner => techSum(owner, 'armor');
export const dmgMul = (owner, family) => 1 + techSum(owner, 'dmg', family);
export const speedMul = owner => 1 + techSum(owner, 'speed');
// Moltiplicatore di velocità del mezzo sulla strada (ROAD): quello della propulsione, per i genieri quello delle ruote.
export const roadMul = u => u.builder ? BUILDER.road : (PROPS[u.d.p].road ?? 1);
// Centro della base di partenza del lato (casella del centro del comando iniziale).
export const homeOf = o => bases[o];
// Arma delle torrette del lato: l'ultima ricerca di torretta completata.
export function towerWeapon(owner) { const T = S.tech[owner]; return T.twCN75 ? TOWER_CN75 : T.twCN ? TOWER_CN : TOWER_MG; }
// Statistiche di un progetto. Con owner valgono anche le ricerche di quel lato (corazza, danno, velocità);
// hps: punti riparati al secondo (solo per il modulo riparazione).
export function dStats(d, owner) {
  const c = CHASSIS[d.c], p = PROPS[d.p], w = WEAPONS[d.w];
  const cost = c.cost + p.cost + w.cost;
  return {
    hp: Math.round(c.hp * p.hpm), armor: c.armor + armorBonus(owner),
    speed: baseSpeed(d) * speedMul(owner), cost, time: Math.round(5 + cost / 14),
    dps: w.dmg * dmgMul(owner, w.family) / w.rof, range: w.range, hps: w.heal || 0,
  };
}
// Velocità senza ricerche (pixel al secondo): è quella salvata sul mezzo; i motori si applicano in movimento.
function baseSpeed(d) { return 62 * PROPS[d.p].speed * (1.12 - 0.12 * CHASSIS[d.c].wt); }
export function designName(d) { return `${CHASSIS[d.c].name} ${WEAPONS[d.w].short} ${PROPS[d.p].short}`; }
export function makeUnit(owner, d, x, y) {
  const builder = !d;
  const st = builder ? BUILDER : dStats(d, owner);
  const a = owner === P ? 0.8 : -2.3;
  return addEnt({
    kind: 'unit', owner, d: d ? { c: d.c, p: d.p, w: d.w } : null, builder, x, y, ang: a, tang: a,
    hp: st.hp, max: st.hp, speed: builder ? st.speed : baseSpeed(d), water: !builder && PROPS[d.p].water, rad: builder ? 9 : CHASSIS[d.c].rad,
    order: { t: 'idle' }, gx: x, gy: y, cd: 0, tgt: 0, scan: Math.random() * 0.3, path: null, pi: 0, role: null,
  });
}
export function armorOf(e) {
  if (e.kind === 'struct') return STRUCTS[e.type].armor;
  return (e.builder ? BUILDER.armor : CHASSIS[e.d.c].armor) + armorBonus(e.owner);
}

/* ---------- partita ---------- */
// newGame(diff, seed): schermaglia. newGame(diff, seed, opts) con opts facoltativo:
//   mission: indice (0–7) o id di una missione della campagna (MISSIONS); il seme della mappa resta `seed`;
//   tech: ricerche già completate dal giocatore ({id: true}), portate dalla campagna;
//   designs: progetti salvati dal giocatore;
//   autoplay: true = anche il lato del giocatore è guidato dall'IA (simulazioni);
//   map: id di una mappa disegnata (MAPS in maps/index.js, per esempio 'latina'), solo in schermaglia; 'casuale' o
//   niente = la mappa generata dal seme, come sempre. S.map è l'id della mappa disegnata, oppure null.
// Stato in più: S.mission (id della missione o null), S.objective, S.maxTier (livello massimo del giocatore, null in
// schermaglia), S.ecfg (configurazione del nemico in missione), S.mapOpts (ritocchi della mappa), S.night (true nelle
// missioni notturne, campo `night` di MISSIONS; false altrove e in schermaglia: solo aspetto, nessuna regola).
// Con opts.tech o opts.designs ma senza missione è una schermaglia con quelle ricerche e quei progetti.
export function newGame(diff, seed, opts) {
  const M = opts && opts.mission != null ? missionOf(opts.mission) : null;
  if (opts && opts.mission != null && !M) throw new Error(`Missione sconosciuta: ${opts.mission}`);
  const mapId = opts && opts.map != null && opts.map !== 'casuale' ? opts.map : null;
  if (mapId && !MAP_BY[mapId]) throw new Error(`Mappa sconosciuta: ${mapId}`);
  if (mapId && M) throw new Error('Le mappe disegnate valgono solo in schermaglia.');
  S = {
    seed, diff, time: 0, nextId: 1, ents: [], res: [600, 600], tech: [{}, {}],
    designs: [{ c: 'L', p: 'W', w: 'MG' }],
    ai: { wave: 0, waveSize: DIFF[diff].w0, nextAttack: DIFF[diff].first, alert: null, skip: [] },
    stats: { built: [0, 0], lost: [0, 0], kills: [0, 0], made: [0, 0] },
    timers: { fog: 0, ai: 0, end: 0 }, lastWarn: -99,
    phase: 'play', explored: null,
  };
  if (opts) {
    if (opts.tech) for (const id in opts.tech) if (opts.tech[id] && TECH_BY[id]) S.tech[P][id] = true;
    if (Array.isArray(opts.designs) && opts.designs.length) S.designs = opts.designs.filter(validDesign).map(d => ({ c: d.c, p: d.p, w: d.w }));
    if (!S.designs.length) S.designs = DEFAULT_DESIGNS.map(d => ({ ...d }));
    if (opts.autoplay) S.autoplay = true;
  }
  S.mission = M ? M.id : null; S.objective = null; S.maxTier = M ? M.maxTier : null; S.map = mapId;
  S.night = !!(M && M.night);
  if (M) S.mapOpts = M.map || {};
  setupWorld();
  if (M) setupMission(M);
  else if (mapId) for (const o of [P, E]) skirmishBase(o);
  else {
    for (const o of [P, E]) {
      const m = (x, y) => o === P ? [x, y] : [MW - 1 - x, MH - 1 - y];
      const [hx, hy] = m(B0.x, B0.y);
      makeStruct('hq', o, hx - 1, hy - 1, true);
      for (const [x, y] of [[8, 12], [10, 12]]) { const [a, b] = m(x, y); makeUnit(o, null, (a + 0.5) * TILE, (b + 0.5) * TILE); }
      for (const [x, y] of [[12, 8], [12, 10]]) { const [a, b] = m(x, y); makeUnit(o, { c: 'L', p: 'W', w: 'MG' }, (a + 0.5) * TILE, (b + 0.5) * TILE); }
    }
  }
  updateFog();
  return S;
}
// Partenza della schermaglia su una mappa disegnata: comando nel centro della base, due mezzi davanti (verso la base
// avversaria) e due genieri di lato, sulle caselle libere più vicine.
function skirmishBase(o) {
  const b = bases[o], f = bases[1 - o], dl = Math.hypot(f.x - b.x, f.y - b.y) || 1, fx = (f.x - b.x) / dl, fy = (f.y - b.y) / dl;
  makeStruct('hq', o, b.x - 1, b.y - 1, true);
  const place = (k, s, list) => {
    const tiles = formation(Math.round(b.x + fx * k - fy * s), Math.round(b.y + fy * k + fx * s), list.length, false);
    list.forEach((d, i) => { const t = tiles[i]; if (t) makeUnit(o, d, (t[0] + 0.5) * TILE, (t[1] + 0.5) * TILE); });
  };
  place(3, 0, [{ c: 'L', p: 'W', w: 'MG' }, { c: 'L', p: 'W', w: 'MG' }]);
  place(0, 3, [null, null]);
}
export const validDesign = d => !!d && !!CHASSIS[d.c] && !!PROPS[d.p] && !!WEAPONS[d.w];
// Configurazione dell'IA di un lato: in schermaglia quella della difficoltà, in missione quella del nemico della
// missione (S.ecfg); per il giocatore guidato dall'IA i suoi tempi (AI_PLAYER, passati da ai.js).
export function enemyCfg() { return S.ecfg || DIFF[S.diff]; }
function setupWorld() {
  const m = S.map ? drawnMap(S.map) : S.mapOpts ? missionMap(S.seed, S.mapOpts) : genMap(S.seed); terr = m.t; deposits = m.deps;
  bases = m.bases || [B0, B1]; hasRoad = terr.includes(ROAD);
  depIdx = new Int16Array(N).fill(-1); deposits.forEach((d, i) => { depIdx[d.x + d.y * MW] = i; });
  occ = new Int32Array(N); vis = new Uint8Array(N);
  explored = S.explored ? Uint8Array.from(S.explored) : new Uint8Array(N);
  idx.clear(); proj.length = 0;
  emit('world');
}
// I proiettili in volo vivono nell'array esportato `proj`, fuori da S: il salvataggio li porta nel campo `proj`
// e il caricamento li rimette nell'array (S non contiene mai il campo `proj`).
export function loadState(st) {
  const { proj: saved, ...rest } = st;
  S = rest;
  S.timers = S.timers || { fog: 0, ai: 0, end: 0 };
  if (S.lastWarn == null) S.lastWarn = -99;
  S.night = !!S.night; // i salvataggi di prima del campo valgono «giorno»
  setupWorld();
  for (const e of S.ents) { idx.set(e.id, e); if (e.kind === 'struct') markOcc(e, e.id); }
  if (Array.isArray(saved)) for (const p of saved) proj.push({ ...p });
  updateFog();
  return S;
}
export function serialize() {
  return S ? Object.assign({}, S, { explored: Array.from(explored), proj: proj.map(p => ({ ...p })) }) : null;
}

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
