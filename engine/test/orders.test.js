// Ordini e azioni: piazzamento, produzione, annullamento, ricerca, comandi ai mezzi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MW, MH, TILE, P, E, WATER, ROCK, FOREST, B0, B1, STRUCTS, TECH_BY, BUILDER, UNIT_CAP, DIFF,
  S, newGame, terr, occ, deposits, depIdx, explored, ent, makeStruct, makeUnit, dStats,
  canPlace, placeStruct, enqueue, cancelQueued, unitCount, techAvail, startResearch, researching,
  cmdMove, cmdAttack, cmdBuild, cmdStop,
} from '../index.js';
import { units, playerBuilder, nearestExploredDeposit, findSpot, recordEvents, run, tileOf } from './helpers.js';

const builtFactory = owner => {
  const [x, y] = owner === P ? findSpot(P, 'factory', B0.x + 4, B0.y + 2) : findSpot(E, 'factory', B1.x - 6, B1.y - 3);
  return makeStruct('factory', owner, x, y, true);
};
const builtLab = owner => {
  const [x, y] = owner === P ? findSpot(P, 'lab', B0.x - 1, B0.y + 4) : findSpot(E, 'lab', B1.x, B1.y - 5);
  return makeStruct('lab', owner, x, y, true);
};

test('placeStruct: la pompa su un giacimento esplorato scala il gasolio', () => {
  newGame('normale', 12345);
  const d = nearestExploredDeposit(playerBuilder());
  const before = S.res[P];
  const s = placeStruct(P, 'pump', d.x, d.y);
  assert.ok(s);
  assert.equal(S.res[P], before - STRUCTS.pump.cost);
  assert.equal(s.built, 0);
  assert.ok(s.hp > 0 && s.hp < s.max);
  assert.equal(occ[d.x + d.y * MW], s.id);
  assert.equal(ent(s.id), s);
  assert.equal(placeStruct(P, 'pump', d.x, d.y), null, 'giacimento già occupato');
  assert.equal(S.res[P], before - STRUCTS.pump.cost);
});

test('placeStruct: la pompa va solo su un giacimento, e il giocatore solo dove ha esplorato', () => {
  newGame('normale', 12345);
  const before = S.res[P];
  const [fx, fy] = findSpot(P, 'factory', B0.x + 3, B0.y + 3); // casella libera esplorata, non giacimento
  assert.equal(depIdx[fx + fy * MW], -1);
  assert.equal(placeStruct(P, 'pump', fx, fy), null);
  const hidden = deposits.find(d => !explored[d.x + d.y * MW]);
  assert.ok(hidden);
  assert.equal(placeStruct(P, 'pump', hidden.x, hidden.y), null, 'giacimento non esplorato');
  assert.equal(placeStruct(P, 'pump', -1, 0), null);
  assert.equal(placeStruct(P, 'pump', MW, MH), null);
  assert.equal(S.res[P], before);
  // L'IA non ha la nebbia.
  assert.ok(canPlace(E, 'pump', hidden.x, hidden.y));
});

test('placeStruct: rifiuta acqua, roccia, foresta, edifici, giacimenti, zone inesplorate e bordi', () => {
  newGame('normale', 12345);
  const before = S.res[P];
  // Comando sopra un altro edificio.
  assert.equal(placeStruct(P, 'factory', B0.x - 1, B0.y - 1), null);
  // Fabbrica sopra un giacimento.
  const d = nearestExploredDeposit(playerBuilder());
  assert.equal(placeStruct(P, 'factory', d.x, d.y), null);
  // Fuori mappa.
  assert.equal(placeStruct(P, 'factory', MW - 1, MH - 1), null);
  assert.equal(placeStruct(P, 'factory', -1, 5), null);
  // Zona non esplorata, pur se edificabile per il nemico.
  const [ex, ey] = findSpot(E, 'factory', B1.x - 6, B1.y - 3);
  assert.equal(explored[ex + ey * MW], 0);
  assert.equal(placeStruct(P, 'factory', ex, ey), null);
  // Terreno non edificabile: lo si rende esplorato per isolare la regola del terreno.
  for (const v of [WATER, ROCK, FOREST]) {
    const i = terr.findIndex((t, k) => t === v && !occ[k]);
    if (i < 0) continue;
    explored[i] = 1;
    assert.equal(canPlace(P, 'tower', i % MW, (i / MW) | 0), false, `terreno ${v}`);
  }
  assert.equal(S.res[P], before);
});

test('placeStruct: rifiuta se il gasolio non basta', () => {
  newGame('normale', 12345);
  const [x, y] = findSpot(P, 'factory', B0.x + 4, B0.y + 2);
  S.res[P] = STRUCTS.factory.cost - 1;
  assert.equal(placeStruct(P, 'factory', x, y), null);
  assert.equal(S.res[P], STRUCTS.factory.cost - 1);
  S.res[P] = STRUCTS.factory.cost;
  const s = placeStruct(P, 'factory', x, y);
  assert.ok(s);
  assert.equal(S.res[P], 0);
  assert.equal(s.type, 'factory');
  assert.equal(s.owner, P);
});

test('placeStruct: l’officina richiede la ricerca «Officina da campo»', () => {
  newGame('normale', 12345);
  const [x, y] = findSpot(P, 'depot', B0.x + 4, B0.y + 2);
  assert.equal(placeStruct(P, 'depot', x, y), null);
  assert.equal(S.res[P], 600);
  S.tech[P].stRP = true;
  assert.ok(placeStruct(P, 'depot', x, y));
  assert.equal(S.res[P], 600 - STRUCTS.depot.cost);
});

test('enqueue: il comando addestra genieri, al massimo 5 in coda', () => {
  newGame('normale', 12345);
  const hq = S.ents.find(e => e.type === 'hq' && e.owner === P);
  S.res[P] = 10000;
  for (let i = 0; i < 5; i++) assert.equal(enqueue(hq, null, P), true);
  assert.equal(hq.queue.length, 5);
  assert.equal(S.res[P], 10000 - 5 * BUILDER.cost);
  assert.equal(enqueue(hq, null, P), false, 'la sesta in coda va rifiutata');
  assert.equal(hq.queue.length, 5);
  assert.equal(S.res[P], 10000 - 5 * BUILDER.cost);
  assert.equal(hq.queue[0].total, BUILDER.time);
  assert.equal(hq.queue[0].d, null);
});

test('enqueue: la fabbrica paga il costo del progetto e rifiuta senza fondi', () => {
  newGame('normale', 12345);
  const f = builtFactory(P);
  const d = { c: 'L', p: 'W', w: 'MG' }, st = dStats(d, P);
  S.res[P] = st.cost * 2 - 1;
  assert.equal(enqueue(f, d, P), true);
  assert.equal(S.res[P], st.cost - 1);
  assert.equal(enqueue(f, d, P), false);
  assert.equal(S.res[P], st.cost - 1);
  assert.deepEqual(f.queue[0], { d, t: 0, total: st.time, cost: st.cost });
  assert.notEqual(f.queue[0].d, d, 'la coda tiene una copia del progetto');
});

test('enqueue: un edificio non finito non produce', () => {
  newGame('normale', 12345);
  const [x, y] = findSpot(P, 'factory', B0.x + 4, B0.y + 2);
  const f = placeStruct(P, 'factory', x, y);
  const before = S.res[P];
  assert.equal(enqueue(f, { c: 'L', p: 'W', w: 'MG' }, P), false);
  assert.equal(S.res[P], before);
});

test('enqueue: rispetta il limite di mezzi, contando anche le code', () => {
  newGame('normale', 12345);
  const hq = S.ents.find(e => e.type === 'hq' && e.owner === P);
  S.res[P] = 100000;
  const start = unitCount(P);
  assert.equal(start, 4);
  enqueue(hq, null, P);
  assert.equal(unitCount(P), 5, 'la coda conta nel limite');
  while (unitCount(P) < UNIT_CAP) makeUnit(P, null, (B0.x + 0.5) * TILE, (B0.y + 4.5) * TILE);
  const ev = recordEvents();
  const before = S.res[P];
  assert.equal(enqueue(hq, null, P), false);
  ev.stop();
  assert.equal(S.res[P], before);
  const toasts = ev.of('toast');
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].kind, 'warn');
  assert.match(toasts[0].text, new RegExp(String(UNIT_CAP)));
});

test('cancelQueued rimborsa e toglie dalla coda', () => {
  newGame('normale', 12345);
  const f = builtFactory(P);
  S.res[P] = 1000;
  const a = { c: 'L', p: 'W', w: 'MG' };
  enqueue(f, a, P); enqueue(f, null, P);
  const after = S.res[P];
  assert.equal(cancelQueued(f, 0), true);
  assert.equal(S.res[P], after + dStats(a, P).cost);
  assert.equal(f.queue.length, 1);
  assert.equal(f.queue[0].d, null);
  assert.equal(cancelQueued(f, 5), false, 'indice inesistente');
  assert.equal(cancelQueued(null, 0), false);
  assert.equal(cancelQueued(f, 0), true);
  assert.equal(S.res[P], 1000, 'tutto rimborsato');
  assert.equal(f.queue.length, 0);
});

test('startResearch rispetta requisiti, costo e ricerche già in corso', () => {
  newGame('normale', 12345);
  const lab = builtLab(P), lab2 = builtLab(P);
  assert.equal(techAvail(P, 'twCN'), false, 'twCN richiede wCN');
  assert.equal(startResearch(P, lab, 'twCN'), false);
  assert.equal(S.res[P], 600);

  S.res[P] = TECH_BY.wCN.cost - 1;
  assert.equal(startResearch(P, lab, 'wCN'), false, 'fondi insufficienti');
  assert.equal(lab.rs, null);
  S.res[P] = 600;
  assert.equal(startResearch(P, lab, 'wCN'), true);
  assert.equal(S.res[P], 600 - TECH_BY.wCN.cost);
  assert.deepEqual(lab.rs, { id: 'wCN', t: 0, total: TECH_BY.wCN.time });
  assert.equal(researching(P, 'wCN'), true);
  assert.equal(startResearch(P, lab2, 'wCN'), false, 'già in corso in un altro laboratorio');
  assert.equal(techAvail(P, 'twCN'), false, 'requisito non ancora completato');

  S.tech[P].wCN = true; lab.rs = null;
  assert.equal(techAvail(P, 'wCN'), false, 'già completata');
  assert.equal(startResearch(P, lab2, 'wCN'), false);
  assert.equal(techAvail(P, 'twCN'), true);
  assert.equal(startResearch(P, lab2, 'twCN'), true);
});

test('startResearch: il nemico ricerca più in fretta salendo di difficoltà', () => {
  for (const diff of Object.keys(DIFF)) {
    newGame(diff, 12345);
    const lab = builtLab(E);
    assert.equal(startResearch(E, lab, 'chM'), true);
    assert.ok(Math.abs(lab.rs.total - TECH_BY.chM.time * DIFF[diff].rs) < 1e-9, diff);
  }
});

test('cmdBuild, cmdAttack e cmdStop si applicano solo ai mezzi giusti', () => {
  newGame('normale', 12345);
  const [b] = units(P, u => u.builder), [m] = units(P, u => !u.builder);
  const hqE = S.ents.find(e => e.type === 'hq' && e.owner === E);
  const hqP = S.ents.find(e => e.type === 'hq' && e.owner === P);
  cmdBuild([b, m], hqP);
  assert.deepEqual(b.order, { t: 'build', id: hqP.id });
  assert.equal(m.order.t, 'idle', 'un mezzo armato non costruisce');
  cmdAttack([b, m], hqE);
  assert.deepEqual(m.order, { t: 'attack', id: hqE.id });
  assert.equal(m.tgt, hqE.id);
  assert.equal(b.order.t, 'build', 'un geniere non attacca');
  cmdStop([b, m]);
  assert.equal(b.order.t, 'idle');
  assert.equal(m.order.t, 'idle');
  assert.equal(m.path, null);
});

test('cmdMove porta un gruppo vicino alla meta su caselle diverse', () => {
  newGame('normale', 12345);
  const group = units(P);
  const tx = B0.x + 6, ty = B0.y + 1;
  const wx = (tx + 0.5) * TILE, wy = (ty + 0.5) * TILE;
  cmdMove(group, wx, wy, false);
  const goals = new Set(group.map(u => u.order.x + ',' + u.order.y));
  assert.equal(goals.size, group.length, 'ogni mezzo ha la sua casella');
  for (const u of group) assert.equal(u.order.t, 'move');
  run(25, 0.05, () => group.every(u => u.order.t === 'idle'));
  for (const u of group) {
    assert.equal(u.order.t, 'idle', 'il mezzo non ha finito il movimento');
    const [x, y] = tileOf(u);
    assert.ok(Math.hypot(x - tx, y - ty) <= 3, `mezzo arrivato a ${x},${y}, meta ${tx},${ty}`);
  }
});

test('cmdMove con attacco in movimento: i genieri si muovono e basta', () => {
  newGame('normale', 12345);
  const [b] = units(P, u => u.builder), [m] = units(P, u => !u.builder);
  cmdMove([b, m], (B0.x + 6.5) * TILE, (B0.y + 1.5) * TILE, true);
  assert.equal(b.order.t, 'move');
  assert.equal(m.order.t, 'amove');
});
