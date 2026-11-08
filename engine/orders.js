// Ordini e azioni: li usano sia il giocatore (dal client) sia l'IA nemica.
import { TILE, MW, MH, P, E, GROUND, DIRT, STRUCTS, TECH, TECH_BY, TIERS, TIER_GATE, DIFF, UNIT_CAP, BUILDER, WEAPONS } from './data.js';
import { S, terr, occ, depIdx, explored, idx, emit, makeStruct, markOcc, dStats } from './world.js';
import { pathTo, formation } from './path.js';
import { ftile } from './util.js';

export function setIdle(u) { u.order = { t: 'idle' }; u.path = null; u.gx = u.x; u.gy = u.y; }

export function cmdMove(units, wx, wy, amove) {
  if (!units.length) return;
  const tiles = formation(ftile(wx), ftile(wy), units.length, units.every(u => u.water));
  const list = units.slice().sort((a, b) => ((a.x - wx) ** 2 + (a.y - wy) ** 2) - ((b.x - wx) ** 2 + (b.y - wy) ** 2));
  const used = new Set();
  for (const u of list) {
    let best = -1, bd = 1e18;
    for (let k = 0; k < tiles.length; k++) {
      if (used.has(k)) continue;
      const t = tiles[k], d = ((t[0] + 0.5) * TILE - u.x) ** 2 + ((t[1] + 0.5) * TILE - u.y) ** 2;
      if (d < bd) { bd = d; best = k; }
    }
    const t = best < 0 ? [ftile(wx), ftile(wy)] : tiles[best]; used.add(best);
    const x = (t[0] + 0.5) * TILE, y = (t[1] + 0.5) * TILE;
    u.order = amove && !u.builder ? { t: 'amove', x, y } : { t: 'move', x, y };
    if (!amove) u.tgt = 0;
    pathTo(u, x, y); u.gx = x; u.gy = y;
  }
}
// I genieri e i mezzi con modulo riparazione non attaccano: l'ordine li lascia come sono.
export function cmdAttack(units, t) { for (const u of units) { if (u.builder || (u.d && WEAPONS[u.d.w].heal)) continue; u.order = { t: 'attack', id: t.id }; u.tgt = t.id; u.path = null; u.chaseT = 0; } }
export function cmdBuild(builders, s) { for (const b of builders) { if (!b.builder) continue; b.order = { t: 'build', id: s.id }; b.path = null; b.bfails = 0; } }
export function cmdStop(units) { for (const u of units) setIdle(u); }

// margin: caselle libere richieste attorno all'edificio (l'IA usa 1 per non murarsi da sola).
export function canPlace(owner, type, tx, ty, margin = 0) {
  const D = STRUCTS[type];
  if (type === 'pump') {
    if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) return false;
    const i = tx + ty * MW; return depIdx[i] >= 0 && !occ[i] && (owner === E || !!explored[i]);
  }
  for (let y = ty - margin; y < ty + D.h + margin; y++) for (let x = tx - margin; x < tx + D.w + margin; x++) {
    if (x < 0 || y < 0 || x >= MW || y >= MH) return false;
    const i = x + y * MW, v = terr[i];
    if (v !== GROUND && v !== DIRT) return false;
    if (occ[i]) return false;
    const inside = x >= tx && x < tx + D.w && y >= ty && y < ty + D.h;
    if (inside && depIdx[i] >= 0) return false;
    if (inside && owner === P && !explored[i]) return false;
    if (!inside && depIdx[i] >= 0 && type !== 'tower') return false;
  }
  return true;
}
export function placeStruct(owner, type, tx, ty) {
  const D = STRUCTS[type];
  if (D.req && !S.tech[owner][D.req]) return null;
  if (S.res[owner] < D.cost || !canPlace(owner, type, tx, ty)) return null;
  S.res[owner] -= D.cost;
  const s = makeStruct(type, owner, tx, ty, false);
  emit('placed', { owner, id: s.id, type });
  return s;
}
// Smonta un edificio fuori dal combattimento: libera le caselle, ferma i genieri che ci lavoravano e, se non era
// finito, restituisce tutto il costo. Niente eventi, niente effetti, niente statistiche di perdite.
export function demolish(s) {
  if (!s || s.dead || s.kind !== 'struct') return false;
  s.dead = true; idx.delete(s.id); markOcc(s, 0);
  if (s.built < 1) S.res[s.owner] += STRUCTS[s.type].cost;
  for (const u of S.ents) if (u.kind === 'unit' && !u.dead && u.order.t === 'build' && u.order.id === s.id) setIdle(u);
  return true;
}
export function unitCount(owner) {
  return S.ents.filter(e => e.owner === owner && e.kind === 'unit' && !e.dead).length
    + S.ents.reduce((a, e) => a + (e.owner === owner && e.queue ? e.queue.length : 0), 0);
}
// d = progetto del mezzo, oppure null per un geniere (solo dal comando).
export function enqueue(s, d, owner) {
  if (s.built < 1 || s.queue.length >= 5) return false;
  if (unitCount(owner) >= UNIT_CAP) { if (owner === P) emit('toast', { text: `Limite di ${UNIT_CAP} mezzi raggiunto.`, kind: 'warn' }); return false; }
  let cost, total;
  if (d) { const st = dStats(d, owner); cost = st.cost; total = st.time; } else { cost = BUILDER.cost; total = BUILDER.time; }
  if (S.res[owner] < cost) return false;
  S.res[owner] -= cost;
  s.queue.push({ d: d ? { c: d.c, p: d.p, w: d.w } : null, t: 0, total, cost });
  return true;
}
export function cancelQueued(s, i) {
  if (!s || !s.queue[i]) return false;
  S.res[s.owner] += s.queue[i].cost; s.queue.splice(i, 1); return true;
}
export function researching(owner, id) { return S.ents.some(e => e.owner === owner && e.type === 'lab' && !e.dead && e.rs && e.rs.id === id); }
// Ricerche completate da un lato a un certo livello.
export function tierDone(owner, tier) { let n = 0; for (const t of TECH) if (t.tier === tier && S.tech[owner][t.id]) n++; return n; }
// Il livello è aperto: il I sempre, gli altri con almeno TIER_GATE ricerche completate del livello precedente.
export function tierAvail(owner, tier) { return tier <= 1 || tierDone(owner, tier - 1) >= TIER_GATE; }
// Perché una ricerca non si può avviare (frase breve), oppure null se si può (gasolio e laboratorio a parte).
export function techBlockReason(owner, id) {
  const T = TECH_BY[id];
  if (!T) return 'Ricerca sconosciuta.';
  if (S.tech[owner][id]) return 'Già completata.';
  if (researching(owner, id)) return 'In corso.';
  if (!tierAvail(owner, T.tier)) return `Servono ${TIER_GATE} ricerche di livello ${TIERS[T.tier - 2]} (${tierDone(owner, T.tier - 1)}/${TIER_GATE}).`;
  const miss = T.req.filter(r => !S.tech[owner][r]);
  if (miss.length) return `Serve ${miss.map(r => TECH_BY[r].name).join(', ')}.`;
  return null;
}
export function techAvail(owner, id) { return techBlockReason(owner, id) === null; }
export function startResearch(owner, lab, id) {
  const T = TECH_BY[id];
  if (!lab || lab.dead || lab.type !== 'lab' || lab.owner !== owner || lab.built < 1 || lab.rs) return false;
  if (!techAvail(owner, id) || S.res[owner] < T.cost) return false;
  S.res[owner] -= T.cost;
  lab.rs = { id, t: 0, total: T.time * (owner === E ? DIFF[S.diff].rs : 1) };
  return true;
}
