// Salvataggio e ricaricamento dello stato.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MW, N, E, S, newGame, serialize, loadState, ent, occ, explored, proj, step, terr, deposits, genMap } from '../index.js';
import { run, runPinned, seedRandom } from './helpers.js';

const roundTrip = () => JSON.parse(JSON.stringify(serialize()));

test('serialize produce JSON valido con tutti i campi dello stato', () => {
  newGame('normale', 12345);
  run(30);
  const json = JSON.stringify(serialize());
  const st = JSON.parse(json);
  for (const k of ['seed', 'diff', 'time', 'ents', 'res', 'tech', 'designs', 'ai', 'stats', 'timers', 'phase', 'explored'])
    assert.ok(k in st, `manca ${k}`);
  assert.equal(st.explored.length, N);
  assert.ok(st.explored.some(v => v === 1));
  assert.equal(st.ents.length, S.ents.length);
  assert.notEqual(serialize(), S, 'serialize non restituisce lo stato vivo');
});

test('loadState ricrea la stessa partita: entità, risorse, tempo, mappa e occupazione', () => {
  const restore = seedRandom(11);
  try {
    newGame('difficile', 3);
    run(200);
    const saved = roundTrip();
    const before = { time: S.time, res: [...S.res], ids: S.ents.map(e => e.id), tech: structuredClone(S.tech), occ: Int32Array.from(occ), explored: Uint8Array.from(explored) };

    newGame('facile', 1); // un'altra partita in mezzo, per essere sicuri che lo stato venga sostituito
    loadState(saved);
    assert.equal(S.time, before.time);
    assert.deepEqual(S.res, before.res);
    assert.deepEqual(S.ents.map(e => e.id), before.ids);
    assert.deepEqual(S.tech, before.tech);
    assert.equal(S.diff, 'difficile');
    assert.equal(S.seed, 3);
    assert.deepEqual(terr, genMap(3).t);
    assert.deepEqual(deposits, genMap(3).deps);
    assert.deepEqual(occ, before.occ);
    assert.deepEqual(explored, before.explored);
    for (const e of S.ents) assert.equal(ent(e.id), e);
    assert.deepEqual(roundTrip(), saved, 'salvare subito dopo il caricamento dà lo stesso stato');
  } finally { restore(); }
});

test('dopo il caricamento la simulazione continua senza errori fino alla fine', () => {
  newGame('normale', 12345);
  run(120);
  const saved = roundTrip(), t0 = saved.time; // loadState adotta l'oggetto: saved diventa S
  loadState(saved);
  const id = S.nextId;
  assert.doesNotThrow(() => run(800));
  assert.ok(S.time > t0);
  assert.equal(S.phase, 'lost');
  assert.ok(S.nextId >= id, 'i nuovi id continuano dopo quelli salvati');
});

test('da uno stato salvato la simulazione procede come se non si fosse mai fermata', () => {
  // Con Math.random a seme, la partita originale e quella ricaricata devono restare identiche.
  for (const at of [45, 250]) {
    let restore = seedRandom(5);
    newGame('normale', 12345);
    run(at);
    restore();
    const saved = JSON.stringify(serialize());
    restore = seedRandom(77);
    run(30);
    restore();
    const a = JSON.stringify(serialize());
    loadState(JSON.parse(saved));
    restore = seedRandom(77);
    run(30);
    restore();
    const b = JSON.stringify(serialize());
    assert.ok(a === b, `stato diverso dopo 30 s dal caricamento (salvataggio a ${at} s)`);
  }
});

test('i proiettili in volo sopravvivono al salvataggio', () => {
  const restore = seedRandom(7);
  try {
    newGame('normale', 12345);
    while (S.phase === 'play' && proj.length === 0) step(0.05);
    assert.ok(proj.length > 0);
    const before = proj.map(p => ({ ...p }));
    const saved = JSON.parse(JSON.stringify(serialize()));
    assert.ok(Array.isArray(saved.proj), 'serialize include il campo proj');
    assert.deepEqual(saved.proj, before);
    assert.ok(!('proj' in S), 'lo stato vivo non contiene proj');

    newGame('facile', 1); // svuota proj
    assert.equal(proj.length, 0);
    loadState(saved);
    assert.deepEqual(proj, before);
    assert.ok(!('proj' in S), 'dopo il caricamento S non contiene il campo proj');
    // I proiettili ricaricati sono copie: modificarli non tocca il salvataggio.
    proj[0].x += 1;
    assert.equal(saved.proj[0].x, before[0].x);
    assert.doesNotThrow(() => run(5));
  } finally { restore(); }
});

test('salvare con proiettili in volo non cambia il seguito della partita', () => {
  let restore = seedRandom(9);
  newGame('normale', 12345);
  while (S.phase === 'play' && proj.length === 0) step(0.05);
  restore();
  assert.ok(proj.length > 0);
  const saved = JSON.stringify(serialize());
  restore = seedRandom(77);
  run(20);
  restore();
  const a = JSON.stringify(serialize());
  loadState(JSON.parse(saved));
  restore = seedRandom(77);
  run(20);
  restore();
  assert.ok(a === JSON.stringify(serialize()), 'stato diverso dopo 20 s dal caricamento');
});

test('loadState accetta un salvataggio senza proj (vecchio formato)', () => {
  const restore = seedRandom(7);
  try {
    newGame('normale', 12345);
    while (S.phase === 'play' && proj.length === 0) step(0.05);
    const st = roundTrip();
    delete st.proj;
    assert.doesNotThrow(() => loadState(st));
    assert.equal(proj.length, 0, 'senza proj nel salvataggio non restano proiettili della partita precedente');
    assert.ok(!('proj' in S));
    assert.doesNotThrow(() => run(5));
    assert.ok(Array.isArray(serialize().proj));
  } finally { restore(); }
});

test('loadState accetta un salvataggio senza timers e lastWarn', () => {
  newGame('normale', 12345);
  const st = roundTrip();
  delete st.timers; delete st.lastWarn;
  loadState(st);
  assert.deepEqual(S.timers, { fog: 0, ai: 0, end: 0 });
  assert.equal(S.lastWarn, -99);
  assert.doesNotThrow(() => run(5));
  assert.ok(occ[S.ents.find(e => e.kind === 'struct').tx + S.ents.find(e => e.kind === 'struct').ty * MW] > 0);
});

test('un salvataggio con un edificio incompiuto dell’IA (campi ai*) si ricarica e prosegue uguale', () => {
  // Genieri nemici inchiodati: la prima pompa dell'IA resta ferma e viene smontata dopo AI_STALL secondi.
  let restore = seedRandom(3);
  newGame('normale', 12345);
  const pin = runPinned(25, E);
  restore();
  const s = S.ents.find(e => e.owner === E && e.kind === 'struct' && e.built < 1);
  assert.ok(s, 'nessun edificio incompiuto dell’IA');
  const saved = JSON.stringify(serialize());
  const st = JSON.parse(saved).ents.find(e => e.id === s.id);
  for (const f of ['aiA', 'aiB', 'aiC', 'aiD', 'aiT']) assert.equal(typeof st[f], 'number', `campo ${f} non salvato`);

  restore = seedRandom(77);
  runPinned(40, E, new Map(pin));
  restore();
  const a = JSON.stringify(serialize());
  assert.ok(ent(s.id) === undefined && !occ[s.tx + s.ty * MW], 'senza ricaricare la pompa ferma non è stata smontata');

  loadState(JSON.parse(saved));
  const s2 = ent(s.id);
  assert.ok(s2 && s2.built < 1 && s2.aiT === st.aiT, 'pompa incompiuta o campi ai* persi nel caricamento');
  restore = seedRandom(77);
  runPinned(40, E, new Map(pin));
  restore();
  assert.ok(a === JSON.stringify(serialize()), 'stato diverso dopo 40 s dal caricamento');
  assert.equal(s2.dead, true, 'dopo il caricamento la pompa ferma non viene smontata');
  assert.ok(S.ai.skip.includes(s.tx + s.ty * MW));
  assert.doesNotThrow(() => run(60));
});
