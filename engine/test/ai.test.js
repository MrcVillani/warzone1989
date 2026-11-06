// IA bloccata da un edificio che i genieri non raggiungono (era un controllo instabile di `npm run e2e`, ora corretto).
//
// Sul seme 81 il giacimento nemico (46,42) ha sotto di sé la casella (46,43): percorribile, ma chiusa da rocce
// su tre lati e dal giacimento sul quarto, quindi irraggiungibile. I genieri dell'IA arrivano da sud: `adjTile`
// (sim.js) sceglieva per loro la casella adiacente più vicina, cioè proprio (46,43); il percorso si fermava a
// (45,44), dopo 6 tentativi il geniere tornava fermo e `aiTick` (ai.js) lo rimandava sulla stessa pompa incompiuta,
// all'infinito. Finché esisteva un edificio incompiuto l'IA non pianificava altro: niente fabbrica, niente mezzi,
// nessuna ondata. Succedeva su circa il 2% dei semi (81, 200, 215, 231, 269, 278, 286 tra 1 e 300).
//
// Correzione: `adjTile` sceglie solo caselle adiacenti raggiungibili (reachMap/reachableAdj di path.js) e il geniere
// rinuncia subito se non ce ne sono; l'IA sceglie solo giacimenti e posti raggiungibili e smonta (`demolish`) un
// suo edificio incompiuto se nessun geniere lo raggiunge o se resta fermo per AI_STALL secondi; i giacimenti di
// pompe smontate finiscono in S.ai.skip e non vengono più scelti.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MW, P, E, B1, ROCK, STRUCTS, S, newGame, placeStruct, cmdBuild, passable, ftile, terr, occ, explored, deposits,
  reachMap, serialize, loadState, aiTick, AI_STALL,
} from '../index.js';
import { units, structs, run, runPinned, seedRandom, recordEvents } from './helpers.js';

const SEED = 81, DEP = { x: 46, y: 42 }, POCKET = { x: 46, y: 43 }, SOUTH = { x: 45, y: 44 };

// Caselle raggiungibili da (sx, sy) con le stesse regole di findPath: 8 direzioni, senza tagliare gli angoli.
function reachable(sx, sy) {
  const seen = new Uint8Array(terr.length), q = [[sx, sy]];
  seen[sx + sy * MW] = 1;
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!passable(nx, ny, false)) continue;
      if (dx && dy && (!passable(x + dx, y, false) || !passable(x, y + dy, false))) continue;
      if (!seen[nx + ny * MW]) { seen[nx + ny * MW] = 1; q.push([nx, ny]); }
    }
  }
  return seen;
}

// Lascia in campo solo un geniere del lato indicato (di base il nemico), nella casella indicata, e spegne l'IA.
function loneBuilder(tx, ty, owner = E) {
  const b = units(owner, u => u.builder)[0];
  for (const e of S.ents) if (e.kind === 'unit' && e !== b) e.dead = true;
  S.timers.ai = 1e9;
  b.x = b.gx = (tx + 0.5) * 32; b.y = b.gy = (ty + 0.5) * 32;
  return b;
}

test('seme 81: accanto al giacimento (46,42) c’è una casella percorribile ma irraggiungibile', () => {
  newGame('normale', SEED);
  const s = placeStruct(E, 'pump', DEP.x, DEP.y);
  assert.ok(s, 'pompa non piazzabile sul giacimento');
  assert.ok(passable(POCKET.x, POCKET.y, false), 'la casella (46,43) non è percorribile');
  const R = reachable(SOUTH.x, SOUTH.y);
  assert.equal(R[POCKET.x + POCKET.y * MW], 0, '(46,43) raggiungibile da sud: la mappa è cambiata, il test va rivisto');
  assert.equal(R[DEP.x - 1 + DEP.y * MW], 1, 'la casella (45,42), a ovest del giacimento, deve essere raggiungibile');
  // Da nord il geniere ci arriva e la costruisce: la pompa in sé si può fare.
  const b = loneBuilder(46, 39);
  cmdBuild([b], s);
  run(40);
  assert.equal(s.built, 1, 'da nord la pompa non viene costruita');
});

test('un geniere che arriva dal lato della casella isolata costruisce comunque la pompa', () => {
  const restore = seedRandom(1);
  try {
    newGame('normale', SEED);
    const s = placeStruct(E, 'pump', DEP.x, DEP.y);
    const b = loneBuilder(SOUTH.x, SOUTH.y);
    cmdBuild([b], s);
    run(40);
    assert.equal(s.built, 1, `pompa non costruita: geniere fermo a ${ftile(b.x)},${ftile(b.y)} con ordine «${b.order.t}»`);
  } finally { restore(); }
});

test('con il giocatore fermo l’IA costruisce una fabbrica entro 150 s anche sul seme 81', () => {
  // Sui semi 1–60 la prima fabbrica dell'IA è piazzata al più tardi a 93 s.
  const restore = seedRandom(1);
  try {
    newGame('normale', SEED);
    run(150);
    const stuck = structs(E).filter(s => s.built < 1).map(s => `${s.type} (${s.tx},${s.ty}) al ${Math.round(s.built * 100)}%`);
    assert.ok(structs(E, 'factory').length >= 1,
      `nessuna fabbrica a ${Math.round(S.time)} s con ${Math.round(S.res[E])} di gasolio; incompiuti: ${stuck.join(', ') || 'nessuno'}`);
  } finally { restore(); }
});

test('seme 81: reachMap del motore coincide con la visita in ampiezza del test', () => {
  newGame('normale', SEED);
  placeStruct(E, 'pump', DEP.x, DEP.y);
  const mine = reachable(SOUTH.x, SOUTH.y), R = reachMap([[SOUTH.x, SOUTH.y]], false);
  for (let i = 0; i < mine.length; i++)
    assert.equal(R[i] > 0, mine[i] === 1, `casella ${i % MW},${(i / MW) | 0}: reachMap ${R[i]}, visita ${mine[i]}`);
  assert.equal(R[POCKET.x + POCKET.y * MW], 0);
});

test('un geniere del giocatore che arriva dal lato della casella isolata costruisce la pompa', () => {
  const restore = seedRandom(1);
  try {
    newGame('normale', SEED);
    explored[DEP.x + DEP.y * MW] = 1;
    const s = placeStruct(P, 'pump', DEP.x, DEP.y);
    assert.ok(s, 'pompa del giocatore non piazzabile sul giacimento');
    const b = loneBuilder(SOUTH.x, SOUTH.y, P);
    cmdBuild([b], s);
    run(40);
    assert.equal(s.built, 1, `pompa non costruita: geniere a ${ftile(b.x)},${ftile(b.y)} con ordine «${b.order.t}»`);
    assert.notDeepEqual([ftile(b.x), ftile(b.y)], [POCKET.x, POCKET.y]);
  } finally { restore(); }
});

test('un geniere chiuso fuori da ogni lato dell’edificio rinuncia subito invece di riprovare', () => {
  newGame('normale', SEED);
  const s = placeStruct(E, 'pump', DEP.x, DEP.y);
  for (let y = DEP.y - 1; y <= DEP.y + 1; y++) for (let x = DEP.x - 1; x <= DEP.x + 1; x++)
    if (x !== DEP.x || y !== DEP.y) terr[x + y * MW] = ROCK;
  const b = loneBuilder(SOUTH.x, SOUTH.y);
  cmdBuild([b], s);
  run(0.5);
  assert.equal(b.order.t, 'idle', 'il geniere insiste su un edificio che non può raggiungere');
  assert.equal(s.built, 0);
});

// Pompa nemica incompiuta su un giacimento circondato di roccia: nessun geniere la può raggiungere.
function enclosedEnemyPump() {
  newGame('normale', 12345);
  const d = deposits.filter(d => !occ[d.x + d.y * MW]).sort((a, c) => Math.hypot(a.x - B1.x, a.y - B1.y) - Math.hypot(c.x - B1.x, c.y - B1.y))[0];
  const s = placeStruct(E, 'pump', d.x, d.y);
  for (let y = d.y - 1; y <= d.y + 1; y++) for (let x = d.x - 1; x <= d.x + 1; x++)
    if (x !== d.x || y !== d.y) { terr[x + y * MW] = ROCK; assert.equal(occ[x + y * MW], 0, 'accanto al giacimento c’è un edificio'); }
  for (const u of units(E)) assert.ok(Math.hypot(ftile(u.x) - d.x, ftile(u.y) - d.y) > 1.5, 'un mezzo nemico è accanto al giacimento');
  return { s, k: d.x + d.y * MW };
}

test('l’IA smonta una sua pompa incompiuta che nessun geniere raggiunge, con rimborso e senza avvisi', () => {
  const restore = seedRandom(1);
  try {
    const { s, k } = enclosedEnemyPump();
    const ev = recordEvents(), lost = [...S.stats.lost];
    // Un solo giro dell'IA, senza gasolio: lo smontaggio rimborsa la pompa, e quel che si spende va in nuovi edifici.
    S.res[E] = 0;
    const old = new Set(S.ents.map(e => e.id));
    aiTick();
    const spent = structs(E).filter(e => !old.has(e.id)).reduce((a, e) => a + STRUCTS[e.type].cost, 0);
    assert.equal(S.res[E] + spent, STRUCTS.pump.cost, 'rimborso della pompa smontata');
    assert.equal(s.dead, true, 'la pompa irraggiungibile resta in piedi');
    assert.equal(occ[k], 0);
    assert.ok(S.ai.skip.includes(k), 'il giacimento non è stato scartato');
    assert.deepEqual(S.stats.lost, lost);
    run(120);
    ev.stop();
    assert.ok(!ev.of('toast').some(t => /Pompa/.test(t.text)), 'avviso per lo smontaggio');
    assert.equal(occ[k], 0, 'l’IA è tornata sul giacimento scartato');
    assert.ok(structs(E, 'factory').length >= 1, 'dopo lo smontaggio l’IA non ha costruito una fabbrica');
  } finally { restore(); }
});

test('l’IA smonta una sua pompa incompiuta ferma da AI_STALL secondi, non prima', () => {
  const restore = seedRandom(1);
  try {
    newGame('normale', 12345);
    const ev = recordEvents(), lost = [...S.stats.lost];
    const pin = runPinned(1, E); // i genieri nemici ricevono gli ordini ma non si muovono
    const s = structs(E).find(e => e.built < 1);
    assert.ok(s && s.type === 'pump', 'l’IA non ha piazzato la prima pompa');
    const t0 = S.time, k = s.tx + s.ty * MW;
    runPinned(AI_STALL - 2, E, pin);
    assert.ok(!s.dead, `pompa smontata dopo soli ${Math.round(S.time - t0)} s`);
    for (const f of ['aiA', 'aiB', 'aiC', 'aiD', 'aiT']) assert.equal(typeof s[f], 'number', `campo ${f}`);
    runPinned(5, E, pin);
    ev.stop();
    assert.equal(s.dead, true, `pompa ancora in piedi dopo ${Math.round(S.time - t0)} s senza progressi`);
    assert.equal(occ[k], 0);
    assert.deepEqual(S.ai.skip, [k]);
    assert.deepEqual(S.stats.lost, lost);
    assert.deepEqual(ev.of('toast'), []);
    assert.deepEqual(ev.of('fx'), []);
    assert.ok(structs(E).some(e => e.built < 1 && e !== s), 'dopo lo smontaggio l’IA non passa a un altro edificio');
  } finally { restore(); }
});

test('l’IA non costruisce sui giacimenti in S.ai.skip, e l’elenco sopravvive al salvataggio', () => {
  const restore = seedRandom(1);
  try {
    newGame('normale', 12345);
    const near = deposits.filter(d => !occ[d.x + d.y * MW]).sort((a, c) => Math.hypot(a.x - B1.x, a.y - B1.y) - Math.hypot(c.x - B1.x, c.y - B1.y));
    const k = near[0].x + near[0].y * MW;
    S.ai.skip.push(k);
    run(5);
    assert.equal(occ[k], 0, 'l’IA costruisce su un giacimento scartato');
    assert.ok(structs(E, 'pump').length >= 1, 'l’IA non costruisce nessuna pompa');
    loadState(JSON.parse(JSON.stringify(serialize())));
    assert.deepEqual(S.ai.skip, [k]);
    run(60);
    assert.equal(occ[k], 0, 'dopo il caricamento l’IA costruisce su un giacimento scartato');
  } finally { restore(); }
});

test('un salvataggio senza S.ai.skip (vecchio formato) si carica e l’IA prosegue', () => {
  newGame('normale', 12345);
  run(10);
  const st = JSON.parse(JSON.stringify(serialize()));
  delete st.ai.skip;
  for (const e of st.ents) for (const f of ['aiA', 'aiB', 'aiC', 'aiD', 'aiT']) delete e[f];
  loadState(st);
  assert.doesNotThrow(() => run(60));
  assert.ok(Array.isArray(S.ai.skip));
  assert.ok(structs(E, 'pump').length >= 1);
});

// Semi su cui l'IA restava bloccata prima della correzione: con il giocatore fermo deve attaccare entro 15 minuti.
for (const seed of [81, 200, 269, 278]) {
  test(`seme ${seed}: con il giocatore fermo l’IA lancia almeno un’ondata entro 15 minuti`, () => {
    for (const rs of [1, 2]) {
      const restore = seedRandom(rs);
      try {
        newGame('normale', seed);
        run(900, 0.05, () => S.ai.wave >= 1);
        const stuck = structs(E).filter(s => s.built < 1).map(s => `${s.type} (${s.tx},${s.ty})`);
        assert.ok(S.ai.wave >= 1, `random ${rs}: nessuna ondata a ${Math.round(S.time)} s (fase ${S.phase}); `
          + `fabbriche ${structs(E, 'factory').length}, incompiuti: ${stuck.join(', ') || 'nessuno'}`);
      } finally { restore(); }
    }
  });
}
