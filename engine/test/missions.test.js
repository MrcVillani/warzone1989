// Fase C del piano 02: le missioni della campagna nel motore (engine/mission.js, newGame con opts.mission):
// preparazione, livello massimo, mappe ritoccate, obiettivi, fine missione, salvataggio. Le partite lunghe sono nella
// simulazione di bilanciamento (tests/balance/campagna.mjs), non qui.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TILE, MW, MH, N, P, E, B0, B1, WATER, DIRT, DIFF, MISSION_DIFF, PUMP_RATE, MISSIONS, ENEMY_BASE2, TECH, TIERS,
  S, newGame, genMap, missionMap, bfsReach, FORDS, LAKE_HALF, terr, deposits, occ, reachMap, reachableAdj,
  serialize, loadState, step, kill, makeStruct, alive, updateObjective, missionTick, techBlockReason, techAvail,
  tierAvail, tierCap, startResearch, pumpRate, techSum, aiDesign, aiTick, dStats, enqueue, onEvent, makeUnit, formation, AI_ARMY,
} from '../index.js';
import { findSpot, recordEvents, run, seedRandom, structs, units } from './helpers.js';

const at = i => MISSIONS[i];
const mission = (i, opts = {}, diff = 'normale') => newGame(diff, at(i).seed, { mission: i, ...opts });
const roundTrip = () => JSON.parse(JSON.stringify(serialize()));
const key = d => `${d.c}/${d.p}/${d.w}`;
const tally = list => list.reduce((m, k) => (m[k] = (m[k] || 0) + 1, m), {});
const enemyStructs = () => S.ents.filter(e => !e.dead && e.owner === E && e.kind === 'struct');
// Pompe pronte del giocatore sui giacimenti liberi più vicini alla sua base.
function playerPumps(n) {
  const free = deposits.filter(d => !occ[d.x + d.y * MW]).sort((a, b) => Math.hypot(a.x - B0.x, a.y - B0.y) - Math.hypot(b.x - B0.x, b.y - B0.y));
  assert.ok(free.length >= n, `solo ${free.length} giacimenti liberi`);
  return free.slice(0, n).map(d => makeStruct('pump', P, d.x, d.y, true));
}
const killAll = list => { for (const e of list) kill(e, P); };
const keyEnemies = () => S.ents.filter(e => !e.dead && e.owner === E && (e.type === 'hq' || e.type === 'factory' || e.builder));
const killPlayer = () => { for (const e of S.ents.filter(e => !e.dead && e.owner === P && (e.type === 'hq' || e.type === 'factory' || e.builder))) kill(e, E); };

/* ---------- preparazione ---------- */

MISSIONS.forEach((M, i) => {
  test(`missione ${i + 1} (${M.id}): gasolio, mezzi, edifici, ricerche del nemico e obiettivo come nei dati`, () => {
    mission(i);
    const pl = M.player, en = M.enemy;
    assert.equal(S.mission, M.id);
    assert.equal(S.maxTier, M.maxTier);
    assert.equal(S.phase, 'play');
    assert.deepEqual(S.res, [pl.res ?? 600, en.res ?? 600]);
    // giocatore: comando + edifici già pronti, genieri e mezzi
    const ps = structs(P);
    assert.ok(ps.every(s => s.built >= 1), 'edifici del giocatore già pronti');
    assert.deepEqual(tally(ps.map(s => s.type)), tally(['hq', ...(pl.structs || [])]));
    assert.equal(units(P, u => u.builder).length, pl.builders ?? 2);
    // Piano 10: oltre ai mezzi dei dati c'è sempre, una sola volta, la Macchina di Villo (contata a parte).
    assert.deepEqual(tally(units(P, u => !u.builder && !u.hero).map(u => key(u.d))), tally((pl.units || []).map(key)));
    assert.deepEqual(units(P, u => u.hero).map(u => [u.hero, key(u.d)]), [['villo', 'VILLO/W/VILLO']], 'una Macchina di Villo');
    assert.equal(units(E, u => u.hero).length, 0, 'il nemico non ha la Macchina di Villo');
    // nemico: tutte le basi
    const want = { hq: 0, factory: 0, lab: 0, depot: 0, tower: 0, bunker: 0, pump: 0 };
    let builders = 0; const army = [];
    for (const b of en.bases) {
      want.hq += b.hq || 0; want.factory += b.factory || 0; want.lab += b.lab || 0; want.depot += b.depot || 0;
      want.tower += b.towers || 0; want.bunker += b.bunkers || 0; want.pump += b.pumps || 0;
      builders += b.builders || 0; army.push(...(b.units || []));
    }
    const es = enemyStructs();
    assert.ok(es.every(s => s.built >= 1), 'edifici del nemico già pronti');
    const got = tally(es.map(s => s.type));
    for (const t in want) assert.equal(got[t] || 0, want[t], `${t} nemici`);
    assert.equal(units(E, u => u.builder).length, builders, 'genieri nemici');
    assert.deepEqual(tally(units(E, u => !u.builder).map(u => key(u.d))), tally(army.map(key)), 'mezzi nemici');
    // le pompe sono sui giacimenti
    for (const s of structs(P, 'pump').concat(structs(E, 'pump'))) assert.ok(deposits.some(d => d.x === s.tx && d.y === s.ty), `pompa fuori giacimento in ${s.tx},${s.ty}`);
    // ricerche: il nemico parte con quelle indicate, il giocatore senza (nessuna portata)
    assert.deepEqual(S.tech[E], Object.fromEntries((en.tech || []).map(id => [id, true])));
    assert.deepEqual(S.tech[P], {});
    assert.equal(S.ecfg.maxTier, en.maxTier ?? 4);
    assert.equal(S.ecfg.build, en.build === 'repair' ? 'repair' : !!en.build, 'build: true, false o \'repair\'');
    assert.equal(S.ecfg.waves, en.waves || 'none');
    // obiettivo
    assert.equal(S.objective.type, M.objective.type);
    assert.equal(S.objective.done, false);
    assert.equal(S.objective.failed, false);
    assert.ok(S.objective.text && !/undefined|NaN/.test(S.objective.text), S.objective.text);
    assert.ok(S.objective.target > 0 && S.objective.progress === 0, `${S.objective.progress}/${S.objective.target}`);
  });
});

test('missione: nessun edificio sovrapposto, tutti dentro la mappa e su terreno edificabile', () => {
  MISSIONS.forEach((M, i) => {
    mission(i);
    const seen = new Map();
    for (const s of S.ents.filter(e => e.kind === 'struct')) {
      for (let y = s.ty; y < s.ty + s.h; y++) for (let x = s.tx; x < s.tx + s.w; x++) {
        assert.ok(x >= 0 && y >= 0 && x < MW && y < MH, `${M.id}: ${s.type} fuori mappa`);
        const k = x + y * MW;
        assert.ok(!seen.has(k), `${M.id}: ${s.type} sopra ${seen.get(k)}`);
        seen.set(k, s.type);
        assert.equal(occ[k], s.id);
        assert.ok(terr[k] !== WATER, `${M.id}: ${s.type} in acqua`);
      }
    }
  });
});

test('MISSION_DIFF: Recluta scala piena, Veterano nessuna scala, Comandante una quota piccola; tutte le quote fra 0 e 1', () => {
  assert.deepEqual(Object.keys(MISSION_DIFF).sort(), Object.keys(DIFF).sort());
  assert.deepEqual(MISSION_DIFF.facile, { inc: 1, rs: 1, waves: 1 });
  assert.deepEqual(MISSION_DIFF.normale, { inc: 0, rs: 0, waves: 0 });
  assert.deepEqual(MISSION_DIFF.difficile, { inc: 0.1, rs: 0.25, waves: 0.2 });
  for (const d in MISSION_DIFF) for (const k of ['inc', 'rs', 'waves']) assert.ok(MISSION_DIFF[d][k] >= 0 && MISSION_DIFF[d][k] <= 1, `${d}.${k}`);
});

// Configurazione attesa del nemico, scritta qui a parte dalla formula di mission.js: la differenza di ogni grandezza
// di DIFF rispetto a «Veterano» vale solo per la quota MISSION_DIFF[d].
function expectedEcfg(en, d) {
  const D = DIFF[d], Nn = DIFF.normale, K = MISSION_DIFF[d], waves = en.waves || 'none';
  const r = key => 1 + (D[key] / Nn[key] - 1) * K.waves;
  return {
    label: D.label,
    inc: (1 + (D.inc - 1) * K.inc) * (en.inc ?? 1),
    rs: (1 + (D.rs - 1) * K.rs) * (en.rs ?? 1),
    first: waves === 'none' ? 1e9 : Math.round((en.first ?? Nn.first) * r('first')),
    gap: Math.round((en.gap ?? Nn.gap) * r('gap')),
    w0: Math.max(1, (en.w0 ?? Nn.w0) + Math.round((D.w0 - Nn.w0) * K.waves)),
    wmax: Math.max(1, Math.round((en.wmax ?? Nn.wmax) * r('wmax'))),
  };
}

test('nemico della missione: valori «Veterano» a normale, scalati dalla difficoltà secondo MISSION_DIFF', () => {
  MISSIONS.forEach((M, i) => {
    const en = M.enemy, cfg = {};
    for (const d of ['facile', 'normale', 'difficile']) {
      mission(i, {}, d);
      cfg[d] = S.ecfg;
      const want = expectedEcfg(en, d);
      assert.equal(S.ecfg.label, want.label);
      for (const k of ['inc', 'rs']) assert.ok(Math.abs(S.ecfg[k] - want[k]) < 1e-9, `${M.id} ${d} ${k}: ${S.ecfg[k]} invece di ${want[k]}`);
      for (const k of ['first', 'gap', 'w0', 'wmax']) assert.equal(S.ecfg[k], want[k], `${M.id} ${d} ${k}`);
      assert.equal(S.ecfg.factories, en.factories ?? 2, `${M.id} factories`);
      assert.equal(S.ecfg.keep, en.keep ?? 0, `${M.id} keep`);
      assert.equal(S.ai.nextAttack, S.ecfg.first);
      assert.equal(S.ai.waveSize, S.ecfg.w0);
      assert.ok(Math.abs(pumpRate(E) - PUMP_RATE * (1 + techSum(E, 'pump')) * S.ecfg.inc) < 1e-9, 'la rendita del nemico usa la missione');
    }
    // «Veterano»: i valori della missione così come sono
    assert.ok(Math.abs(cfg.normale.inc - (en.inc ?? 1)) < 1e-9, `${M.id} inc a normale`);
    assert.ok(Math.abs(cfg.normale.rs - (en.rs ?? 1)) < 1e-9, `${M.id} rs a normale`);
    if ((en.waves || 'none') !== 'none') {
      assert.equal(cfg.normale.first, en.first ?? DIFF.normale.first);
      assert.equal(cfg.normale.gap, en.gap ?? DIFF.normale.gap);
      assert.equal(cfg.normale.w0, en.w0 ?? DIFF.normale.w0);
      assert.equal(cfg.normale.wmax, en.wmax ?? DIFF.normale.wmax);
      // ordine fra le difficoltà: più facile = ondate più tardi, più rade, più piccole
      assert.ok(cfg.facile.first > cfg.normale.first && cfg.normale.first > cfg.difficile.first, `${M.id} first`);
      assert.ok(cfg.facile.gap > cfg.normale.gap && cfg.normale.gap > cfg.difficile.gap, `${M.id} gap`);
      assert.ok(cfg.facile.w0 <= cfg.normale.w0 && cfg.normale.w0 <= cfg.difficile.w0 && cfg.facile.w0 >= 1, `${M.id} w0`);
      assert.ok(cfg.facile.wmax < cfg.normale.wmax && cfg.normale.wmax < cfg.difficile.wmax, `${M.id} wmax`);
    }
    // ricerca più lenta e rendita più bassa da Recluta, più veloce e più alta da Comandante
    assert.ok(cfg.facile.rs > cfg.normale.rs && cfg.normale.rs > cfg.difficile.rs, `${M.id} rs`);
    assert.ok(cfg.facile.inc < cfg.normale.inc && cfg.normale.inc < cfg.difficile.inc, `${M.id} inc`);
    // Recluta: scala piena come in DIFF (rendita e ricerca)
    assert.ok(Math.abs(cfg.facile.inc - DIFF.facile.inc * (en.inc ?? 1)) < 1e-9);
    assert.ok(Math.abs(cfg.facile.rs - DIFF.facile.rs * (en.rs ?? 1)) < 1e-9);
    // Comandante: attenuato rispetto alla scala piena, ma più duro di Veterano
    assert.ok(cfg.difficile.inc < DIFF.difficile.inc * (en.inc ?? 1), `${M.id} inc attenuata`);
    assert.ok(cfg.difficile.rs > DIFF.difficile.rs * (en.rs ?? 1), `${M.id} rs attenuato`);
    if ((en.waves || 'none') !== 'none') {
      assert.ok(cfg.difficile.first > Math.round((en.first ?? DIFF.normale.first) * DIFF.difficile.first / DIFF.normale.first), `${M.id} prima ondata attenuata`);
      assert.ok(cfg.difficile.wmax < Math.round((en.wmax ?? DIFF.normale.wmax) * DIFF.difficile.wmax / DIFF.normale.wmax), `${M.id} wmax attenuato`);
    }
  });
  // valori esatti di una missione (I pozzi del guado: first 150, gap 90, w0 4, wmax 10)
  const pick = c => [c.first, c.gap, c.w0, c.wmax];
  mission(1, {}, 'facile'); assert.deepEqual(pick(S.ecfg), [206, 111, 3, 7]);
  mission(1, {}, 'difficile'); assert.deepEqual(pick(S.ecfg), [141, 87, 4, 11]);
  assert.ok(Math.abs(S.ecfg.inc - 1.03) < 1e-9 && Math.abs(S.ecfg.rs - 0.95) < 1e-9);
  // senza ondate la prima non arriva mai
  mission(0, {}, 'difficile');
  assert.equal(S.ecfg.waves, 'none');
  assert.ok(S.ai.nextAttack > 1e8);
});

test('schermaglia: la scala delle difficoltà resta quella piena di DIFF (MISSION_DIFF vale solo in missione)', () => {
  for (const d of ['facile', 'normale', 'difficile']) {
    newGame(d, 12345);
    assert.equal(S.ecfg, undefined);
    assert.equal(S.ai.nextAttack, DIFF[d].first);
    assert.equal(S.ai.waveSize, DIFF[d].w0);
    assert.ok(Math.abs(pumpRate(E) - PUMP_RATE * DIFF[d].inc) < 1e-9, `${d}: rendita del nemico ${pumpRate(E)}`);
  }
});

/* ---------- nemico in missione: fabbriche e difensori che restano in base ---------- */

test('Testa di ponte (build \'repair\', factories 0): i genieri dell’avamposto non piazzano nulla, mai una fabbrica', () => {
  const en = at(0).enemy;
  assert.equal(en.factories, 0);
  assert.equal(en.build, 'repair');
  // stessa partita, stessa casualità, con i dati della missione ritoccati per le controprove
  const play = (build, factories) => {
    const keep = { build: en.build, factories: en.factories };
    en.build = build;
    if (factories === undefined) delete en.factories; else en.factories = factories;
    const restore = seedRandom(5);
    try {
      mission(0);
      assert.equal(S.ecfg.build, build);
      assert.equal(S.ecfg.factories, factories ?? 2);
      const ids0 = new Set(enemyStructs().map(e => e.id));
      let firstFactory = null, placed = 0;
      for (let t = 0; t < 400 && S.phase === 'play'; t++) {
        run(1);
        for (const e of enemyStructs()) {
          if (!ids0.has(e.id)) { placed++; ids0.add(e.id); }
          if (e.type === 'factory' && firstFactory == null) firstFactory = S.time;
        }
      }
      return { placed, firstFactory, pumps: structs(E, 'pump').length, builders: units(E, u => u.builder).length };
    } finally { restore(); en.build = keep.build; en.factories = keep.factories; }
  };
  const repair = play('repair', 0);
  assert.equal(repair.placed, 0, 'nessun edificio nemico nuovo, nemmeno un cantiere');
  assert.equal(repair.firstFactory, null, 'nessuna fabbrica nemica');
  assert.equal(repair.pumps, en.bases[0].pumps, 'le pompe restano quelle di partenza');
  assert.ok(repair.builders >= en.bases[0].builders, `i genieri ci sono (${repair.builders}) ma non costruiscono`);
  // controprove: con build true e factories 0 i genieri costruiscono, ma niente fabbrica; con factories predefinito sì
  const none = play(true, 0);
  assert.ok(none.placed > 0 && none.pumps > en.bases[0].pumps, `controprova: con build true i genieri costruiscono (pompe nemiche: ${none.pumps})`);
  assert.equal(none.firstFactory, null, 'factories 0: nessuna fabbrica nemica, nemmeno in costruzione');
  const two = play(true, undefined);
  assert.ok(two.firstFactory != null && two.firstFactory < 200, 'controprova: senza factories 0 la fabbrica arriva presto');
  assert.equal(en.build, 'repair', 'i dati della missione tornano come prima');
  assert.equal(en.factories, 0);
});

test('Testa di ponte: un edificio dell’avamposto sotto il 60% viene riparato dai genieri nemici', () => {
  const restore = seedRandom(7);
  try {
    mission(0);
    const [hq] = structs(E, 'hq');
    // la torretta più vicina al comando, al 40%
    const tw = structs(E, 'tower').sort((a, b) => Math.hypot(a.x - hq.x, a.y - hq.y) - Math.hypot(b.x - hq.x, b.y - hq.y))[0];
    tw.hp = Math.round(tw.max * 0.4);
    const hp0 = tw.hp, n0 = enemyStructs().length;
    let reached = null;
    for (let t = 0; t < 120 && S.phase === 'play' && !tw.dead; t++) {
      run(1);
      if (reached == null && tw.hp >= tw.max * 0.6) reached = S.time;
    }
    assert.ok(!tw.dead);
    assert.ok(reached != null, `la torretta non torna sopra il 60% (${tw.hp}/${tw.max}, era ${hp0})`);
    assert.ok(tw.hp > hp0);
    assert.equal(enemyStructs().length, n0, 'i genieri riparano, ma non aggiungono edifici');
  } finally { restore(); }
});

// Difensori nemici in più accanto al comando, tutti con lo stesso progetto.
function addEnemyDefenders(total) {
  const [hq] = structs(E, 'hq');
  const have = units(E, u => !u.builder).length;
  const tiles = formation(hq.tx + 1, hq.ty + 5, total - have, false);
  for (const [x, y] of tiles) makeUnit(E, { c: 'M', p: 'HT', w: 'CN' }, (x + 0.5) * TILE, (y + 0.5) * TILE);
  const army = units(E, u => !u.builder);
  assert.equal(army.length, total);
  return army;
}

test('enemy.keep: quando parte un’ondata la quota keep dei difensori, i più nuovi, resta in base', () => {
  const i = MISSIONS.findIndex(M => M.enemy.keep === 0.5); // La diga di Serra Alta
  assert.ok(i >= 0);
  mission(i);
  assert.equal(S.ecfg.keep, 0.5);
  const w0 = S.ecfg.w0;
  // 13 difensori: ne restano floor(13 × 0,5) = 6, partono i 7 più vecchi
  const army = addEnemyDefenders(13);
  S.time = S.ai.nextAttack;
  const ev = recordEvents();
  aiTick(E);
  ev.stop();
  assert.equal(S.ai.wave, 1, 'l’ondata parte');
  const byId = army.slice().sort((a, b) => a.id - b.id);
  const atk = byId.filter(u => u.role === 'atk'), def = byId.filter(u => u.role === 'def');
  assert.equal(def.length, 6);
  assert.equal(atk.length, 7);
  assert.deepEqual(atk.map(u => u.id), byId.slice(0, 7).map(u => u.id), 'partono i più vecchi');
  assert.ok(atk.every(u => u.order.t !== 'idle'), 'chi parte ha un ordine');
  assert.ok(ev.of('toast').some(t => /colonna nemica/.test(t.text)), 'avviso della colonna');
  assert.ok(atk.length >= w0);
});

test('enemy.keep: l’ondata parte solo se i mezzi che partono (non tutti i difensori) bastano', () => {
  const i = MISSIONS.findIndex(M => M.enemy.keep === 0.5);
  mission(i);
  const w0 = S.ecfg.w0;
  // 2 × w0 − 2 difensori: ne partirebbero w0 − 1, troppo pochi
  addEnemyDefenders(2 * w0 - 2);
  S.time = S.ai.nextAttack;
  aiTick(E);
  assert.equal(S.ai.wave, 0, 'niente ondata');
  assert.ok(units(E, u => !u.builder).every(u => u.role === 'def'));
  // con due difensori in più ne partono w0
  addEnemyDefenders(2 * w0);
  aiTick(E);
  assert.equal(S.ai.wave, 1);
  assert.equal(units(E, u => u.role === 'atk').length, w0);
  assert.equal(units(E, u => u.role === 'def').length, w0);
});

test('enemy.keep 0,75 (Il comando del Direttorio): all’esercito al limite AI_ARMY l’ondata parte anche se waveSize supera i mezzi lanciabili', () => {
  const i = MISSIONS.findIndex(M => M.id === 'comando-direttorio');
  assert.ok(i >= 0);
  mission(i);
  assert.equal(S.ecfg.keep, 0.75);
  // esercito tutto di parti dell'ultimo livello (così non scatta il rinnovo dell'esercito superato) e al limite
  killAll(units(E, u => !u.builder));
  const [hq] = structs(E, 'hq');
  const top = { c: 'X', p: 'TR', w: 'CN105' };
  for (const [x, y] of formation(hq.tx + 1, hq.ty + 5, AI_ARMY, false)) makeUnit(E, top, (x + 0.5) * TILE, (y + 0.5) * TILE);
  const army = units(E, u => !u.builder);
  assert.equal(army.length, AI_ARMY);
  // ne restano floor(50 × 0,75) = 37, ne possono partire 13; waveSize è al massimo (24): prima l'ondata non partiva mai
  const free = AI_ARMY - Math.floor(AI_ARMY * 0.75);
  assert.equal(free, 13);
  S.ai.waveSize = S.ecfg.wmax;
  assert.ok(S.ai.waveSize > free, `waveSize ${S.ai.waveSize}`);
  S.time = S.ai.nextAttack;
  aiTick(E);
  assert.equal(S.ai.wave, 1, 'l’ondata parte');
  assert.equal(units(E, u => u.role === 'atk').length, free);
  assert.equal(units(E, u => u.role === 'def').length, AI_ARMY - free);
  // con 13 mezzi già fuori i difensori sono 37: n = 50 − 13, ne restano floor(37 × 0,75) = 27 e ne partono 10
  const next = S.ai.nextAttack;
  S.ai.waveSize = S.ecfg.wmax;
  aiTick(E);
  assert.equal(S.ai.wave, 1, 'non prima dell’intervallo');
  S.time = next;
  aiTick(E);
  assert.equal(S.ai.wave, 2, 'anche la seconda ondata parte');
  assert.equal(units(E, u => u.role === 'atk').length, free + 10);
  assert.equal(units(E, u => u.role === 'def').length, 27);
});

test('enemy.keep assente: parte tutto l’esercito, come in schermaglia', () => {
  const i = MISSIONS.findIndex(M => M.enemy.waves === 'base' && !M.enemy.keep);
  assert.ok(i >= 0);
  mission(i);
  assert.equal(S.ecfg.keep, 0);
  addEnemyDefenders(13);
  S.time = S.ai.nextAttack;
  aiTick(E);
  assert.equal(S.ai.wave, 1);
  assert.equal(units(E, u => u.role === 'atk').length, 13);
  assert.equal(units(E, u => u.role === 'def').length, 0);
});

test('newGame con opts.mission sconosciuta è un errore; con un id funziona come con l’indice', () => {
  assert.throws(() => newGame('normale', 1, { mission: 8 }), /Missione sconosciuta/);
  assert.throws(() => newGame('normale', 1, { mission: 'boh' }), /Missione sconosciuta/);
  newGame('normale', at(3).seed, { mission: 'passo-dei-larici' });
  const a = JSON.stringify(serialize().ents.map(e => [e.type, e.owner, e.tx, e.ty]));
  mission(3);
  assert.equal(JSON.stringify(serialize().ents.map(e => [e.type, e.owner, e.tx, e.ty])), a);
  assert.equal(S.mission, 'passo-dei-larici');
});

test('ricerche e progetti portati: il giocatore li ha in partita, quelli non validi si scartano', () => {
  mission(0, { tech: { dMG1: true, chM: true, chH: true, falsa: true, mot1: false }, designs: [{ c: 'H', p: 'W', w: 'MG' }, { c: 'Z', p: 'W', w: 'MG' }] });
  assert.deepEqual(S.tech[P], { dMG1: true, chM: true, chH: true });
  assert.deepEqual(S.designs, [{ c: 'H', p: 'W', w: 'MG' }]);
  mission(0, { designs: [{ c: 'Z' }] });
  assert.deepEqual(S.designs, [{ c: 'L', p: 'W', w: 'MG' }], 'senza progetti validi resta quello di partenza');
});

/* ---------- livello massimo ---------- */

test('S.maxTier: oltre il livello della missione la ricerca è bloccata con il motivo giusto', () => {
  mission(0); // livello I
  S.tech[P].dMG1 = S.tech[P].mot1 = true; // il cancello del livello II sarebbe aperto
  assert.equal(tierCap(P), 1);
  assert.equal(tierAvail(P, 2), false);
  for (const t of TECH) {
    if (S.tech[P][t.id]) continue;
    const r = techBlockReason(P, t.id);
    if (t.tier <= 1) assert.equal(r, null, t.id);
    else assert.equal(r, 'Non disponibile in questa missione (livello max I).', t.id);
  }
  const [x, y] = findSpot(P, 'lab', B0.x - 1, B0.y + 4);
  const lab = makeStruct('lab', P, x, y, true);
  const res = S.res[P];
  assert.equal(startResearch(P, lab, 'chM'), false);
  assert.equal(S.res[P], res, 'niente gasolio speso');
  assert.equal(startResearch(P, lab, 'pump2'), true);

  mission(3); // livello III
  S.tech[P] = { dMG1: true, mot1: true, chM: true, wCN: true };
  assert.equal(techBlockReason(P, 'wRK'), null, 'livello III aperto');
  assert.equal(techBlockReason(P, 'wHW'), 'Non disponibile in questa missione (livello max III).');
  assert.equal(techBlockReason(P, 'chX'), 'Non disponibile in questa missione (livello max III).', 'il limite viene prima dei requisiti');
  // il cancello vale ancora dentro il limite
  S.tech[P] = { dMG1: true, mot1: true, chM: true };
  assert.match(techBlockReason(P, 'wRK'), /^Servono 2 ricerche di livello II/);
});

test('S.maxTier: le ricerche portate oltre il livello restano valide', () => {
  mission(0, { tech: { dMG1: true, mot1: true, chM: true, prHT: true, chH: true, prT: true, wCN: true, wCN75: true, chX: true } });
  assert.equal(S.maxTier, 1);
  for (const id of ['chH', 'wCN75', 'chX']) assert.equal(techBlockReason(P, id), 'Già completata.', id);
  assert.equal(techBlockReason(P, 'arm'), 'Non disponibile in questa missione (livello max I).');
  // i mezzi con parti portate si producono
  const [x, y] = findSpot(P, 'factory', B0.x + 3, B0.y + 3);
  const f = makeStruct('factory', P, x, y, true);
  S.res[P] = 5000;
  const d = { c: 'X', p: 'T', w: 'CN75' };
  assert.equal(enqueue(f, d, P), true);
  assert.equal(dStats(d, P).hp > 0, true);
  // e l'IA del giocatore li usa
  const restore = seedRandom(3);
  try {
    const chassis = new Set(Array.from({ length: 60 }, () => aiDesign(P).c));
    assert.ok(chassis.has('X') || chassis.has('H'), [...chassis].join());
  } finally { restore(); }
});

test('livello massimo del nemico: S.ecfg.maxTier', () => {
  mission(3); // nemico fino al II
  assert.equal(tierCap(E), 2);
  S.tech[E] = { dMG1: true, mot1: true, chM: true, wCN: true, prHT: true };
  assert.equal(techBlockReason(E, 'wRK'), 'Non disponibile in questa missione (livello max II).');
  assert.equal(techBlockReason(E, 'wHMG'), null);
});

test('schermaglia: nessun limite di livello, nessuna missione', () => {
  newGame('normale', 12345);
  assert.equal(S.mission, null);
  assert.equal(S.objective, null);
  assert.equal(S.maxTier, null);
  assert.equal(tierCap(P), 4);
  assert.equal(tierCap(E), 4);
  for (const t of TECH) assert.ok(!/missione/.test(techBlockReason(P, t.id) || ''), t.id);
});

/* ---------- mappe ---------- */

test('mappe delle missioni: deterministiche, simmetriche, giacimenti speculari su terra', () => {
  for (const M of MISSIONS) {
    const m = missionMap(M.seed, M.map);
    assert.deepEqual(missionMap(M.seed, M.map), m, M.id);
    for (let k = 0; k < N; k++) assert.equal(m.t[k], m.t[N - 1 - k], `${M.id}: asimmetria in ${k % MW},${(k / MW) | 0}`);
    const set = new Set(m.deps.map(d => d.x + d.y * MW));
    assert.equal(set.size, m.deps.length, `${M.id}: giacimenti doppi`);
    for (const d of m.deps) {
      assert.ok(set.has(MW - 1 - d.x + (MH - 1 - d.y) * MW), `${M.id}: manca lo speculare di ${d.x},${d.y}`);
      assert.ok(m.t[d.x + d.y * MW] !== WATER, `${M.id}: giacimento in acqua`);
    }
    assert.ok(m.deps.length >= 12, `${M.id}: solo ${m.deps.length} giacimenti`);
  }
});

test('mappe senza ritocchi uguali alla schermaglia; missionMap senza opzioni è genMap', () => {
  for (const seed of [1, 12345, 999999]) assert.deepEqual(missionMap(seed), genMap(seed));
  for (const M of MISSIONS.filter(m => !m.map.lake && !m.map.bases)) assert.deepEqual(missionMap(M.seed, M.map), genMap(M.seed), M.id);
});

test('mappe giocabili: ogni giacimento e ogni base nemica raggiungibili a piedi dalla base del giocatore', () => {
  MISSIONS.forEach((M, i) => {
    mission(i);
    const R = bfsReach(terr, B0.x, B0.y);
    for (const d of deposits) assert.ok(R[d.x + d.y * MW], `${M.id}: giacimento ${d.x},${d.y} irraggiungibile`);
    // in partita, con gli edifici al loro posto: dai genieri del giocatore si arriva accanto a ogni giacimento e a
    // ogni comando e fabbrica nemica
    const RU = reachMap(units(P, u => u.builder).map(u => [Math.floor(u.x / TILE), Math.floor(u.y / TILE)]), false);
    for (const d of deposits) assert.ok(reachableAdj(d.x, d.y, 1, 1, RU).length, `${M.id}: non si arriva al giacimento ${d.x},${d.y}`);
    for (const s of structs(E).filter(s => s.type === 'hq' || s.type === 'factory'))
      assert.ok(reachableAdj(s.tx, s.ty, s.w, s.h, RU).length, `${M.id}: ${s.type} nemico in ${s.tx},${s.ty} irraggiungibile`);
    for (const b of M.enemy.bases) assert.ok(bfsReach(missionMap(M.seed, M.map).t, B0.x, B0.y)[(b.x ?? B1.x) + (b.y ?? B1.y) * MW], `${M.id}: centro della base irraggiungibile`);
  });
});

test('missione 5: lago sulla diagonale, attraversabile solo dai due guadi (o sull’acqua)', () => {
  const i = MISSIONS.findIndex(m => m.map.lake);
  assert.equal(i, 4, 'il lago è nella missione 5');
  const m = missionMap(at(i).seed, at(i).map);
  const ford = (x, y) => FORDS.some(f => Math.abs((x - y) - (f.x - f.y)) <= 1);
  let fordTiles = 0;
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    if (Math.abs(x + y - (MW - 1)) > LAKE_HALF) continue;
    const v = m.t[x + y * MW];
    if (ford(x, y)) { assert.equal(v, DIRT, `guado in ${x},${y}`); fordTiles++; }
    else assert.equal(v, WATER, `lago in ${x},${y}`);
  }
  assert.ok(fordTiles >= 2 * 3 * (2 * LAKE_HALF + 1) / 2, `caselle di guado: ${fordTiles}`);
  // a piedi si passa; chiudendo i guadi no
  assert.ok(bfsReach(m.t, B0.x, B0.y)[B1.x + B1.y * MW], 'dalla base del giocatore a quella nemica a piedi');
  const shut = Uint8Array.from(m.t);
  for (let k = 0; k < N; k++) if (shut[k] === DIRT && Math.abs((k % MW) + ((k / MW) | 0) - (MW - 1)) <= LAKE_HALF) shut[k] = WATER;
  assert.ok(!bfsReach(shut, B0.x, B0.y)[B1.x + B1.y * MW], 'senza guadi non si passa a piedi');
  // ciascun guado da solo basta
  for (const f of FORDS) {
    const one = Uint8Array.from(m.t);
    for (let k = 0; k < N; k++) { const x = k % MW, y = (k / MW) | 0; if (Math.abs(x + y - (MW - 1)) <= LAKE_HALF && Math.abs((x - y) - (f.x - f.y)) > 1 && one[k] === DIRT) one[k] = WATER; }
    for (const g of FORDS) if (g !== f) for (let k = 0; k < N; k++) { const x = k % MW, y = (k / MW) | 0; if (Math.abs(x + y - (MW - 1)) <= LAKE_HALF && Math.abs((x - y) - (g.x - g.y)) <= 1) one[k] = WATER; }
    assert.ok(bfsReach(one, B0.x, B0.y)[B1.x + B1.y * MW], `il guado in ${f.x},${f.y} da solo porta alla base nemica`);
  }
  // in partita: un hovercraft passa sull'acqua, un mezzo a ruote no
  mission(i);
  const RW = reachMap([[B0.x + 3, B0.y + 3]], true);
  let wet = 0; for (let k = 0; k < N; k++) if (terr[k] === WATER && RW[k]) wet++;
  assert.ok(wet > 100, 'l’hovercraft raggiunge il lago');
});

test('missione 6: due basi nemiche, la seconda in ENEMY_BASE2 con i suoi giacimenti', () => {
  const i = MISSIONS.findIndex(m => m.map.bases === 2);
  assert.equal(i, 5, 'le due basi sono nella missione 6');
  mission(i);
  const hqs = structs(E, 'hq');
  assert.equal(hqs.length, 2);
  const c = h => [h.tx + 1, h.ty + 1];
  assert.ok(hqs.some(h => c(h)[0] === B1.x && c(h)[1] === B1.y), 'base principale in B1');
  assert.ok(hqs.some(h => c(h)[0] === ENEMY_BASE2.x && c(h)[1] === ENEMY_BASE2.y), 'seconda base in ENEMY_BASE2');
  const near = deposits.filter(d => Math.hypot(d.x - ENEMY_BASE2.x, d.y - ENEMY_BASE2.y) <= 7);
  assert.ok(near.length >= 3, `giacimenti vicino alla seconda base: ${near.length}`);
  // fabbriche: una per base
  for (const h of hqs) assert.ok(structs(E, 'factory').some(f => Math.hypot(f.x - h.x, f.y - h.y) < 10 * TILE), 'fabbrica vicino a ogni comando');
  // le due basi sono collegate tra loro a piedi
  const m = missionMap(at(i).seed, at(i).map);
  assert.ok(bfsReach(m.t, B1.x, B1.y)[ENEMY_BASE2.x + ENEMY_BASE2.y * MW], 'strada tra le due basi nemiche');
});

test('schermaglia identica a prima: newGame senza opzioni, con opzioni vuote o senza missione', () => {
  const snap = (opts) => {
    const restore = seedRandom(9);
    try { newGame('normale', 12345, opts); run(60); return JSON.stringify(serialize()); } finally { restore(); }
  };
  const a = snap(undefined), b = snap({}), c = snap({ tech: {}, designs: [] });
  assert.equal(b, a);
  assert.equal(c, a);
  newGame('normale', 12345);
  assert.deepEqual(terr, genMap(12345).t);
  assert.deepEqual(deposits, genMap(12345).deps);
  assert.deepEqual(S.res, [600, 600]);
  assert.deepEqual(S.tech, [{}, {}]);
  assert.equal(S.ecfg, undefined);
  assert.equal(S.mapOpts, undefined);
  assert.equal(S.autoplay, undefined);
  for (const o of [P, E]) {
    assert.equal(structs(o).length, 1);
    assert.equal(units(o, u => u.builder).length, 2);
    assert.equal(units(o, u => !u.builder).length, 2);
  }
});

/* ---------- obiettivi ---------- */

test('outpost: pompe avviate (una volta per tutte), poi tutti gli edifici nemici; vittoria con reason objective', () => {
  mission(0);
  const o = S.objective, st = enemyStructs().length, need = at(0).objective.pumps;
  assert.equal(need, 6, 'Testa di ponte: sei pompe');
  assert.equal(o.need, need);
  assert.equal(st, 15, 'avamposto: comando, 12 torrette e 2 pompe');
  assert.equal(o.text, `Pompe attive: 0/${need} · edifici nemici rimasti: ${st}`);
  assert.equal(o.target, need + st);
  const pumps = playerPumps(need - 1);
  makeStruct('pump', P, ...(() => { const d = deposits.find(d => !occ[d.x + d.y * MW]); return [d.x, d.y]; })(), false); // in costruzione: non conta
  updateObjective();
  assert.equal(o.progress, need - 1);
  assert.equal(o.text, `Pompe attive: ${need - 1}/${need} · edifici nemici rimasti: ${st}`);
  assert.equal(o.pumpsOk, false);
  // distruggere l'avamposto prima delle pompe non basta
  const outpost = enemyStructs();
  kill(outpost[0], P);
  updateObjective();
  assert.equal(o.killed, 1);
  assert.equal(o.progress, need - 1 + 1);
  assert.equal(o.target, need + st, 'il totale non cambia con le distruzioni');
  pumps.push(...playerPumps(1));
  updateObjective();
  assert.equal(o.pumpsOk, true);
  assert.equal(o.text, `Pompe avviate: ${need}/${need} · edifici nemici rimasti: ${st - 1}`);
  kill(pumps[0], E);
  updateObjective();
  assert.equal(o.pumpsOk, true, 'una pompa persa dopo non toglie il traguardo');
  assert.equal(o.progress, need + 1);
  assert.equal(o.done, false);
  // i mezzi e i genieri nemici non contano, gli edifici finiti sì. I genieri dell'avamposto (build: 'repair') riparano
  // soltanto e non rimettono edifici: restano vivi, e il passo dopo l'avamposto non ricomincia.
  const ev = recordEvents();
  killAll(enemyStructs());
  assert.ok(units(E, u => !u.builder).length > 0, 'restano mezzi nemici');
  assert.ok(units(E, u => u.builder).length > 0, 'restano genieri nemici');
  updateObjective();
  assert.equal(o.done, true);
  assert.equal(o.progress, o.target);
  assert.equal(o.text, `Pompe avviate: ${need}/${need} · edifici nemici rimasti: 0`);
  run(1);
  ev.stop();
  assert.equal(S.phase, 'won');
  assert.deepEqual(ev.of('end'), [{ won: true, reason: 'objective' }]);
  const last = ev.of('objective').at(-1);
  assert.deepEqual(last, { type: 'outpost', progress: o.target, target: o.target, text: o.text, done: true });
});

test('outpost (Testa di ponte): il conteggio parte da 15; distrutti gli edifici, in 10 s non ricompare nulla e l’obiettivo si completa', () => {
  const restore = seedRandom(11);
  try {
    mission(0);
    const o = S.objective, need = at(0).objective.pumps;
    assert.equal(S.ecfg.build, 'repair');
    assert.equal(enemyStructs().length, 15);
    assert.equal(o.target, need + 15);
    assert.match(o.text, /edifici nemici rimasti: 15$/);
    // un cantiere nemico non conta: né all'inizio né dopo
    const d = deposits.filter(d => !occ[d.x + d.y * MW]).sort((a, b) => Math.hypot(a.x - B1.x, a.y - B1.y) - Math.hypot(b.x - B1.x, b.y - B1.y))[0];
    const site = makeStruct('pump', E, d.x, d.y, false);
    assert.ok(site.built < 1);
    updateObjective();
    assert.match(o.text, /edifici nemici rimasti: 15$/, 'il cantiere non si conta');
    killAll(enemyStructs().filter(e => e.built >= 1));
    kill(site, P);
    assert.equal(o.killed, 15, 'il cantiere distrutto non si conta');
    assert.ok(units(E, u => u.builder).length > 0, 'i genieri nemici restano');
    // 10 s di gioco senza pompe avviate: la missione continua e i genieri non rimettono nulla
    const placed = new Set();
    for (let t = 0; t < 10; t++) { run(1); for (const e of enemyStructs()) placed.add(`${e.type}@${e.tx},${e.ty}`); }
    assert.equal(S.phase, 'play');
    assert.deepEqual([...placed], [], 'nessun edificio nemico ricompare, nemmeno un cantiere');
    updateObjective();
    assert.match(o.text, /edifici nemici rimasti: 0$/);
    assert.equal(o.done, false, 'mancano ancora le pompe');
    // con le pompe l'obiettivo è completo
    const ev = recordEvents();
    playerPumps(need);
    run(1);
    ev.stop();
    assert.equal(o.done, true);
    assert.equal(o.progress, o.target);
    assert.equal(S.phase, 'won');
    assert.deepEqual(ev.of('end'), [{ won: true, reason: 'objective' }]);
    assert.equal(enemyStructs().length, 0);
  } finally { restore(); }
});

test('hold: secondi consecutivi con le pompe attive; una pompa persa azzera; vittoria al tempo pieno', () => {
  mission(1);
  const o = S.objective, secs = at(1).objective.time, need = at(1).objective.pumps;
  assert.equal(need, 8, 'I pozzi del guado: otto pompe');
  assert.equal(secs, 540, 'per nove minuti');
  assert.equal(o.text, `Pompe attive: 0/${need} · tienile per 9:00`);
  assert.equal(o.target, secs);
  const pumps = playerPumps(need);
  S.time = 50; updateObjective();
  assert.equal(o.since, 50);
  assert.equal(o.progress, 0);
  S.time = 150.4; updateObjective();
  assert.equal(o.progress, 100);
  assert.equal(o.text, `Pompe attive: ${need}/${need} · tienile per 7:20`);
  kill(pumps[0], E); updateObjective();
  assert.equal(o.progress, 0);
  assert.equal(o.since, null);
  assert.equal(o.text, `Pompe attive: ${need - 1}/${need} · tienile per 9:00`);
  playerPumps(1);
  S.time = 200; updateObjective();
  S.time = 200 + secs - 0.5; updateObjective();
  assert.equal(o.done, false);
  S.time = 200 + secs; updateObjective();
  assert.equal(o.done, true);
  assert.equal(o.progress, secs);
  assert.equal(o.text, `Pompe attive: ${need}/${need} · tienile per 0:00`);
  const ev = recordEvents();
  missionTick();
  ev.stop();
  assert.equal(S.phase, 'won');
  assert.deepEqual(ev.of('end'), [{ won: true, reason: 'objective' }]);
});

test('hold con la simulazione vera: il tempo tenuto cresce con S.time', () => {
  mission(1);
  playerPumps(at(1).objective.pumps);
  run(10.2);
  const o = S.objective;
  assert.ok(o.progress >= 9 && o.progress <= 10, `tenute ${o.progress} s`);
  assert.equal(S.phase, 'play');
});

test('survive: avanzamento e testo col tempo; vittoria allo scadere; la base nemica assente non fa vincere prima', () => {
  mission(2);
  const o = S.objective, secs = at(2).objective.time;
  assert.equal(o.text, 'Resisti ancora 12:00');
  assert.equal(alive(E), false, 'il nemico non ha basi');
  run(2);
  assert.equal(S.phase, 'play', 'senza basi nemiche la missione non è vinta');
  S.time = secs - 20.3; updateObjective();
  assert.equal(o.text, 'Resisti ancora 0:21');
  assert.equal(o.progress, secs - 21);
  assert.equal(o.done, false);
  S.time = secs; updateObjective();
  assert.equal(o.done, true);
  assert.equal(o.progress, secs);
  const ev = recordEvents();
  run(1);
  ev.stop();
  assert.equal(S.phase, 'won');
  assert.deepEqual(ev.of('end'), [{ won: true, reason: 'objective' }]);
});

test('survive: le ondate entrano dal bordo della mappa e vanno verso il giocatore', () => {
  mission(2);
  assert.equal(S.ai.spawns.length, 2);
  const R = reachMap([[B0.x, B0.y + 2]], false);
  for (const [x, y] of S.ai.spawns) {
    assert.ok(x === MW - 1 || y === MH - 1, `ingresso ${x},${y} non sul bordo`);
    assert.ok(R[x + y * MW], `ingresso ${x},${y} non raggiungibile`);
  }
  const restore = seedRandom(4);
  try {
    const ev = recordEvents();
    run(S.ecfg.first + 1);
    ev.stop();
    assert.equal(S.ai.wave, 1);
    const foes = units(E);
    assert.equal(foes.length, S.ecfg.w0);
    assert.ok(foes.every(u => u.role === 'atk' && u.order.t !== 'idle'), 'l’ondata avanza');
    assert.ok(ev.of('toast').some(t => /reparti nemici entrano nel settore/.test(t.text)));
  } finally { restore(); }
});

test('survive_then_destroy: fase 1 resisti, poi fase 2 distruggi; distruggere prima non basta', () => {
  mission(6);
  const o = S.objective, secs = at(6).objective.time;
  assert.equal(o.stage, 1);
  assert.equal(o.text, 'Resisti ancora 8:00, poi distruggi la base');
  assert.equal(o.target, secs);
  S.time = 100; updateObjective();
  assert.equal(o.progress, 100);
  assert.equal(o.text, 'Resisti ancora 6:20, poi distruggi la base');
  // la base distrutta in fase 1 non chiude la missione
  const keys = keyEnemies(), nKeys = keys.length;
  kill(structs(E, 'factory')[0], P);
  updateObjective();
  assert.equal(o.killed, 1);
  assert.equal(o.done, false);
  // fase 2
  const ev = recordEvents();
  S.time = secs; missionTick();
  assert.equal(o.stage, 2);
  assert.equal(ev.of('toast').filter(t => /rinforzi/.test(t.text)).length, 1);
  assert.equal(o.target, nKeys);
  assert.equal(o.progress, 1);
  assert.match(o.text, /^Base nemica · restano 1 comando, 1 fabbrica, \d genieri$/);
  S.time = secs + 1; missionTick();
  assert.equal(ev.of('toast').filter(t => /rinforzi/.test(t.text)).length, 1, 'l’avviso una volta sola');
  assert.equal(S.phase, 'play');
  killAll(keyEnemies());
  missionTick();
  ev.stop();
  assert.equal(o.done, true);
  assert.equal(o.text, 'Base nemica distrutta');
  assert.equal(o.progress, o.target);
  assert.equal(S.phase, 'won');
  assert.deepEqual(ev.of('end'), [{ won: true, reason: 'objective' }]);
});

test('survive_then_destroy: con la base già distrutta in fase 1 si vince subito, senza aspettare la fase 2', () => {
  mission(6);
  const o = S.objective, secs = at(6).objective.time, nKeys = keyEnemies().length;
  S.time = 200; missionTick();
  assert.equal(S.phase, 'play', 'con la base in piedi si resiste');
  assert.equal(o.stage, 1);
  const ev = recordEvents();
  killAll(keyEnemies());
  S.time = 201; missionTick();
  ev.stop();
  assert.ok(S.time < secs);
  assert.equal(S.phase, 'won');
  assert.equal(o.done, true);
  assert.equal(o.stage, 1, 'la vittoria arriva ancora in fase 1');
  assert.equal(o.text, 'Base nemica distrutta');
  assert.equal(o.progress, nKeys);
  assert.equal(o.target, nKeys);
  assert.deepEqual(ev.of('end'), [{ won: true, reason: 'objective' }]);
  assert.equal(ev.of('toast').filter(t => /rinforzi/.test(t.text)).length, 0, 'nessun avviso dei rinforzi');
  assert.deepEqual(ev.of('objective').at(-1), { type: 'survive_then_destroy', progress: nKeys, target: nKeys, text: 'Base nemica distrutta', done: true });
});

test('survive_then_destroy con la simulazione vera: la base distrutta in fase 1 chiude la missione al passo dopo', () => {
  mission(6);
  run(5);
  assert.equal(S.phase, 'play');
  const ev = recordEvents();
  killAll(keyEnemies());
  run(1);
  ev.stop();
  assert.ok(S.time < at(6).objective.time);
  assert.equal(S.phase, 'won');
  assert.deepEqual(ev.of('end'), [{ won: true, reason: 'objective' }]);
});

test('destroy: comandi, fabbriche e genieri; gli altri edifici e i mezzi non contano', () => {
  mission(3);
  const o = S.objective, n = keyEnemies().length;
  assert.equal(o.text, 'Base nemica · restano 1 comando, 1 fabbrica, 2 genieri');
  assert.equal(o.target, n);
  killAll(structs(E, 'tower'));
  killAll(units(E, u => !u.builder));
  updateObjective();
  assert.equal(o.killed, 0);
  assert.equal(o.progress, 0);
  kill(structs(E, 'factory')[0], P);
  updateObjective();
  assert.equal(o.text, 'Base nemica · restano 1 comando, 2 genieri');
  assert.equal(o.progress, 1);
  assert.equal(o.target, n);
  const [hq] = structs(E, 'hq');
  kill(hq, P);
  kill(units(E, u => u.builder)[0], P);
  updateObjective();
  assert.equal(o.text, 'Base nemica · restano 1 geniere');
  const ev = recordEvents();
  killAll(keyEnemies());
  run(1);
  ev.stop();
  assert.equal(o.done, true);
  assert.equal(o.text, 'Base nemica distrutta');
  assert.equal(o.progress, n);
  assert.deepEqual(ev.of('end'), [{ won: true, reason: 'objective' }], 'in missione la vittoria è sempre per obiettivo');
});

test('destroy_all_bases: una base alla volta; un comando o una fabbrica fuori dalle basi va distrutto anche lui', () => {
  mission(5);
  const o = S.objective;
  assert.equal(o.bases.length, 2);
  assert.equal(o.text, 'Basi nemiche distrutte: 0/2');
  assert.equal(o.target, 2);
  const nearB2 = e => Math.hypot(e.x / TILE - ENEMY_BASE2.x, e.y / TILE - ENEMY_BASE2.y) < 12;
  killAll(S.ents.filter(e => !e.dead && e.owner === E && (e.type === 'hq' || e.type === 'factory') && nearB2(e)));
  updateObjective();
  assert.equal(o.progress, 1);
  assert.equal(o.text, 'Basi nemiche distrutte: 1/2');
  assert.deepEqual(o.bases.map(b => b.down), [false, true]);
  // una fabbrica nemica costruita lontano dalle basi
  const [x, y] = findSpot(E, 'factory', MW / 2, MH / 2);
  const far = makeStruct('factory', E, x, y, true);
  killAll(S.ents.filter(e => !e.dead && e.owner === E && (e.type === 'hq' || e.type === 'factory') && e !== far));
  updateObjective();
  assert.equal(o.progress, 2);
  assert.equal(o.done, false);
  assert.equal(o.text, 'Basi nemiche distrutte: 2/2 · resta 1 edificio chiave');
  kill(far, P);
  const ev = recordEvents();
  missionTick();
  ev.stop();
  assert.equal(o.done, true, 'i genieri rimasti non servono');
  assert.ok(units(E, u => u.builder).length > 0);
  assert.equal(o.text, 'Basi nemiche distrutte: 2/2');
  assert.deepEqual(ev.of('end'), [{ won: true, reason: 'objective' }]);
});

test('sconfitta in missione: comando, fabbriche e genieri persi (destroyed) o tempo scaduto (time)', () => {
  mission(3);
  const ev = recordEvents();
  killPlayer();
  run(1);
  ev.stop();
  assert.equal(S.phase, 'lost');
  assert.equal(S.objective.failed, true);
  assert.deepEqual(ev.of('end'), [{ won: false, reason: 'destroyed' }]);
  assert.equal(ev.of('objective').length, 1, 'l’obiettivo fallito si manda una volta');

  mission(3);
  S.timeLimit = 5;
  const ev2 = recordEvents();
  run(6);
  ev2.stop();
  assert.equal(S.phase, 'lost');
  assert.ok(S.time >= 5 && S.time < 6);
  assert.deepEqual(ev2.of('end'), [{ won: false, reason: 'time' }]);
  // l'obiettivo raggiunto vince anche se è l'ultimo istante
  mission(2);
  S.timeLimit = at(2).objective.time;
  S.time = S.timeLimit; missionTick();
  assert.equal(S.phase, 'won');
});

test('evento objective: al massimo due al secondo, solo quando cambia; mai in schermaglia', () => {
  mission(2, { autoplay: true });
  const times = [];
  const off = onEvent((t, d) => { if (t === 'objective') times.push([S.time, d.text]); });
  const restore = seedRandom(8);
  try { run(60); } finally { restore(); off(); }
  assert.ok(times.length >= 55 && times.length <= 2 * 60 + 1, `eventi: ${times.length}`);
  for (let k = 1; k < times.length; k++) {
    assert.ok(times[k][0] - times[k - 1][0] >= 0.5 - 1e-6, `due eventi a ${times[k - 1][0]} e ${times[k][0]}`);
    assert.notEqual(times[k][1], times[k - 1][1], 'evento senza cambiamenti');
  }
  newGame('normale', 12345);
  const ev = recordEvents();
  run(20);
  ev.stop();
  assert.equal(ev.of('objective').length, 0);
});

test('fine missione: un solo evento end, poi la simulazione si ferma', () => {
  mission(2);
  const ev = recordEvents();
  S.time = at(2).objective.time;
  run(3);
  const t = S.time;
  step(0.05); missionTick();
  ev.stop();
  assert.equal(S.time, t);
  assert.equal(ev.of('end').length, 1);
});

/* ---------- salvataggio ---------- */

test('salvataggio in missione: mappa ritoccata, obiettivo e configurazione del nemico tornano uguali', () => {
  const i = 4; // lago
  const restore = seedRandom(21);
  try {
    mission(i, { autoplay: true, tech: { dMG1: true } });
    run(20);
  } finally { restore(); }
  const saved = roundTrip(), objective = structuredClone(S.objective), ecfg = structuredClone(S.ecfg);
  newGame('facile', 1); // un'altra partita in mezzo
  loadState(saved);
  const m = missionMap(at(i).seed, at(i).map);
  assert.deepEqual(terr, m.t);
  assert.deepEqual(deposits, m.deps);
  assert.notDeepEqual(terr, genMap(at(i).seed).t);
  assert.equal(S.mission, at(i).id);
  assert.equal(S.maxTier, at(i).maxTier);
  assert.equal(S.autoplay, true);
  assert.deepEqual(S.objective, objective);
  assert.deepEqual(S.ecfg, ecfg);
  assert.equal(techBlockReason(P, 'chX'), 'Non disponibile in questa missione (livello max III).');
  assert.deepEqual(roundTrip(), saved, 'salvare subito dopo il caricamento dà lo stesso stato');
});

test('salvataggio in missione: la partita ricaricata continua come senza pausa (ondate da bordo e IA del giocatore)', () => {
  const i = 2; // ondate da fuori mappa, prima a 100 s a normale
  let restore = seedRandom(5);
  mission(i, { autoplay: true });
  run(S.ecfg.first - 20);
  restore();
  assert.equal(S.ai.wave, 0);
  const saved = JSON.stringify(serialize());
  restore = seedRandom(77); run(60); restore();
  const a = JSON.stringify(serialize());
  assert.ok(S.ai.wave >= 1, 'un’ondata è arrivata');
  assert.ok(S.objective.progress >= S.ecfg.first + 39);
  loadState(JSON.parse(saved));
  const ev = recordEvents();
  restore = seedRandom(77); run(60); restore();
  ev.stop();
  assert.ok(JSON.stringify(serialize()) === a, 'stato diverso dopo il caricamento');
  assert.ok(ev.of('objective').length > 30, 'l’obiettivo continua ad aggiornarsi');
  assert.equal(ev.of('objective').at(-1).text, S.objective.text);
});

test('salvataggio in missione con due basi: il testo e le basi dell’obiettivo restano', () => {
  mission(5);
  const nearB2 = e => Math.hypot(e.x / TILE - ENEMY_BASE2.x, e.y / TILE - ENEMY_BASE2.y) < 12;
  killAll(S.ents.filter(e => !e.dead && e.owner === E && (e.type === 'hq' || e.type === 'factory') && nearB2(e)));
  run(1);
  const saved = roundTrip();
  newGame('normale', 3);
  loadState(saved);
  assert.equal(S.objective.text, 'Basi nemiche distrutte: 1/2');
  updateObjective();
  assert.equal(S.objective.progress, 1);
  assert.deepEqual(terr, missionMap(at(5).seed, at(5).map).t);
});

test('TIERS e livelli delle missioni: il testo del limite usa il numero romano', () => {
  for (const [k, M] of MISSIONS.entries()) {
    mission(k);
    const t = TECH.find(t => t.tier === M.maxTier + 1);
    if (!t) continue;
    assert.equal(techBlockReason(P, t.id), `Non disponibile in questa missione (livello max ${TIERS[M.maxTier - 1]}).`);
    assert.equal(techAvail(P, t.id), false);
  }
});
