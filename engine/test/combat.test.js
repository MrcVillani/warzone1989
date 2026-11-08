// Danni, corazza, eliminazione, statistiche, proiettili e fine partita.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MW, TILE, P, E, B0, STRUCTS, BUILDER, CHASSIS, WEAPONS,
  S, newGame, ent, occ, proj, makeUnit, armorOf, updateFog, step, alive,
  damageAfterArmor, damage, kill, edist, nearestEnemy, fire, updProj, explodeAt,
} from '../index.js';
import { units, structs, recordEvents, run } from './helpers.js';

test('damageAfterArmor: la corazza toglie danno, ma resta almeno il 35%', () => {
  assert.equal(damageAfterArmor(10, 0), 10);
  assert.equal(damageAfterArmor(10, 2), 8);
  assert.equal(damageAfterArmor(10, 6.5), 3.5);
  assert.equal(damageAfterArmor(10, 9), 3.5);
  assert.equal(damageAfterArmor(10, 100), 3.5);
  assert.equal(damageAfterArmor(48, 4), 44);
  assert.equal(damageAfterArmor(7, 5), 7 * 0.35);
});

test('armorOf: telaio, geniere, edifici e corazza composita', () => {
  newGame('normale', 12345);
  const m = makeUnit(P, { c: 'H', p: 'T', w: 'CN' }, 400, 400);
  const [b] = units(P, u => u.builder);
  const hq = structs(P, 'hq')[0];
  assert.equal(armorOf(m), CHASSIS.H.armor);
  assert.equal(armorOf(b), BUILDER.armor);
  assert.equal(armorOf(hq), STRUCTS.hq.armor);
  S.tech[P].arm = true;
  assert.equal(armorOf(m), CHASSIS.H.armor + 2);
  assert.equal(armorOf(b), BUILDER.armor + 2);
  assert.equal(armorOf(hq), STRUCTS.hq.armor, 'la corazza composita vale solo per i mezzi');
});

test('damage toglie i punti calcolati con la corazza', () => {
  newGame('normale', 12345);
  const [t] = units(E, u => !u.builder);
  const hp = t.hp;
  damage(t, 30, P);
  assert.equal(t.hp, hp - damageAfterArmor(30, armorOf(t)));
  assert.ok(!t.dead);
  assert.ok(S.ai.alert && S.ai.alert.x === t.x, 'il nemico colpito dà l’allarme alla sua IA');
});

test('un mezzo che arriva a 0 PS viene eliminato e conteggiato', () => {
  newGame('normale', 12345);
  const [t] = units(E, u => !u.builder);
  const ev = recordEvents();
  t.hp = 5;
  damage(t, 50, P);
  ev.stop();
  assert.equal(t.dead, true);
  assert.equal(ent(t.id), undefined, 'tolto dall’indice');
  assert.equal(S.stats.kills[P], 1);
  assert.equal(S.stats.lost[E], 1);
  assert.equal(S.stats.lost[P], 0);
  assert.ok(ev.of('fx').some(f => f.k === 'boom'));
  // Un secondo colpo su un mezzo già distrutto non conta di nuovo.
  damage(t, 50, P); kill(t, P);
  assert.equal(S.stats.kills[P], 1);
  assert.equal(S.stats.lost[E], 1);
  step(0.05);
  assert.ok(!S.ents.includes(t), 'rimosso dalla lista entità al passo successivo');
});

test('un mezzo esattamente a 0 PS è eliminato', () => {
  newGame('normale', 12345);
  const [t] = units(E, u => !u.builder);
  t.hp = damageAfterArmor(10, armorOf(t));
  damage(t, 10, P);
  assert.equal(t.hp, 0);
  assert.equal(t.dead, true);
});

test('le perdite senza un uccisore nemico non contano come uccisioni', () => {
  newGame('normale', 12345);
  const [a, b] = units(E, u => !u.builder);
  kill(a, E); kill(b, null);
  assert.deepEqual(S.stats.kills, [0, 0]);
  assert.equal(S.stats.lost[E], 2);
});

test('un edificio distrutto libera le caselle e avvisa il giocatore', () => {
  newGame('normale', 12345);
  const hq = structs(P, 'hq')[0];
  const ev = recordEvents();
  damage(hq, 1e6, E);
  ev.stop();
  assert.equal(hq.dead, true);
  for (let y = hq.ty; y < hq.ty + hq.h; y++) for (let x = hq.tx; x < hq.tx + hq.w; x++) assert.equal(occ[x + y * MW], 0);
  assert.ok(ev.of('toast').some(t => t.text === 'Comando distrutto.' && t.kind === 'bad'));
  assert.equal(S.stats.kills[E], 1);
});

test('il giocatore colpito riceve un avviso con settore e ping, non più di uno ogni 12 s', () => {
  newGame('normale', 12345);
  const [u] = units(P, x => !x.builder);
  const ev = recordEvents();
  damage(u, 1, E);
  damage(u, 1, E);
  let toasts = ev.of('toast');
  assert.equal(toasts.length, 1);
  assert.match(toasts[0].text, /^Contatto nemico nel settore [A-H][1-8]\.$/);
  assert.equal(toasts[0].kind, 'bad');
  assert.equal(ev.of('ping').length, 1);
  S.time += 13;
  damage(u, 1, E);
  ev.stop();
  assert.equal(ev.of('toast').length, 2);
});

test('edist misura dal bordo: rettangolo per gli edifici, cerchio per i mezzi', () => {
  newGame('normale', 12345);
  const hq = structs(P, 'hq')[0];
  assert.equal(edist({ x: hq.x, y: hq.y }, hq), 0);
  assert.equal(edist({ x: (hq.tx + hq.w) * TILE + 10, y: hq.y }, hq), 10);
  const u = makeUnit(E, { c: 'L', p: 'W', w: 'MG' }, 1000, 1000);
  assert.equal(edist({ x: 1000 + u.rad + 20, y: 1000 }, u), 20);
  assert.equal(edist({ x: 1000, y: 1000 }, u), 0);
});

test('nearestEnemy preferisce i bersagli armati e ignora quelli nella nebbia', () => {
  newGame('normale', 12345);
  const [me] = units(P, u => !u.builder);
  const armed = makeUnit(E, { c: 'L', p: 'W', w: 'MG' }, me.x + 3 * TILE, me.y);
  const builder = makeUnit(E, null, me.x - 2.6 * TILE, me.y);
  updateFog();
  assert.equal(nearestEnemy(me, 6 * TILE), armed, 'un mezzo armato poco più lontano ha la precedenza');
  armed.x = me.x + 5 * TILE;
  assert.equal(nearestEnemy(me, 6 * TILE), builder);
  // Un nemico fuori dalla visuale non si vede (l'IA invece vede tutto).
  const far = makeUnit(E, { c: 'L', p: 'W', w: 'MG' }, 40 * TILE, 10 * TILE);
  const watcher = makeUnit(P, { c: 'L', p: 'W', w: 'RK' }, 40 * TILE, 10 * TILE + 200);
  assert.equal(nearestEnemy(watcher, 8 * TILE), null, 'senza aggiornare la nebbia il nemico non è visibile');
  updateFog();
  assert.equal(nearestEnemy(watcher, 8 * TILE), far);
  assert.ok(nearestEnemy(far, 8 * TILE), 'il nemico vede sempre');
});

test('il cannone spara un proiettile che colpisce all’arrivo', () => {
  newGame('normale', 12345);
  const [me] = units(P, u => !u.builder);
  const t = makeUnit(E, { c: 'M', p: 'W', w: 'MG' }, me.x + 4 * TILE, me.y);
  const hp = t.hp;
  fire(me.x, me.y, 0, t, WEAPONS.CN, P, 10);
  assert.equal(proj.length, 1);
  assert.equal(t.hp, hp, 'il danno arriva solo all’impatto');
  for (let i = 0; i < 40 && proj.length; i++) updProj(0.05);
  assert.equal(proj.length, 0);
  assert.equal(t.hp, hp - damageAfterArmor(WEAPONS.CN.dmg, armorOf(t)));
});

test('la mitragliatrice colpisce subito, il mortaio fa danno ad area solo ai nemici', () => {
  newGame('normale', 12345);
  const [me] = units(P, u => !u.builder);
  const t = makeUnit(E, { c: 'L', p: 'W', w: 'MG' }, me.x + 3 * TILE, me.y);
  const hp = t.hp;
  fire(me.x, me.y, 0, t, WEAPONS.MG, P, 10);
  assert.equal(t.hp, hp - WEAPONS.MG.dmg);
  const near = makeUnit(E, { c: 'L', p: 'W', w: 'MG' }, t.x + 10, t.y);
  const friend = makeUnit(P, { c: 'L', p: 'W', w: 'MG' }, t.x - 10, t.y);
  const nHp = near.hp, fHp = friend.hp;
  explodeAt(t.x, t.y, 1.3, 48, P, 1);
  assert.ok(near.hp < nHp, 'il nemico vicino subisce lo scoppio');
  assert.equal(friend.hp, fHp, 'nessun fuoco amico');
});

test('distruggere comando, fabbriche e genieri nemici fa vincere la partita', () => {
  newGame('normale', 12345);
  const ev = recordEvents();
  for (const e of S.ents.filter(e => e.owner === E && (e.builder || e.type === 'hq'))) damage(e, 1e6, P);
  assert.equal(alive(E), false);
  assert.equal(alive(P), true);
  run(1.1);
  ev.stop();
  assert.equal(S.phase, 'won');
  assert.deepEqual(ev.of('end'), [{ won: true, reason: 'destroyed' }]);
  assert.ok(ev.of('toast').some(t => t.text === 'Comando nemico distrutto.'));
  const t = S.time;
  step(0.05);
  assert.equal(S.time, t, 'a partita finita la simulazione si ferma');
});

test('un lato resta in gioco finché ha un geniere', () => {
  newGame('normale', 12345);
  damage(structs(P, 'hq')[0], 1e6, E);
  assert.equal(alive(P), true);
  for (const b of units(P, u => u.builder)) damage(b, 1e6, E);
  assert.equal(alive(P), false, 'i mezzi armati da soli non bastano');
  run(1.1);
  assert.equal(S.phase, 'lost');
});
