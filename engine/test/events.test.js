// Eventi per suoni e animazioni (fase A del piano 02): campi nuovi di fx flash e boom, eventi unit, built, placed,
// research. Le regole non cambiano: un ascoltatore di eventi non deve alterare la partita.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TILE, P, E, B0, STRUCTS, BUILDER, TECH_BY, WEAPONS,
  S, newGame, makeUnit, makeStruct, placeStruct, cmdBuild, enqueue, startResearch, kill, explodeAt,
  nearestFree, serialize, step,
} from '../index.js';
import { units, structs, playerBuilder, nearestExploredDeposit, findSpot, recordEvents, run, seedRandom } from './helpers.js';

const at = (tx, ty) => { const f = nearestFree(tx, ty, false); return [(f[0] + 0.5) * TILE, (f[1] + 0.5) * TILE]; };

// Mette un mezzo del giocatore con l'arma `w` a 4 caselle da un bersaglio nemico molto resistente, in mezzo alla mappa.
function duel(w) {
  newGame('normale', 12345);
  const [sx, sy] = at(24, 24);
  const shooter = makeUnit(P, { c: 'L', p: 'W', w }, sx, sy);
  const target = makeUnit(E, { c: 'H', p: 'T', w: 'MG' }, sx + 4 * TILE, sy);
  target.hp = target.max = 1e6;
  return { shooter, target };
}

// Il modulo riparazione non spara: ha il suo test più sotto (fx repair, nessun flash).
for (const w of Object.keys(WEAPONS).filter(k => !WEAPONS[k].heal)) {
  test(`fx flash: un mezzo con ${w} spara con w = '${w}' e owner del tiratore`, () => {
    const restore = seedRandom(7);
    try {
      duel(w);
      const ev = recordEvents();
      run(8, 0.05, () => ev.of('fx').some(f => f.k === 'flash' && f.owner === P));
      ev.stop();
      const mine = ev.of('fx').filter(f => f.k === 'flash' && f.owner === P);
      assert.ok(mine.length > 0, `nessuno sparo del giocatore con ${w}`);
      for (const f of mine) {
        assert.equal(f.w, w);
        assert.ok(Number.isFinite(f.x) && Number.isFinite(f.y) && f.s > 0);
      }
      // Ogni vampa porta sempre arma e tiratore, anche quelle del nemico.
      for (const f of ev.of('fx').filter(f => f.k === 'flash')) {
        assert.ok(f.w in WEAPONS, `arma sconosciuta: ${f.w}`);
        assert.ok(f.owner === P || f.owner === E);
      }
    } finally { restore(); }
  });
}

test('fx flash: la torretta spara con MG, e con CN dopo la ricerca twCN', () => {
  for (const [tech, want] of [[false, 'MG'], [true, 'CN']]) {
    const restore = seedRandom(3);
    try {
      newGame('normale', 12345);
      S.tech[P].twCN = tech;
      const [x, y] = findSpot(P, 'tower', 24, 24);
      const tw = makeStruct('tower', P, x, y, true);
      const target = makeUnit(E, { c: 'H', p: 'T', w: 'MG' }, tw.x + 3.5 * TILE, tw.y);
      target.hp = target.max = 1e6;
      target.order = { t: 'move' }; // resta fermo e non risponde al fuoco (nessun percorso)
      const ev = recordEvents();
      run(6, 0.05, () => ev.of('fx').some(f => f.k === 'flash' && f.owner === P));
      ev.stop();
      const shots = ev.of('fx').filter(f => f.k === 'flash' && f.owner === P);
      assert.ok(shots.length > 0, `la torretta non ha sparato (twCN = ${tech})`);
      for (const f of shots) assert.equal(f.w, want);
    } finally { restore(); }
  }
});

test('fx repair: un mezzo con RP non spara e ripara un alleato danneggiato, con owner del riparatore', () => {
  const restore = seedRandom(7);
  try {
    const { shooter, target } = duel('RP');
    const ally = makeUnit(P, { c: 'L', p: 'W', w: 'RP' }, shooter.x, shooter.y + 2 * TILE); // RP: non attacca il bersaglio
    ally.hp = ally.max / 2;
    const ev = recordEvents();
    run(3);
    ev.stop();
    const fx = ev.of('fx');
    assert.equal(fx.filter(f => f.k === 'flash' && f.w === 'RP').length, 0, 'il riparatore ha sparato');
    const rep = fx.filter(f => f.k === 'repair');
    assert.ok(rep.length > 0, 'nessun fx repair');
    for (const f of rep) {
      assert.equal(f.owner, P);
      assert.ok([f.x1, f.y1, f.x2, f.y2].every(Number.isFinite));
    }
    assert.equal(target.hp, target.max, 'il riparatore non attacca il nemico');
    assert.ok(ally.hp > ally.max / 2, 'l’alleato non è stato riparato');
  } finally { restore(); }
});

test('fx repair: nessun raggio se non c’è nessuno da riparare', () => {
  const restore = seedRandom(7);
  try {
    duel('RP');
    const ev = recordEvents();
    run(3);
    ev.stop();
    assert.equal(ev.of('fx').filter(f => f.k === 'repair' && f.owner === P).length, 0);
  } finally { restore(); }
});

test('fx boom: kind unit per un mezzo distrutto, owner = lato del mezzo', () => {
  newGame('normale', 12345);
  for (const o of [P, E]) {
    const u = units(o, x => !x.builder)[0];
    const ev = recordEvents();
    kill(u, o === P ? E : P);
    ev.stop();
    const booms = ev.of('fx').filter(f => f.k === 'boom');
    assert.equal(booms.length, 1);
    assert.equal(booms[0].kind, 'unit');
    assert.equal(booms[0].owner, o);
    assert.equal(booms[0].x, u.x);
    assert.equal(booms[0].y, u.y);
  }
  // Anche il geniere è un mezzo.
  const b = playerBuilder();
  const ev = recordEvents();
  kill(b, E);
  ev.stop();
  assert.deepEqual(ev.of('fx').filter(f => f.k === 'boom').map(f => [f.kind, f.owner]), [['unit', P]]);
});

test('fx boom: kind struct per un edificio distrutto, owner = lato dell’edificio, più grande per edifici grandi', () => {
  newGame('normale', 12345);
  const [x, y] = findSpot(P, 'pump', B0.x + 4, B0.y + 4);
  const pump = makeStruct('pump', P, x, y, true);
  const ehq = structs(E, 'hq')[0];
  const ev = recordEvents();
  kill(pump, E);
  kill(ehq, P);
  ev.stop();
  const booms = ev.of('fx').filter(f => f.k === 'boom');
  assert.equal(booms.length, 2);
  assert.deepEqual(booms.map(f => [f.kind, f.owner]), [['struct', P], ['struct', E]]);
  assert.ok(booms[1].size > booms[0].size, 'il comando (3x3) esplode più grande della pompa (1x1)');
});

test('fx boom: kind shot per un proiettile esploso, owner = lato del tiratore', () => {
  newGame('normale', 12345);
  const ev = recordEvents();
  explodeAt(30 * TILE, 30 * TILE, 1, 10, E, 0.55);
  ev.stop();
  const [b] = ev.of('fx').filter(f => f.k === 'boom');
  assert.equal(b.kind, 'shot');
  assert.equal(b.owner, E);

  // Lo stesso con un colpo di mortaio vero: le esplosioni del tiro hanno owner del giocatore.
  const restore = seedRandom(11);
  try {
    duel('MO');
    const ev2 = recordEvents();
    run(12, 0.05, () => ev2.of('fx').some(f => f.k === 'boom' && f.kind === 'shot' && f.owner === P));
    ev2.stop();
    assert.ok(ev2.of('fx').some(f => f.k === 'boom' && f.kind === 'shot' && f.owner === P), 'nessuna esplosione di mortaio del giocatore');
    for (const f of ev2.of('fx').filter(f => f.k === 'boom')) assert.ok(['unit', 'struct', 'shot'].includes(f.kind));
  } finally { restore(); }
});

test('evento unit: il comando consegna un geniere e la fabbrica un mezzo, con owner, id e posizione', () => {
  newGame('normale', 12345);
  const hq = structs(P, 'hq')[0];
  const [x, y] = findSpot(P, 'factory', B0.x + 4, B0.y + 2);
  const f = makeStruct('factory', P, x, y, true);
  S.res[P] = 1000;
  const d = { c: 'L', p: 'W', w: 'MG' };
  assert.ok(enqueue(hq, null, P));
  assert.ok(enqueue(f, d, P));
  const ev = recordEvents();
  run(BUILDER.time + 0.5);
  run(20, 0.05, () => ev.of('unit').filter(e => e.owner === P).length >= 2);
  ev.stop();
  const got = ev.of('unit').filter(e => e.owner === P);
  assert.equal(got.length, 2, `eventi unit: ${got.length}`);
  for (const e of got) {
    assert.equal(e.owner, P);
    const u = S.ents.find(z => z.id === e.id);
    assert.ok(u && u.kind === 'unit', 'l’id non è un mezzo');
    assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y));
  }
  const kinds = got.map(e => S.ents.find(z => z.id === e.id).builder).sort();
  assert.deepEqual(kinds, [false, true], 'uno è il geniere, l’altro il mezzo');
  assert.equal(S.stats.made[P], 2);
});

test('evento unit: anche il nemico emette unit per i suoi mezzi', () => {
  const restore = seedRandom(1);
  try {
    newGame('normale', 12345);
    const ev = recordEvents();
    run(120, 0.05, () => ev.of('unit').some(e => e.owner === E));
    ev.stop();
    const en = ev.of('unit').filter(e => e.owner === E);
    assert.ok(en.length > 0, 'l’IA non ha consegnato mezzi in 120 s');
    assert.equal(en.length, S.stats.made[E]);
  } finally { restore(); }
});

test('evento built: non per il comando iniziale, sì per un edificio finito', () => {
  const ev0 = recordEvents();
  newGame('normale', 12345);
  ev0.stop();
  assert.equal(ev0.of('built').length, 0, 'il comando iniziale non deve emettere built');
  assert.equal(ev0.of('placed').length, 0, 'il comando iniziale non deve emettere placed');
  assert.equal(ev0.of('unit').length, 0, 'i mezzi iniziali non devono emettere unit');

  const b = playerBuilder();
  const d = nearestExploredDeposit(b);
  const s = placeStruct(P, 'pump', d.x, d.y);
  cmdBuild([b], s);
  const ev = recordEvents();
  run(40, 0.05, () => s.built >= 1);
  ev.stop();
  assert.equal(s.built, 1);
  const mine = ev.of('built').filter(e => e.owner === P);
  assert.deepEqual(mine, [{ owner: P, id: s.id, type: 'pump' }]);
  // Gli edifici creati già pronti (makeStruct con built = true) non emettono built.
  const ev2 = recordEvents();
  const [x, y] = findSpot(P, 'lab', B0.x - 1, B0.y + 4);
  makeStruct('lab', P, x, y, true);
  ev2.stop();
  assert.equal(ev2.of('built').length, 0);
});

test('evento placed: solo quando il piazzamento riesce', () => {
  newGame('normale', 12345);
  const d = nearestExploredDeposit(playerBuilder());
  const ev = recordEvents();
  const s = placeStruct(P, 'pump', d.x, d.y);
  assert.ok(s);
  assert.deepEqual(ev.of('placed'), [{ owner: P, id: s.id, type: 'pump' }]);

  // Falliscono: stesso posto già occupato, pompa fuori da un giacimento, officina senza ricerca, niente gasolio.
  assert.equal(placeStruct(P, 'pump', d.x, d.y), null);
  const hq = structs(P, 'hq')[0];
  assert.equal(placeStruct(P, 'factory', hq.tx, hq.ty), null);
  const spot = findSpot(P, 'depot', B0.x + 3, B0.y + 3);
  assert.equal(placeStruct(P, 'depot', spot[0], spot[1]), null);
  const res = S.res[P];
  S.res[P] = STRUCTS.factory.cost - 1;
  const fs = findSpot(P, 'factory', B0.x + 4, B0.y + 2);
  assert.equal(placeStruct(P, 'factory', fs[0], fs[1]), null);
  assert.equal(S.res[P], STRUCTS.factory.cost - 1, 'un piazzamento fallito non spende');
  S.res[P] = res;
  assert.equal(ev.of('placed').length, 1, 'un piazzamento fallito ha emesso placed');

  S.res[P] = 1000;
  const f = placeStruct(P, 'factory', fs[0], fs[1]);
  ev.stop();
  assert.ok(f);
  assert.deepEqual(ev.of('placed')[1], { owner: P, id: f.id, type: 'factory' });
  assert.equal(ev.of('built').length, 0, 'piazzare non finisce l’edificio');
});

test('evento placed e built anche per l’IA nemica', () => {
  const restore = seedRandom(1);
  try {
    newGame('normale', 12345);
    const ev = recordEvents();
    run(90, 0.05, () => ev.of('built').some(e => e.owner === E));
    ev.stop();
    const placed = ev.of('placed').filter(e => e.owner === E);
    const built = ev.of('built').filter(e => e.owner === E);
    assert.ok(placed.length > 0, 'l’IA non ha piazzato cantieri');
    assert.ok(built.length > 0, 'l’IA non ha finito edifici');
    for (const b of built) assert.ok(placed.some(p => p.id === b.id && p.type === b.type), `built ${b.id} senza placed`);
  } finally { restore(); }
});

test('evento research: owner e id della ricerca, una sola volta', () => {
  newGame('normale', 12345);
  const [x, y] = findSpot(P, 'lab', B0.x - 1, B0.y + 4);
  const lab = makeStruct('lab', P, x, y, true);
  // prHT è di livello II: servono prima due ricerche di livello I.
  assert.equal(startResearch(P, lab, 'prHT'), false);
  S.tech[P].dMG1 = S.tech[P].mot1 = true;
  assert.equal(startResearch(P, lab, 'prHT'), true);
  const ev = recordEvents();
  run(TECH_BY.prHT.time - 1);
  assert.equal(ev.of('research').filter(e => e.owner === P).length, 0, 'emesso in anticipo');
  run(3);
  ev.stop();
  assert.deepEqual(ev.of('research').filter(e => e.owner === P), [{ owner: P, id: 'prHT' }]);
  assert.equal(S.tech[P].prHT, true);
});

test('un ascoltatore di eventi non cambia la partita: stessa casualità, stesso stato', () => {
  const play = listen => {
    const restore = seedRandom(4242);
    let ev = null;
    try {
      newGame('normale', 12345);
      if (listen) ev = recordEvents();
      // Un po' di azione: il geniere costruisce una pompa, l'IA nemica gioca da sola per 3 minuti.
      const b = playerBuilder();
      const d = nearestExploredDeposit(b);
      cmdBuild([b], placeStruct(P, 'pump', d.x, d.y));
      for (let i = 0; i < 180 * 20 && S.phase === 'play'; i++) step(0.05);
      if (ev) ev.stop();
      return { st: JSON.stringify(serialize()), n: ev ? ev.list.length : 0, types: ev ? new Set(ev.list.map(e => e.type)) : null };
    } finally { restore(); }
  };
  const a = play(false), b = play(true);
  assert.ok(b.n > 100, `troppi pochi eventi registrati: ${b.n}`);
  for (const t of ['fx', 'unit', 'placed', 'built']) assert.ok(b.types.has(t), `nessun evento ${t} in 180 s`);
  assert.equal(a.st, b.st, 'lo stato finale differisce con e senza ascoltatore');
});
