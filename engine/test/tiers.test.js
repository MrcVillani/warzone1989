// Fase B del piano 02: ricerca a livelli (cancello dei livelli) ed effetti delle ricerche di potenziamento
// (corazza, danno per famiglia, velocità, pompe, arma delle torrette); salvataggio con parti e ricerche nuove.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TILE, P, E, B0, TECH, TECH_BY, TIER_GATE, PUMP_RATE, TOWER_MG, TOWER_CN, TOWER_CN75, BUNKER_W, WEAPONS,
  S, newGame, makeUnit, makeStruct, dStats, armorOf, armorBonus, dmgMul, speedMul, techSum, towerWeapon,
  tierAvail, tierDone, techBlockReason, techAvail, startResearch, researching, nearestFree, pathTo, followPath,
  pumpRate, serialize, loadState, proj, ent, fire, damage,
} from '../index.js';
import { findSpot, nearestExploredDeposit, playerBuilder, recordEvents, run, seedRandom } from './helpers.js';

const at = (tx, ty) => { const f = nearestFree(tx, ty, false); return [(f[0] + 0.5) * TILE, (f[1] + 0.5) * TILE]; };
const builtLab = (cx = B0.x - 1, cy = B0.y + 4) => { const [x, y] = findSpot(P, 'lab', cx, cy); return makeStruct('lab', P, x, y, true); };
const ofTier = n => TECH.filter(t => t.tier === n);
const setDone = (owner, ...ids) => { for (const id of ids) S.tech[owner][id] = true; };

/* ---------- cancello dei livelli ---------- */

test('cancello: con una ricerca di livello I il livello II è chiuso, con due è aperto', () => {
  newGame('normale', 12345);
  const lab = builtLab();
  assert.equal(tierAvail(P, 1), true, 'il livello I è sempre aperto');
  assert.equal(tierAvail(P, 2), false);
  assert.equal(tierDone(P, 1), 0);
  // Tutte le ricerche di livello I sono avviabili da subito, nessuna di livello superiore.
  for (const t of TECH) assert.equal(techAvail(P, t.id), t.tier === 1, t.id);

  setDone(P, 'dMG1');
  assert.equal(tierDone(P, 1), 1);
  assert.equal(tierAvail(P, 2), false);
  assert.equal(techBlockReason(P, 'chM'), `Servono ${TIER_GATE} ricerche di livello I (1/${TIER_GATE}).`);
  assert.equal(startResearch(P, lab, 'chM'), false);
  assert.equal(S.res[P], 600, 'nessun gasolio speso per una ricerca rifiutata');
  assert.equal(lab.rs, null);

  setDone(P, 'pump2');
  assert.equal(tierDone(P, 1), 2);
  assert.equal(tierAvail(P, 2), true);
  assert.equal(tierAvail(P, 3), false, 'il livello III richiede ricerche di livello II, non di livello I');
  assert.equal(techBlockReason(P, 'chM'), null);
  assert.equal(startResearch(P, lab, 'chM'), true);
  assert.equal(S.res[P], 600 - TECH_BY.chM.cost);
  // Il cancello di un lato non vale per l'altro.
  assert.equal(tierAvail(E, 2), false);
  assert.equal(techAvail(E, 'chM'), false);
});

test('cancello: contano solo le ricerche completate, non quelle in corso', () => {
  newGame('normale', 12345);
  const lab = builtLab(), lab2 = builtLab(B0.x + 3, B0.y + 4);
  setDone(P, 'mot1');
  assert.equal(startResearch(P, lab, 'dMG1'), true);
  assert.equal(researching(P, 'dMG1'), true);
  assert.equal(tierDone(P, 1), 1);
  assert.equal(tierAvail(P, 2), false);
  assert.equal(startResearch(P, lab2, 'wCN'), false);
  assert.match(techBlockReason(P, 'wCN'), /\(1\/2\)/);
});

test('cancello: ogni livello si apre con due ricerche del livello precedente, anche il IV', () => {
  newGame('normale', 12345);
  // Molte ricerche di livello I non aprono il livello III.
  setDone(P, ...ofTier(1).map(t => t.id));
  assert.equal(tierAvail(P, 2), true);
  assert.equal(tierAvail(P, 3), false);
  assert.equal(techBlockReason(P, 'chH'), `Servono ${TIER_GATE} ricerche di livello II (0/${TIER_GATE}).`);
  setDone(P, 'chM');
  assert.equal(techBlockReason(P, 'chH'), `Servono ${TIER_GATE} ricerche di livello II (1/${TIER_GATE}).`);
  setDone(P, 'prHT');
  assert.equal(tierAvail(P, 3), true);
  assert.equal(techBlockReason(P, 'chH'), null);
  assert.equal(tierAvail(P, 4), false);
  assert.equal(techBlockReason(P, 'chX'), `Servono ${TIER_GATE} ricerche di livello III (0/${TIER_GATE}).`);
  setDone(P, 'chH', 'wRK');
  assert.equal(tierDone(P, 3), 2);
  assert.equal(tierAvail(P, 4), true);
  assert.equal(techBlockReason(P, 'chX'), null);
  assert.equal(techBlockReason(P, 'wMRL'), null);
  assert.equal(techBlockReason(P, 'wHW'), `Serve ${TECH_BY.wMO.name}.`, 'il livello aperto non salta i requisiti specifici');
});

test('techBlockReason: completata, in corso, requisito mancante, sconosciuta', () => {
  newGame('normale', 12345);
  const lab = builtLab();
  assert.equal(techBlockReason(P, 'nonEsiste'), 'Ricerca sconosciuta.');
  assert.equal(techAvail(P, 'nonEsiste'), false);
  assert.equal(techBlockReason(P, 'dMG1'), null);
  assert.equal(startResearch(P, lab, 'dMG1'), true);
  assert.equal(techBlockReason(P, 'dMG1'), 'In corso.');
  setDone(P, 'dMG1'); lab.rs = null;
  assert.equal(techBlockReason(P, 'dMG1'), 'Già completata.');
  assert.equal(techAvail(P, 'dMG1'), false);
  // Con il livello chiuso il motivo è il livello, anche se mancano requisiti specifici.
  assert.match(techBlockReason(P, 'twCN'), /^Servono 2 ricerche di livello I/);
  setDone(P, 'mot1');
  assert.equal(techBlockReason(P, 'twCN'), `Serve ${TECH_BY.wCN.name}.`);
  assert.equal(techBlockReason(P, 'dMG2'), null, 'dMG2 richiede dMG1, già completata');
  // Più requisiti mancanti: tutti nominati, separati da virgola.
  setDone(P, 'chM', 'prHT');
  assert.equal(techBlockReason(P, 'twCN75'), `Serve ${TECH_BY.twCN.name}, ${TECH_BY.wCN75.name}.`);
  setDone(P, 'twCN');
  assert.equal(techBlockReason(P, 'twCN75'), `Serve ${TECH_BY.wCN75.name}.`);
  setDone(P, 'wCN75');
  assert.equal(techBlockReason(P, 'twCN75'), null);
  // Il motivo vale per il lato richiesto: il nemico non ha nulla di completato.
  assert.match(techBlockReason(E, 'twCN75'), /^Servono 2 ricerche di livello II \(0\/2\)\.$/);
});

/* ---------- effetti delle ricerche ---------- */

test('corazza composita: +2 per grado, anche ai mezzi già in campo, solo per chi la ricerca', () => {
  newGame('normale', 12345);
  const [x, y] = at(24, 24);
  const u = makeUnit(P, { c: 'H', p: 'T', w: 'MG' }, x, y);
  const foe = makeUnit(E, { c: 'H', p: 'T', w: 'MG' }, x + 3 * TILE, y);
  assert.equal(armorOf(u), 4);
  assert.equal(armorBonus(P), 0);
  const steps = [['arm', 6], ['arm2', 8], ['arm3', 10]];
  for (const [id, want] of steps) {
    setDone(P, id);
    assert.equal(armorOf(u), want, `${id}: mezzo già in campo`);
    assert.equal(dStats({ c: 'H', p: 'T', w: 'MG' }, P).armor, want, `${id}: progetto`);
    assert.equal(armorOf(foe), 4, 'la corazza del giocatore non vale per il nemico');
  }
  assert.equal(armorBonus(P), 6);
  // Con più corazza un colpo toglie meno punti: 20 di danno su corazza 10 → 10, sul nemico (corazza 4) → 16.
  const hu = u.hp, hf = foe.hp;
  damage(u, 20, E); damage(foe, 20, P);
  assert.ok(Math.abs(hu - u.hp - 10) < 1e-9, `tolti ${hu - u.hp}`);
  assert.ok(Math.abs(hf - foe.hp - 16) < 1e-9, `tolti ${hf - foe.hp}`);
});

test('danno per famiglia: +20% per grado, solo per la famiglia giusta e solo per chi lo ricerca', () => {
  newGame('normale', 12345);
  for (const f of ['mg', 'cannon', 'rocket', 'artillery', 'fire', 'support']) assert.equal(dmgMul(P, f), 1, f);
  setDone(P, 'dMG1');
  assert.ok(Math.abs(dmgMul(P, 'mg') - 1.2) < 1e-9);
  setDone(P, 'dMG2', 'dMG3');
  assert.ok(Math.abs(dmgMul(P, 'mg') - 1.6) < 1e-9);
  assert.equal(dmgMul(P, 'cannon'), 1);
  assert.equal(dmgMul(E, 'mg'), 1);
  setDone(P, 'dCN1', 'dCN2', 'dRK1', 'dAR1', 'dFL1');
  assert.ok(Math.abs(dmgMul(P, 'cannon') - 1.4) < 1e-9);
  assert.ok(Math.abs(dmgMul(P, 'rocket') - 1.2) < 1e-9);
  assert.ok(Math.abs(dmgMul(P, 'artillery') - 1.2) < 1e-9);
  assert.ok(Math.abs(dmgMul(P, 'fire') - 1.2) < 1e-9);
  assert.ok(Math.abs(techSum(P, 'dmg', 'mg') - 0.6) < 1e-9);
  // dStats riporta il danno al secondo con le ricerche del lato.
  const d = { c: 'L', p: 'W', w: 'MG' };
  assert.ok(Math.abs(dStats(d, P).dps - WEAPONS.MG.dmg * 1.6 / WEAPONS.MG.rof) < 1e-9);
  assert.ok(Math.abs(dStats(d, E).dps - WEAPONS.MG.dmg / WEAPONS.MG.rof) < 1e-9);
  assert.ok(Math.abs(dStats(d).dps - WEAPONS.MG.dmg / WEAPONS.MG.rof) < 1e-9, 'senza lato, nessuna ricerca');
});

// Primo colpo che il tiratore (già piazzato) mette a segno su un bersaglio nemico fermo e senza corazza: punti tolti.
function firstHit(target, seconds = 8) {
  const hp0 = target.hp;
  run(seconds, 0.05, () => target.hp < hp0);
  assert.ok(target.hp < hp0, 'il bersaglio non è stato colpito');
  return hp0 - target.hp;
}
// Bersaglio nemico: Gheppio (corazza 0) con modulo riparazione, così non attacca; role 'test' lo tiene fuori dagli
// ordini dell'IA; punti struttura enormi.
function dummy(x, y) {
  const t = makeUnit(E, { c: 'L', p: 'W', w: 'RP' }, x, y);
  t.hp = t.max = 1e6; t.role = 'test';
  return t;
}

test('danno per famiglia: vale per i colpi dei mezzi, delle torrette e dei bunker', () => {
  const restore = seedRandom(3);
  try {
    // Mezzo con mitragliatrice: colpo immediato.
    for (const [ids, mul] of [[[], 1], [['dMG1'], 1.2], [['dMG1', 'dMG2'], 1.4]]) {
      newGame('normale', 12345);
      setDone(P, ...ids);
      const [x, y] = at(24, 24);
      makeUnit(P, { c: 'L', p: 'W', w: 'MG' }, x, y);
      const t = dummy(x + 3 * TILE, y);
      assert.ok(Math.abs(firstHit(t) - WEAPONS.MG.dmg * mul) < 1e-6, `MG con ${ids.join('+') || 'nessuna ricerca'}`);
    }
    // Torretta (mitragliatrice da torretta): famiglia mg.
    for (const [ids, mul] of [[[], 1], [['dMG1'], 1.2]]) {
      newGame('normale', 12345);
      setDone(P, ...ids);
      const [x, y] = findSpot(P, 'tower', 24, 24);
      const tw = makeStruct('tower', P, x, y, true);
      const t = dummy(tw.x + 3.5 * TILE, tw.y);
      assert.ok(Math.abs(firstHit(t) - TOWER_MG.dmg * mul) < 1e-6, `torretta MG con ${ids.join('+') || 'nessuna ricerca'}`);
    }
    // Bunker (cannone 75): famiglia cannon; il proiettile porta il danno calcolato allo sparo.
    for (const [ids, mul] of [[[], 1], [['dCN1'], 1.2], [['dCN1', 'dCN2', 'dCN3'], 1.6], [['dMG1', 'dMG2'], 1]]) {
      newGame('normale', 12345);
      setDone(P, ...ids);
      const [x, y] = findSpot(P, 'bunker', 24, 24);
      const bk = makeStruct('bunker', P, x, y, true);
      const t = dummy(bk.x + 4 * TILE, bk.y);
      assert.ok(Math.abs(firstHit(t) - BUNKER_W.dmg * mul) < 1e-6, `bunker con ${ids.join('+') || 'nessuna ricerca'}`);
    }
  } finally { restore(); }
});

// Strada percorsa in un passo di 0,1 s da un mezzo già rivolto verso la prossima casella di un percorso dritto
// (solo followPath, che applica i motori del lato). Lo stesso passo, con lo stesso terreno, dà il rapporto esatto.
function travel(u, tech) {
  setDone(u.owner, ...tech);
  const [gx, gy] = at(Math.floor(u.x / TILE) + 10, Math.floor(u.y / TILE));
  pathTo(u, gx, gy);
  assert.ok(u.path, 'nessun percorso');
  const n = u.path[0];
  u.ang = Math.atan2((n[1] + 0.5) * TILE - u.y, (n[0] + 0.5) * TILE - u.x);
  const x0 = u.x, y0 = u.y;
  followPath(u, 0.1);
  return Math.hypot(u.x - x0, u.y - y0);
}

test('motori: +10% di velocità per grado, anche ai genieri, solo per chi li ricerca', () => {
  newGame('normale', 12345);
  assert.equal(speedMul(P), 1);
  setDone(P, 'mot1');
  assert.ok(Math.abs(speedMul(P) - 1.1) < 1e-9);
  setDone(P, 'mot2');
  assert.ok(Math.abs(speedMul(P) - 1.2) < 1e-9);
  assert.equal(speedMul(E), 1);
  const d = { c: 'M', p: 'HT', w: 'CN' };
  assert.ok(Math.abs(dStats(d, P).speed - dStats(d).speed * 1.2) < 1e-9);

  for (const kind of ['geniere', 'mezzo']) {
    const dist = {};
    for (const [tag, tech] of [['base', []], ['mot1', ['mot1']], ['mot2', ['mot1', 'mot2']]]) {
      newGame('normale', 12345);
      let u;
      if (kind === 'geniere') u = playerBuilder();
      else { const [x, y] = at(24, 24); u = makeUnit(P, { c: 'L', p: 'W', w: 'MG' }, x, y); }
      dist[tag] = travel(u, tech);
    }
    assert.ok(dist.base > 1, `${kind}: fermo`);
    const r1 = dist.mot1 / dist.base, r2 = dist.mot2 / dist.base;
    assert.ok(Math.abs(r1 - 1.1) < 1e-6, `${kind}: rapporto con mot1 ${r1.toFixed(4)}`);
    assert.ok(Math.abs(r2 - 1.2) < 1e-6, `${kind}: rapporto con mot1+mot2 ${r2.toFixed(4)}`);
  }
});

test('pompe: +50% con pump2, +80% con pump2 e pump3, anche nel gasolio che entra davvero', () => {
  newGame('normale', 12345);
  assert.equal(pumpRate(P), PUMP_RATE);
  setDone(P, 'pump2', 'pump3');
  assert.ok(Math.abs(pumpRate(P) - PUMP_RATE * 1.8) < 1e-9);
  assert.ok(Math.abs(pumpRate(E) - PUMP_RATE) < 1e-9, 'il nemico (normale) non ha le pompe del giocatore');
  const d = nearestExploredDeposit(playerBuilder());
  makeStruct('pump', P, d.x, d.y, true);
  const r0 = S.res[P];
  run(10);
  assert.ok(Math.abs(S.res[P] - r0 - PUMP_RATE * 1.8 * 10) < 0.05, `entrati ${(S.res[P] - r0).toFixed(2)}`);
});

test('torrette: mitragliatrice, poi cannone 40 con twCN, poi cannone 75 con twCN75', () => {
  newGame('normale', 12345);
  assert.equal(towerWeapon(P), TOWER_MG);
  setDone(P, 'twCN');
  assert.equal(towerWeapon(P), TOWER_CN);
  setDone(P, 'twCN75');
  assert.equal(towerWeapon(P), TOWER_CN75);
  assert.equal(towerWeapon(E), TOWER_MG, 'il nemico non ha le ricerche del giocatore');
  // In partita: la torretta spara con il cannone 75 (fx flash w = 'CN75') e il colpo toglie il suo danno.
  const restore = seedRandom(3);
  try {
    const [x, y] = findSpot(P, 'tower', 24, 24);
    const tw = makeStruct('tower', P, x, y, true);
    const t = dummy(tw.x + 4 * TILE, tw.y);
    const ev = recordEvents();
    const hit = firstHit(t);
    ev.stop();
    assert.ok(Math.abs(hit - TOWER_CN75.dmg) < 1e-6, `danno ${hit}`);
    const shots = ev.of('fx').filter(f => f.k === 'flash' && f.owner === P);
    assert.ok(shots.length > 0);
    for (const f of shots) assert.equal(f.w, 'CN75');
  } finally { restore(); }
});

/* ---------- salvataggio ---------- */

test('salvataggio e caricamento con parti nuove e ricerche di più livelli', () => {
  let restore = seedRandom(21);
  try {
    newGame('normale', 12345);
    S.res[P] = 5000;
    setDone(P, 'dMG1', 'mot1', 'chM', 'prHT', 'wCN', 'wRP', 'chH', 'prT', 'wMO', 'wRK', 'stBK', 'arm', 'chX', 'prTR', 'wHW', 'wMRL');
    const lab = builtLab();
    assert.equal(startResearch(P, lab, 'wCN105'), false, 'manca wCN75');
    assert.equal(startResearch(P, lab, 'wCN75'), true);
    run(5);
    const [x, y] = at(24, 24);
    const designs = [{ c: 'X', p: 'TR', w: 'MRL' }, { c: 'H', p: 'T', w: 'HW' }, { c: 'M', p: 'HT', w: 'RP' }, { c: 'X', p: 'T', w: 'AT' }];
    S.designs.push(...designs);
    const mine = designs.map((d, i) => makeUnit(P, d, x + (i % 2) * TILE, y + Math.floor(i / 2) * TILE));
    mine[0].hp = mine[0].max * 0.5; // il riparatore ha qualcuno da curare
    const [bx, by] = findSpot(P, 'bunker', 22, 20);
    makeStruct('bunker', P, bx, by, true);
    const t = dummy(x + 6 * TILE, y);
    // Un colpo di obice in volo, perché il salvataggio porti anche i proiettili.
    fire(mine[1].x, mine[1].y, 0, t, WEAPONS.HW, P, 12);
    assert.ok(proj.some(p => p.k === 'mortar' && p.wk === 'HW'));
    restore();

    const saved = JSON.stringify(serialize());
    restore = seedRandom(77);
    run(20);
    restore();
    const a = JSON.stringify(serialize());

    newGame('facile', 1);
    loadState(JSON.parse(saved));
    for (const d of designs) assert.ok(S.designs.some(e => e.c === d.c && e.p === d.p && e.w === d.w));
    for (const u of mine) assert.deepEqual(ent(u.id).d, u.d);
    assert.equal(tierDone(P, 4), 4);
    assert.equal(armorOf(ent(mine[0].id)), 6 + 2, 'Mammut con corazza composita I');
    assert.equal(S.ents.find(e => e.type === 'lab' && e.owner === P).rs.id, 'wCN75');
    assert.equal(techBlockReason(P, 'wCN75'), 'In corso.');
    assert.ok(proj.some(p => p.k === 'mortar' && p.wk === 'HW'), 'obice in volo dopo il caricamento');
    restore = seedRandom(77);
    run(20);
    restore();
    assert.ok(JSON.stringify(serialize()) === a, 'la partita ricaricata prosegue diversamente');
  } finally { restore(); }
});
