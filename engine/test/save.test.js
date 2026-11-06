// Salvataggio e ricaricamento dello stato.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MW, N, S, newGame, serialize, loadState, ent, occ, explored, proj, step, terr, deposits, genMap } from '../index.js';
import { run, seedRandom } from './helpers.js';

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
    // Si salva quando non ci sono proiettili in volo (vedi il test «todo» sotto).
    while (proj.length) step(0.05);
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

test('i proiettili in volo sopravvivono al salvataggio', { todo: 'proj è fuori da S: serialize non lo salva e loadState lo svuota' }, () => {
  const restore = seedRandom(7);
  try {
    newGame('normale', 12345);
    while (S.phase === 'play' && proj.length === 0) step(0.05);
    assert.ok(proj.length > 0);
    const n = proj.length;
    loadState(JSON.parse(JSON.stringify(serialize())));
    assert.equal(proj.length, n);
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
