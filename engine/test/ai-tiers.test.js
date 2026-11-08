// Fase B del piano 02: l'IA con la ricerca a livelli e le parti nuove.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  P, E, B1, CHASSIS, PROPS, WEAPONS, TECH, TECH_BY, TIER_GATE, AI_TECH, DIFF,
  S, newGame, makeStruct, makeUnit, dStats, aiTick, aiDesign, tierAvail, tierDone, ent, serialize, loadState, onEvent,
} from '../index.js';
import { structs, units, findSpot, run, seedRandom } from './helpers.js';

test('in schermaglia «normale» con il giocatore fermo l’IA vince sempre entro 15 minuti (semi 1–20)', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const restore = seedRandom(seed);
    try {
      newGame('normale', seed);
      run(900);
      assert.equal(S.phase, 'lost', `seme ${seed}: partita non persa dopo ${Math.round(S.time)} s`);
      assert.ok(S.time >= DIFF.normale.first, `seme ${seed}: persa prima del primo attacco previsto`);
    } finally { restore(); }
  }
});

test('partita lunga: l’IA rispetta i livelli, arriva al livello III e produce mezzi con armi di livello III', () => {
  const restore = seedRandom(12345);
  try {
    newGame('normale', 12345);
    // Il comando del giocatore non cade mai: la partita resta aperta e l'IA continua a svilupparsi.
    const hq = structs(P, 'hq')[0];
    hq.max = hq.hp = 1e9;
    const t3units = [];
    let maxArmy = 0, maxBunkers = 0, gateOk = true;
    // Ogni ricerca dell'IA di livello N > 1 si completa con almeno TIER_GATE ricerche di livello N-1 già completate.
    const off = onEvent((type, r) => {
      if (type !== 'research' || r.owner !== E) return;
      const T = TECH_BY[r.id];
      if (T.tier > 1 && tierDone(E, T.tier - 1) < TIER_GATE) gateOk = false;
    });
    try {
      run(1500, 0.05, () => {
        const army = units(E, u => !u.builder);
        maxArmy = Math.max(maxArmy, army.length);
        maxBunkers = Math.max(maxBunkers, structs(E, 'bunker').length);
        for (const u of army) if (WEAPONS[u.d.w].tier >= 3 && !t3units.includes(u.id)) t3units.push(u.id);
        return tierDone(E, 3) >= 1 && t3units.length >= 1;
      });
    } finally { off(); }
    assert.equal(S.phase, 'play');
    assert.ok(gateOk, 'l’IA ha completato una ricerca senza il cancello del livello precedente');
    assert.ok(tierAvail(E, 3), `livello III non raggiunto in ${Math.round(S.time)} s`);
    assert.ok(tierDone(E, 3) >= 1, 'nessuna ricerca di livello III completata');
    assert.ok(t3units.length >= 1, `nessun mezzo con arma di livello III in ${Math.round(S.time)} s`);
    // Tutti i mezzi dell'IA usano solo parti sbloccate.
    for (const u of units(E, u => !u.builder)) {
      for (const part of [CHASSIS[u.d.c], PROPS[u.d.p], WEAPONS[u.d.w]]) assert.ok(!part.req || S.tech[E][part.req], `${u.d.c}/${u.d.p}/${u.d.w}`);
    }
    // Limiti dell'IA: al massimo 3 bunker; l'esercito si ferma attorno a 50 mezzi (più quelli già in coda).
    assert.ok(maxBunkers <= 3, `bunker ${maxBunkers}`);
    assert.ok(maxArmy <= 54, `esercito di ${maxArmy} mezzi`);
  } finally { restore(); }
});

test('aiDesign usa solo parti sbloccate, e con tutto ricercato anche quelle di livello IV', () => {
  const restore = seedRandom(31);
  try {
    newGame('normale', 12345);
    for (let i = 0; i < 50; i++) assert.deepEqual(aiDesign(E), { c: 'L', p: 'W', w: 'MG' }, 'senza ricerche solo parti di livello I');
    // Tutte le ricerche e un esercito numeroso (riparatori e artiglieria entrano solo da 5-6 mezzi in su).
    for (const t of TECH) S.tech[E][t.id] = true;
    for (let i = 0; i < 10; i++) makeUnit(E, { c: 'L', p: 'W', w: 'MG' }, B1.x * 32, (B1.y - 6) * 32);
    const seen = { c: new Set(), p: new Set(), w: new Set() };
    for (let i = 0; i < 400; i++) {
      const d = aiDesign(E);
      for (const k of ['c', 'p', 'w']) seen[k].add(d[k]);
      assert.ok(CHASSIS[d.c] && PROPS[d.p] && WEAPONS[d.w], JSON.stringify(d));
      assert.ok(Number.isFinite(dStats(d, E).cost));
    }
    assert.ok(seen.c.has('X'), 'mai il Mammut');
    assert.ok(seen.p.has('TR'), 'mai i cingoli rinforzati');
    for (const w of ['RP', 'HW', 'CN105']) assert.ok(seen.w.has(w), `mai ${w}`);
    assert.ok(['MRL', 'FL', 'HMG'].some(w => seen.w.has(w)));
  } finally { restore(); }
});

test('l’IA tiene il progetto scelto (aiNext) sulla fabbrica finché non ha il gasolio', () => {
  newGame('normale', 12345);
  const [fx, fy] = findSpot(E, 'factory', B1.x - 6, B1.y - 3);
  const f = makeStruct('factory', E, fx, fy, true);
  const d = { c: 'X', p: 'TR', w: 'CN105' };
  f.aiNext = { ...d };
  S.res[E] = dStats(d, E).cost - 1;
  aiTick();
  assert.deepEqual(f.aiNext, d, 'il progetto in attesa non viene scartato');
  assert.equal(f.queue.length, 0);
  // Resta anche dopo un salvataggio.
  loadState(JSON.parse(JSON.stringify(serialize())));
  const f2 = ent(f.id);
  assert.deepEqual(f2.aiNext, d);
  S.res[E] = 5000;
  aiTick();
  assert.equal(f2.queue.length, 1);
  assert.deepEqual(f2.queue[0].d, d, 'in coda va proprio il progetto tenuto da parte');
  assert.equal(f2.aiNext, null);
});

test('l’IA avvia per prime le ricerche di livello I e non salta il cancello', () => {
  newGame('normale', 12345);
  const [lx, ly] = findSpot(E, 'lab', B1.x, B1.y - 5);
  const lab = makeStruct('lab', E, lx, ly, true);
  S.res[E] = 5000;
  aiTick();
  assert.ok(lab.rs, 'il laboratorio è rimasto fermo');
  assert.equal(lab.rs.id, AI_TECH.find(id => TECH_BY[id].tier === 1));
  // Con una sola ricerca di livello I completata e le altre di livello I fatte o in corso, nessuna di livello II.
  for (const id of AI_TECH.filter(id => TECH_BY[id].tier === 1)) S.tech[E][id] = false;
  S.tech[E].dMG1 = true; lab.rs = null;
  const lab2 = makeStruct('lab', E, ...findSpot(E, 'lab', B1.x - 4, B1.y - 5), true);
  aiTick();
  for (const l of [lab, lab2]) if (l.rs) assert.equal(TECH_BY[l.rs.id].tier, 1, `avviata ${l.rs.id} con il livello II chiuso`);
});
