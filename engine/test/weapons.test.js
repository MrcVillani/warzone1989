// Fase B del piano 02: armi nuove (mitragliatrice pesante, lanciafiamme, modulo riparazione, missile anticarro, obice,
// lanciarazzi multiplo), bunker pesante, limite di 100 mezzi, statistiche dei progetti nuovi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TILE, MW, GROUND, P, E, B0, B1, WEAPONS, STRUCTS, BUNKER_W, UNIT_CAP, TOWER_CN,
  S, newGame, makeUnit, makeStruct, dStats, armorOf, hitDamage, damageAfterArmor, fire, proj, updProj,
  nearestEnemy, placeStruct, enqueue, unitCount, cmdAttack, passable, occ, terr,
} from '../index.js';
import { findSpot, recordEvents, run, seedRandom } from './helpers.js';

// Campo di prova: spiana a terreno libero un rettangolo lontano dalle basi (caselle da cx-8 a cx+12, da cy-8 a cy+8)
// e ne restituisce il centro in pixel. Va chiamata dopo newGame (che rigenera la mappa).
function openArea(cx = 28, cy = 22) {
  for (let y = cy - 8; y <= cy + 8; y++) for (let x = cx - 8; x <= cx + 12; x++) {
    assert.equal(occ[x + y * MW], 0, 'il campo di prova deve essere libero da edifici');
    if (!passable(x, y, false)) terr[x + y * MW] = GROUND;
  }
  return [(cx + 0.5) * TILE, (cy + 0.5) * TILE];
}
// Bersaglio nemico che non attacca (modulo riparazione) e che l'IA non comanda (role 'test'), con punti enormi.
function dummy(x, y, c = 'L', p = 'W') {
  const t = makeUnit(E, { c, p, w: 'RP' }, x, y);
  t.hp = t.max = 1e6; t.role = 'test';
  return t;
}
function firstHit(target, seconds = 8) {
  const hp0 = target.hp;
  run(seconds, 0.05, () => target.hp < hp0);
  assert.ok(target.hp < hp0, 'il bersaglio non è stato colpito');
  return hp0 - target.hp;
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

/* ---------- regole del danno ---------- */

test('hitDamage: corazza dimezzata per la fiamma, +50% contro edifici, anticarro più forte sui corazzati', () => {
  newGame('normale', 12345);
  const [x, y] = openArea();
  const L = makeUnit(E, { c: 'L', p: 'W', w: 'MG' }, x, y);
  const H = makeUnit(E, { c: 'H', p: 'W', w: 'MG' }, x + 2 * TILE, y);
  const X = makeUnit(E, { c: 'X', p: 'W', w: 'MG' }, x + 4 * TILE, y);
  const [tx, ty] = findSpot(E, 'tower', B1.x, B1.y - 5);
  const tower = makeStruct('tower', E, tx, ty, true);
  assert.equal(armorOf(X), 6);
  // Senza arma: la regola di sempre.
  assert.equal(hitDamage(H, 15), damageAfterArmor(15, 4));
  // Fiamma: corazza contata a metà; contro gli edifici ×1,5.
  assert.equal(hitDamage(H, 15, WEAPONS.FL), 13);
  assert.equal(hitDamage(H, 15, WEAPONS.MG), 11);
  assert.equal(hitDamage(tower, 15, WEAPONS.FL), damageAfterArmor(22.5, 2.5));
  assert.equal(hitDamage(tower, 15, WEAPONS.MG), damageAfterArmor(15, 5));
  // Anticarro: +10% per punto di corazza, poi la corazza.
  assert.ok(near(hitDamage(L, 130, WEAPONS.AT), 130));
  assert.ok(near(hitDamage(H, 130, WEAPONS.AT), damageAfterArmor(130 * 1.4, 4)));
  assert.ok(near(hitDamage(X, 130, WEAPONS.AT), damageAfterArmor(130 * 1.6, 6)));
  assert.ok(hitDamage(X, 130, WEAPONS.AT) > hitDamage(L, 130, WEAPONS.AT), 'contro il Mammut fa più danno che contro il Gheppio');
  // Il cannone, a parità di danno, fa meno contro il Mammut.
  assert.ok(hitDamage(X, 130, WEAPONS.CN105) < hitDamage(L, 130, WEAPONS.CN105));
  // La corazza composita del bersaglio aumenta anche il bonus anticarro.
  S.tech[E].arm = true;
  assert.ok(near(hitDamage(X, 130, WEAPONS.AT), damageAfterArmor(130 * 1.8, 8)));
});

/* ---------- lanciafiamme ---------- */

test('lanciafiamme: colpo immediato ad area sui soli nemici, fx flame, corazza dimezzata', () => {
  newGame('normale', 12345);
  const [x, y] = openArea();
  const t = dummy(x + 2 * TILE, y, 'H');
  const t2 = dummy(t.x, t.y + 0.6 * TILE, 'H'); // dentro l'area (0,9 caselle)
  const far = dummy(t.x, t.y + 2.5 * TILE, 'H'); // fuori dall'area
  const friend = makeUnit(P, { c: 'L', p: 'W', w: 'RP' }, t.x - 0.5 * TILE, t.y);
  const hp = [t, t2, far, friend].map(u => u.hp);
  const ev = recordEvents();
  fire(x, y, 0, t, WEAPONS.FL, P, 10);
  ev.stop();
  assert.equal(proj.length, 0, 'la fiamma non lascia proiettili');
  assert.equal(hp[0] - t.hp, 13, 'bersaglio: 15 di danno, corazza 4 contata come 2');
  assert.ok(t2.hp < hp[1] && hp[1] - t2.hp < 13, 'il vicino prende meno danno del centro');
  assert.equal(far.hp, hp[2], 'fuori dall’area nessun danno');
  assert.equal(friend.hp, hp[3], 'nessun fuoco amico');
  const fl = ev.of('fx').filter(f => f.k === 'flame');
  assert.equal(fl.length, 1);
  assert.equal(fl[0].owner, P);
  assert.equal(fl[0].r, WEAPONS.FL.splash * TILE);
  assert.ok(ev.of('fx').some(f => f.k === 'flash' && f.w === 'FL'));
});

test('lanciafiamme: +50% contro gli edifici e ricerche di fiamma', () => {
  newGame('normale', 12345);
  const [tx, ty] = findSpot(E, 'tower', B1.x, B1.y - 5);
  const tower = makeStruct('tower', E, tx, ty, true);
  let hp = tower.hp;
  fire(tower.x - 2 * TILE, tower.y, 0, tower, WEAPONS.FL, P, 10);
  assert.ok(near(hp - tower.hp, 22.5 - 2.5), `tolti ${hp - tower.hp}`);
  S.tech[P].dFL1 = true;
  hp = tower.hp;
  fire(tower.x - 2 * TILE, tower.y, 0, tower, WEAPONS.FL, P, 10);
  assert.ok(near(hp - tower.hp, 15 * 1.2 * 1.5 - 2.5), `con dFL1 tolti ${hp - tower.hp}`);
});

test('lanciafiamme in partita: il mezzo si avvicina e brucia due nemici vicini con un getto', () => {
  const restore = seedRandom(4);
  try {
    newGame('normale', 12345);
    const [x, y] = openArea();
    makeUnit(P, { c: 'L', p: 'W', w: 'FL' }, x, y);
    const a = dummy(x + 4 * TILE, y), b = dummy(x + 4 * TILE, y + 0.5 * TILE);
    run(10, 0.05, () => a.hp < a.max && b.hp < b.max);
    assert.ok(a.hp < a.max && b.hp < b.max, 'il getto non ha preso entrambi');
  } finally { restore(); }
});

/* ---------- modulo riparazione ---------- */

test('modulo riparazione: cura il più danneggiato in proporzione entro 3 caselle, non se stesso né edifici', () => {
  const restore = seedRandom(5);
  try {
    newGame('normale', 12345);
    const [x, y] = openArea();
    const rep = makeUnit(P, { c: 'M', p: 'W', w: 'RP' }, x, y);
    rep.hp = rep.max * 0.05; // più danneggiato di tutti, ma non si ripara da solo
    const big = makeUnit(P, { c: 'X', p: 'TR', w: 'MG' }, x + 2 * TILE, y);
    big.hp = big.max * 0.3; // perde più punti, ma in proporzione sta meglio
    const small = makeUnit(P, { c: 'L', p: 'W', w: 'MG' }, x, y + 2 * TILE);
    small.hp = small.max * 0.1; // il più danneggiato in proporzione entro la portata (anche dopo 1 s di cure)
    const out = makeUnit(P, { c: 'L', p: 'W', w: 'MG' }, x - 5 * TILE, y);
    out.hp = out.max * 0.05; // danneggiato quanto il riparatore, ma fuori portata
    const [sx, sy] = [Math.floor(x / TILE), Math.floor(y / TILE) - 2];
    const tw = makeStruct('tower', P, sx, sy, true);
    tw.hp = tw.max * 0.5;
    const hp = [rep, big, small, out, tw].map(e => e.hp);
    run(1);
    assert.ok(near(small.hp - hp[2], WEAPONS.RP.heal * 1, 0.05 * 15 + 1e-6), `riparati ${(small.hp - hp[2]).toFixed(2)} invece di 15`);
    assert.equal(big.hp, hp[1], 'non il più danneggiato in proporzione');
    assert.equal(rep.hp, hp[0], 'il riparatore non si ripara da solo');
    assert.equal(out.hp, hp[3], 'fuori dalle 3 caselle');
    assert.equal(tw.hp, hp[4], 'gli edifici non si riparano col modulo');
    assert.equal(rep.tgt, small.id);
  } finally { restore(); }
});

test('modulo riparazione: non supera il massimo e passa al successivo', () => {
  const restore = seedRandom(5);
  try {
    newGame('normale', 12345);
    const [x, y] = openArea();
    makeUnit(P, { c: 'M', p: 'W', w: 'RP' }, x, y);
    const a = makeUnit(P, { c: 'L', p: 'W', w: 'MG' }, x + 2 * TILE, y);
    const b = makeUnit(P, { c: 'L', p: 'W', w: 'MG' }, x, y + 2 * TILE);
    a.hp = a.max - 5;
    b.hp = b.max - 3; // meno danneggiato: tocca a lui dopo a
    run(3);
    assert.equal(a.hp, a.max);
    assert.equal(b.hp, b.max);
    // A tutti pieni il riparatore non ha bersaglio.
    run(1);
    assert.ok(S.ents.every(e => e.hp <= e.max));
  } finally { restore(); }
});

test('modulo riparazione: non attacca e non cura i nemici vicini', () => {
  const restore = seedRandom(5);
  try {
    newGame('normale', 12345);
    const [x, y] = openArea();
    const rep = makeUnit(P, { c: 'M', p: 'W', w: 'RP' }, x, y);
    const foe = dummy(x + 2 * TILE, y);
    foe.hp = foe.max / 2;
    assert.equal(dStats(rep.d, P).dps, 0);
    const ev = recordEvents();
    run(3);
    ev.stop();
    assert.equal(foe.hp, foe.max / 2, 'il nemico non viene né colpito né riparato');
    assert.notEqual(rep.tgt, foe.id);
    assert.equal(ev.of('fx').filter(f => f.owner === P && (f.k === 'flash' || f.k === 'repair')).length, 0);
  } finally { restore(); }
});

test('modulo riparazione: un ordine di attacco lo rimette fermo senza curare il nemico', () => {
  const restore = seedRandom(5);
  try {
    newGame('normale', 12345);
    const [x, y] = openArea();
    const rep = makeUnit(P, { c: 'M', p: 'W', w: 'RP' }, x, y);
    const foe = dummy(x + 2 * TILE, y);
    foe.hp = foe.max / 2;
    run(1);
    const ev = recordEvents();
    cmdAttack([rep], foe);
    run(2);
    ev.stop();
    assert.equal(rep.order.t, 'idle', 'il riparatore non esegue attacchi');
    assert.equal(foe.hp, foe.max / 2, 'il nemico indicato con l’ordine di attacco è stato riparato');
    assert.equal(ev.of('fx').filter(f => f.owner === P && f.k === 'repair').length, 0, 'raggio di riparazione verso il nemico');
  } finally { restore(); }
});

/* ---------- missile anticarro ---------- */

test('missile anticarro: proiettile missile, al colpo più danno contro il Mammut che contro il Gheppio', () => {
  const hits = {};
  for (const c of ['L', 'X']) {
    const restore = seedRandom(6);
    try {
      newGame('normale', 12345);
      const [x, y] = openArea();
      makeUnit(P, { c: 'L', p: 'W', w: 'AT' }, x, y);
      const t = dummy(x + 5 * TILE, y, c);
      let missile = false;
      run(8, 0.05, () => { if (proj.some(p => p.k === 'missile' && p.wk === 'AT')) missile = true; return t.hp < t.max; });
      assert.ok(missile, 'nessun missile in volo');
      hits[c] = t.max - t.hp;
    } finally { restore(); }
  }
  assert.ok(near(hits.L, 130), `Gheppio: ${hits.L}`);
  assert.ok(near(hits.X, damageAfterArmor(130 * 1.6, 6)), `Mammut: ${hits.X}`);
  assert.ok(hits.X > hits.L);
});

/* ---------- obice ---------- */

test('obice: non spara sotto 3,5 caselle, spara più lontano', () => {
  const restore = seedRandom(8);
  try {
    newGame('normale', 12345);
    const [x, y] = openArea();
    const u = makeUnit(P, { c: 'H', p: 'T', w: 'HW' }, x, y);
    const close = dummy(x + 2 * TILE, y);
    run(1);
    assert.equal(nearestEnemy(u, WEAPONS.HW.range * TILE, WEAPONS.HW.minRange), null, 'il nemico troppo vicino non è un bersaglio');
    assert.equal(nearestEnemy(u, WEAPONS.HW.range * TILE, 0), close, 'senza minimo lo sarebbe');
    const ev = recordEvents();
    run(8);
    assert.equal(ev.of('fx').filter(f => f.k === 'flash' && f.owner === P).length, 0, 'ha sparato sotto il minimo');
    assert.equal(close.hp, close.max);
    // Il nemico si sposta a 5,5 caselle: ora l'obice spara.
    close.x = x + 5.5 * TILE;
    run(10, 0.05, () => ev.of('fx').some(f => f.k === 'flash' && f.owner === P));
    ev.stop();
    assert.ok(ev.of('fx').some(f => f.k === 'flash' && f.owner === P && f.w === 'HW'), 'l’obice non ha sparato a 5,5 caselle');
  } finally { restore(); }
});

test('obice: tiro a parabola con area di 2 caselle e scoppio grande', () => {
  const restore = seedRandom(9);
  try {
    newGame('normale', 12345);
    const [x, y] = openArea();
    const t = dummy(x + 8 * TILE, y);
    const side = dummy(t.x, t.y + 1.5 * TILE);
    const far = dummy(t.x, t.y + 3.5 * TILE);
    fire(x, y, 0, t, WEAPONS.HW, P, 12);
    assert.equal(proj.length, 1);
    const p = proj[0];
    assert.equal(p.k, 'mortar'); assert.equal(p.splash, 2); assert.equal(p.bs, 1.6); assert.equal(p.wk, 'HW');
    const ev = recordEvents();
    for (let i = 0; i < 100 && proj.length; i++) updProj(0.05);
    ev.stop();
    assert.equal(proj.length, 0);
    assert.ok(t.hp < t.max && side.hp < side.max, 'l’area di 2 caselle prende anche il vicino a 1,5');
    assert.equal(far.hp, far.max);
    assert.ok(ev.of('fx').some(f => f.k === 'boom' && f.kind === 'shot' && f.size === 1.6));
    // Il mortaio ha l'area più piccola e lo scoppio normale.
    fire(x, y, 0, t, WEAPONS.MO, P, 12);
    assert.equal(proj[0].bs, 1.1); assert.equal(proj[0].splash, WEAPONS.MO.splash);
    proj.length = 0;
  } finally { restore(); }
});

/* ---------- lanciarazzi multiplo ---------- */

test('lanciarazzi multiplo: salva di 6 razzi, il danno totale è diviso fra i razzi', () => {
  newGame('normale', 12345);
  const [x, y] = openArea();
  const t = dummy(x + 6 * TILE, y);
  fire(x, y, 0, t, WEAPONS.MRL, P, 12);
  assert.equal(proj.length, 6);
  for (const p of proj) { assert.equal(p.k, 'rocket'); assert.equal(p.wk, 'MRL'); assert.equal(p.splash, WEAPONS.MRL.splash); }
  assert.ok(near(proj.reduce((a, p) => a + p.dmg, 0), WEAPONS.MRL.dmg));
  proj.length = 0;
  // Con le ricerche di razzi il totale cresce del 20% per grado.
  S.tech[P].dRK1 = S.tech[P].dRK2 = true;
  fire(x, y, 0, t, WEAPONS.MRL, P, 12);
  assert.ok(near(proj.reduce((a, p) => a + p.dmg, 0), WEAPONS.MRL.dmg * 1.4));
  proj.length = 0;
  // La razziera resta a 2 razzi.
  fire(x, y, 0, t, WEAPONS.RK, P, 12);
  assert.equal(proj.length, 2);
  proj.length = 0;
  // A segno: il bersaglio prende danno, mai più del totale della salva.
  fire(x, y, 0, t, WEAPONS.MRL, P, 12);
  for (let i = 0; i < 100 && proj.length; i++) updProj(0.05);
  assert.equal(proj.length, 0);
  const got = t.max - t.hp;
  assert.ok(got > 0 && got <= WEAPONS.MRL.dmg * 1.4 + 1e-6, `danno ${got}`);
});

/* ---------- mitragliatrice pesante ---------- */

test('mitragliatrice pesante: più danno al colpo, al secondo e più gittata della binata', () => {
  const hit = {};
  for (const w of ['MG', 'HMG']) {
    const restore = seedRandom(10);
    try {
      newGame('normale', 12345);
      const [x, y] = openArea();
      makeUnit(P, { c: 'L', p: 'W', w }, x, y);
      hit[w] = firstHit(dummy(x + 3 * TILE, y));
    } finally { restore(); }
  }
  assert.equal(hit.MG, WEAPONS.MG.dmg);
  assert.equal(hit.HMG, WEAPONS.HMG.dmg);
  const st = w => dStats({ c: 'L', p: 'W', w });
  assert.ok(st('HMG').dps > st('MG').dps);
  assert.ok(st('HMG').range > st('MG').range);
  // Le ricerche delle mitragliatrici valgono anche per la pesante.
  newGame('normale', 12345);
  S.tech[P].dMG1 = true;
  assert.ok(near(dStats({ c: 'L', p: 'W', w: 'HMG' }, P).dps, WEAPONS.HMG.dmg * 1.2 / WEAPONS.HMG.rof));
});

/* ---------- bunker ---------- */

test('bunker: si piazza solo con la ricerca stBK e costa 320', () => {
  newGame('normale', 12345);
  const [x, y] = findSpot(P, 'bunker', B0.x + 3, B0.y + 3);
  assert.equal(placeStruct(P, 'bunker', x, y), null);
  assert.equal(S.res[P], 600);
  S.tech[P].stBK = true;
  const ev = recordEvents();
  const b = placeStruct(P, 'bunker', x, y);
  ev.stop();
  assert.ok(b);
  assert.equal(b.type, 'bunker');
  assert.equal(S.res[P], 600 - STRUCTS.bunker.cost);
  assert.deepEqual(ev.of('placed'), [{ owner: P, id: b.id, type: 'bunker' }]);
  assert.equal(armorOf(b), 8);
  assert.equal(b.max, 1800);
});

test('bunker: spara con il cannone 75 anche se le torrette hanno un’altra arma', () => {
  const restore = seedRandom(11);
  try {
    newGame('normale', 12345);
    S.tech[P].twCN = true; // le torrette passano al cannone 40, il bunker no
    const [x, y] = findSpot(P, 'bunker', 24, 24);
    const bk = makeStruct('bunker', P, x, y, true);
    const t = dummy(bk.x + 5 * TILE, bk.y);
    const ev = recordEvents();
    const hit = firstHit(t);
    ev.stop();
    assert.ok(near(hit, BUNKER_W.dmg), `danno ${hit}`);
    assert.ok(BUNKER_W.dmg !== TOWER_CN.dmg);
    const shots = ev.of('fx').filter(f => f.k === 'flash' && f.owner === P);
    assert.ok(shots.length > 0);
    for (const f of shots) assert.equal(f.w, 'CN75');
    // Un bunker non finito non spara.
    newGame('normale', 12345);
    const [x2, y2] = findSpot(P, 'bunker', 24, 24);
    const half = makeStruct('bunker', P, x2, y2, false);
    const t2 = dummy(half.x + 5 * TILE, half.y);
    run(5);
    assert.equal(t2.hp, t2.max);
  } finally { restore(); }
});

/* ---------- limite di mezzi ---------- */

test('UNIT_CAP 100: la fabbrica produce fino al limite (code comprese), poi rifiuta', () => {
  assert.equal(UNIT_CAP, 100);
  for (const o of [P, E]) {
    newGame('normale', 12345);
    const [fx, fy] = o === P ? findSpot(P, 'factory', B0.x + 4, B0.y + 2) : findSpot(E, 'factory', B1.x - 6, B1.y - 3);
    const f = makeStruct('factory', o, fx, fy, true);
    S.res[o] = 1e6;
    const [x, y] = openArea();
    while (unitCount(o) < UNIT_CAP - 2) makeUnit(o, { c: 'L', p: 'W', w: 'MG' }, x, y);
    const d = { c: 'X', p: 'TR', w: 'CN105' };
    assert.equal(enqueue(f, d, o), true);
    assert.equal(enqueue(f, d, o), true);
    assert.equal(unitCount(o), UNIT_CAP);
    const ev = recordEvents();
    const before = S.res[o];
    assert.equal(enqueue(f, d, o), false, 'oltre il limite');
    ev.stop();
    assert.equal(S.res[o], before);
    assert.equal(ev.of('toast').length, o === P ? 1 : 0, 'l’avviso è solo per il giocatore');
  }
});

/* ---------- statistiche dei progetti ---------- */

test('dStats: Mammut con Cingoli rinforzati e riparatore', () => {
  newGame('normale', 12345);
  const m = dStats({ c: 'X', p: 'TR', w: 'CN105' });
  assert.equal(m.hp, Math.round(800 * 1.8));
  assert.equal(m.armor, 6);
  assert.equal(m.cost, 220 + 90 + 110);
  assert.equal(m.time, Math.round(5 + 420 / 14));
  assert.ok(near(m.speed, 62 * 0.58 * (1.12 - 0.12 * 4)));
  assert.ok(near(m.dps, 120 / 2.6));
  assert.equal(m.range, 7);
  assert.equal(m.hps, 0);
  // Il Mammut su cingoli rinforzati è il mezzo più resistente e più lento di tutti.
  for (const c of ['L', 'M', 'H']) for (const p of ['W', 'HT', 'T', 'V']) {
    const s = dStats({ c, p, w: 'CN105' });
    assert.ok(s.hp < m.hp && s.speed > m.speed, `${c}/${p}`);
  }
  const r = dStats({ c: 'L', p: 'W', w: 'RP' });
  assert.equal(r.dps, 0);
  assert.equal(r.hps, 15);
  assert.equal(r.range, 3);
  // Con le ricerche del lato: corazza e velocità; il danno al secondo del riparatore resta 0.
  S.tech[P].arm = S.tech[P].mot1 = S.tech[P].dCN1 = true;
  const m2 = dStats({ c: 'X', p: 'TR', w: 'CN105' }, P);
  assert.equal(m2.armor, 8);
  assert.ok(near(m2.speed, m.speed * 1.1));
  assert.ok(near(m2.dps, m.dps * 1.2));
  assert.equal(dStats({ c: 'L', p: 'W', w: 'RP' }, P).dps, 0);
  // Un mezzo prodotto ha i punti del progetto.
  const [x, y] = openArea();
  const u = makeUnit(P, { c: 'X', p: 'TR', w: 'CN105' }, x, y);
  assert.equal(u.max, m.hp);
  assert.equal(armorOf(u), 8);
});
