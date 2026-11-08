// Passo di simulazione: costruzione, gasolio, ricerca, produzione, IA e fine partita.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MW, MH, TILE, P, E, B0, STRUCTS, TECH_BY, BUILDER, PUMP_RATE, DIFF, GROUND, DIRT, WATER,
  S, newGame, terr, makeStruct, dStats, placeStruct, cmdBuild, enqueue, startResearch, step, pumpRate, ftile,
} from '../index.js';
import { units, structs, playerBuilder, nearestExploredDeposit, findSpot, recordEvents, run, seedRandom } from './helpers.js';

test('un geniere costruisce una pompa entro 40 s e la pompa produce gasolio', () => {
  newGame('normale', 12345);
  const b = playerBuilder();
  const d = nearestExploredDeposit(b);
  const s = placeStruct(P, 'pump', d.x, d.y);
  cmdBuild([b], s);
  const ev = recordEvents();
  const t0 = S.time;
  run(40, 0.05, () => s.built >= 1);
  ev.stop();
  const took = S.time - t0;
  assert.equal(s.built, 1, 'pompa non finita in 40 s');
  assert.ok(took >= STRUCTS.pump.time - 0.1, `finita troppo presto: ${took.toFixed(1)} s`);
  assert.ok(s.hp > s.max * 0.9 && s.hp <= s.max);
  assert.equal(S.stats.built[P], 1);
  assert.ok(ev.of('toast').some(t => /^Pompa pronta nel settore [A-H][1-8]\.$/.test(t.text)), 'manca l’avviso «Pompa pronta»');

  // Il geniere torna libero quando la pompa è finita e integra.
  run(2);
  assert.equal(b.order.t, 'idle');

  // Gasolio: il giocatore fermo non spende nulla, quindi entra solo la produzione della pompa.
  const r0 = S.res[P];
  run(10);
  assert.ok(Math.abs(S.res[P] - r0 - PUMP_RATE * 10) < 0.05, `entrati ${(S.res[P] - r0).toFixed(2)} invece di ${PUMP_RATE * 10}`);
});

test('una pompa non finita non produce; le pompe ad alta pressione rendono il 50% in più', () => {
  newGame('normale', 12345);
  const d = nearestExploredDeposit(playerBuilder());
  placeStruct(P, 'pump', d.x, d.y);
  const r0 = S.res[P];
  run(5);
  assert.equal(S.res[P], r0);
  assert.equal(pumpRate(P), PUMP_RATE);
  S.tech[P].pump2 = true;
  assert.ok(Math.abs(pumpRate(P) - PUMP_RATE * 1.5) < 1e-9);
  for (const diff of Object.keys(DIFF)) {
    S.diff = diff;
    assert.ok(Math.abs(pumpRate(E) - PUMP_RATE * DIFF[diff].inc) < 1e-9, diff);
  }
});

test('la ricerca si completa nel tempo previsto e sblocca la tecnologia', () => {
  newGame('normale', 12345);
  const [x, y] = findSpot(P, 'lab', B0.x - 1, B0.y + 4);
  const lab = makeStruct('lab', P, x, y, true);
  const [x2, y2] = findSpot(P, 'lab', B0.x + 3, B0.y + 4);
  const lab2 = makeStruct('lab', P, x2, y2, true);
  S.res[P] = 1000;
  // wCN è di livello II: si sblocca solo dopo due ricerche di livello I completate (non basta averle avviate).
  assert.equal(startResearch(P, lab, 'wCN'), false);
  assert.equal(startResearch(P, lab, 'dMG1'), true);
  assert.equal(startResearch(P, lab2, 'mot1'), true);
  run(TECH_BY.dMG1.time + 0.5);
  assert.equal(S.tech[P].dMG1, true);
  assert.ok(!S.tech[P].mot1);
  assert.equal(startResearch(P, lab, 'wCN'), false, 'una sola ricerca di livello I completata');
  run(TECH_BY.mot1.time - TECH_BY.dMG1.time + 0.5);
  assert.equal(S.tech[P].mot1, true);
  assert.equal(startResearch(P, lab, 'wCN'), true);
  const ev = recordEvents();
  run(TECH_BY.wCN.time - 1);
  assert.ok(!S.tech[P].wCN, 'completata in anticipo');
  run(1.5);
  ev.stop();
  assert.equal(S.tech[P].wCN, true);
  assert.equal(lab.rs, null);
  assert.ok(ev.of('toast').some(t => t.text === `Ricerca completata: ${TECH_BY.wCN.name}.`));
});

test('il comando addestra un geniere e la fabbrica produce il mezzo progettato', () => {
  newGame('normale', 12345);
  const hq = structs(P, 'hq')[0];
  const [x, y] = findSpot(P, 'factory', B0.x + 4, B0.y + 2);
  const f = makeStruct('factory', P, x, y, true);
  const d = { c: 'M', p: 'HT', w: 'CN' }, st = dStats(d, P);
  S.res[P] = 1000;
  assert.ok(enqueue(hq, null, P));
  assert.ok(enqueue(f, d, P));
  const nB = units(P, u => u.builder).length, nA = units(P, u => !u.builder).length;
  run(BUILDER.time + 0.5);
  assert.equal(units(P, u => u.builder).length, nB + 1);
  assert.equal(hq.queue.length, 0);
  run(st.time - BUILDER.time + 0.5);
  const army = units(P, u => !u.builder);
  assert.equal(army.length, nA + 1);
  const u = army.find(u => u.d && u.d.c === 'M');
  assert.ok(u, 'mezzo non prodotto');
  assert.deepEqual(u.d, d);
  assert.equal(u.max, st.hp);
  assert.equal(S.stats.made[P], 2);
  // Il mezzo esce dalla fabbrica su una casella percorribile e si sposta.
  const v = terr[ftile(u.x) + ftile(u.y) * MW];
  assert.ok(v === GROUND || v === DIRT);
});

test('con il giocatore fermo l’IA si sviluppa, attacca e vince entro 15 minuti', () => {
  const restore = seedRandom(2024);
  try {
    for (const [diff, seed] of [['normale', 12345], ['facile', 2], ['difficile', 3]]) {
      newGame(diff, seed);
      const ev = recordEvents();
      const max = { pump: 0, factory: 0, lab: 0 };
      let researched = 0;
      while (S.phase === 'play' && S.time < 900) {
        run(1);
        for (const t of Object.keys(max)) max[t] = Math.max(max[t], structs(E, t).filter(s => s.built >= 1).length);
        researched = Math.max(researched, Object.keys(S.tech[E]).length);
      }
      ev.stop();
      const tag = `${diff}/${seed}`;
      assert.ok(max.pump >= 2, `${tag}: pompe ${max.pump}`);
      assert.ok(max.factory >= 1, `${tag}: nessuna fabbrica`);
      assert.ok(max.lab >= 1, `${tag}: nessun laboratorio`);
      assert.ok(researched >= 1, `${tag}: nessuna ricerca completata`);
      assert.ok(S.stats.made[E] >= DIFF[diff].w0, `${tag}: prodotti solo ${S.stats.made[E]} mezzi`);
      assert.equal(S.phase, 'lost', `${tag}: partita non persa dopo ${Math.round(S.time)} s`);
      assert.ok(S.time >= DIFF[diff].first, `${tag}: persa prima del primo attacco previsto`);
      assert.ok(S.ai.wave >= 1);
      assert.deepEqual(ev.of('end'), [{ won: false }], `${tag}: evento end`);
      assert.ok(ev.of('toast').some(t => t.kind === 'warn' && /colonna nemica/.test(t.text)), `${tag}: manca l’avviso di attacco`);
      assert.ok(ev.of('toast').some(t => t.kind === 'bad'), `${tag}: manca l’avviso di contatto`);
      assert.ok(ev.of('fog').length > 0 && ev.of('fx').length > 0);
      assert.equal(S.stats.kills[E], S.stats.lost[P]);
    }
  } finally { restore(); }
});

test('invarianti durante una partita intera', () => {
  newGame('normale', 999999);
  const ids = new Set();
  while (S.phase === 'play' && S.time < 900) {
    step(0.05);
    for (const o of [P, E]) assert.ok(S.res[o] >= 0, `gasolio negativo per il lato ${o}`);
    for (const e of S.ents) {
      assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y) && Number.isFinite(e.hp), `entità ${e.id} con valori non numerici`);
      assert.ok(e.hp <= e.max + 1e-9, `entità ${e.id} oltre i punti massimi`);
      if (e.kind !== 'unit') continue;
      const tx = ftile(e.x), ty = ftile(e.y);
      assert.ok(tx >= 0 && ty >= 0 && tx < MW && ty < MH, `mezzo ${e.id} fuori mappa`);
      const v = terr[tx + ty * MW];
      assert.ok(v === GROUND || v === DIRT || (e.water && v === WATER), `mezzo ${e.id} su terreno ${v} a ${S.time.toFixed(1)} s`);
    }
    for (const e of S.ents) ids.add(e.id);
    assert.equal(new Set(S.ents.map(e => e.id)).size, S.ents.length, 'id duplicati');
  }
  assert.ok(S.nextId > Math.max(...ids));
});
