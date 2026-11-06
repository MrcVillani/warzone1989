// Passabilità e percorsi A*.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MW, MH, TILE, P, E, WATER, B0, newGame, terr, occ, passable, findPath, nearestFree, formation, makeUnit, S,
} from '../index.js';
import { SEEDS, units, tileOf, run } from './helpers.js';

// Controlla che un percorso sia fatto di passi adiacenti, su caselle percorribili, senza tagliare gli angoli.
function assertValidPath(path, sx, sy, water) {
  let [px, py] = [sx, sy];
  for (const [x, y] of path) {
    const dx = x - px, dy = y - py;
    assert.ok(Math.max(Math.abs(dx), Math.abs(dy)) === 1, `salto da ${px},${py} a ${x},${y}`);
    assert.ok(passable(x, y, water), `casella ${x},${y} non percorribile`);
    if (dx && dy) assert.ok(passable(px + dx, py, water) && passable(px, py + dy, water), `angolo tagliato in ${x},${y}`);
    px = x; py = y;
  }
}

// Casella d'acqua raggiungibile in hovercraft da (sx, sy), la più vicina in passi.
function reachableWater(sx, sy) {
  const seen = new Uint8Array(MW * MH), q = [[sx, sy]]; seen[sx + sy * MW] = 1;
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = nx + ny * MW;
      if (!passable(nx, ny, true) || seen[k]) continue;
      seen[k] = 1;
      if (terr[k] === WATER) return [nx, ny];
      q.push([nx, ny]);
    }
  }
  return null;
}

test('findPath collega le due basi dopo newGame', () => {
  for (const seed of SEEDS) {
    newGame('normale', seed);
    const a = units(P, u => u.builder)[0], b = units(E, u => u.builder)[0];
    const [sx, sy] = tileOf(a), [gx, gy] = tileOf(b);
    const path = findPath(sx, sy, gx, gy, false);
    assert.ok(path && path.length > 20, `seme ${seed}: nessun percorso tra le basi`);
    assert.deepEqual(path[path.length - 1], [gx, gy], `seme ${seed}: il percorso non arriva alla meta`);
    assertValidPath(path, sx, sy, false);
  }
});

test('findPath è simmetrico tra le due basi (stessa lunghezza nei due sensi)', () => {
  newGame('normale', 12345);
  const [sx, sy] = tileOf(units(P, u => u.builder)[0]);
  const gx = MW - 1 - sx, gy = MH - 1 - sy;
  const ab = findPath(sx, sy, gx, gy, false), ba = findPath(gx, gy, sx, sy, false);
  assert.equal(ab.length, ba.length);
});

test('passable rifiuta bordi, edifici e terreno non percorribile', () => {
  newGame('normale', 12345);
  assert.equal(passable(-1, 0, false), false);
  assert.equal(passable(0, MH, false), false);
  assert.equal(passable(MW, 5, true), false);
  assert.equal(passable(B0.x, B0.y, false), false, 'il comando occupa la casella');
  assert.ok(occ[B0.x + B0.y * MW] > 0);
  for (let i = 0; i < MW * MH; i++) {
    const x = i % MW, y = (i / MW) | 0;
    if (terr[i] === WATER && !occ[i]) {
      assert.equal(passable(x, y, false), false);
      assert.equal(passable(x, y, true), true);
    }
  }
});

test('findPath sulla stessa casella restituisce un percorso vuoto', () => {
  newGame('normale', 12345);
  const [sx, sy] = tileOf(units(P, u => u.builder)[0]);
  assert.deepEqual(findPath(sx, sy, sx, sy, false), []);
});

test('una meta occupata porta alla casella libera più vicina', () => {
  newGame('normale', 12345);
  const [sx, sy] = tileOf(units(P, u => u.builder)[0]);
  const ex = MW - 1 - B0.x, ey = MH - 1 - B0.y; // centro del comando nemico
  const path = findPath(sx, sy, ex, ey, false);
  assert.ok(path && path.length);
  const [lx, ly] = path[path.length - 1];
  assert.ok(passable(lx, ly, false));
  assert.ok(Math.max(Math.abs(lx - ex), Math.abs(ly - ey)) <= 3, `si ferma lontano dal comando: ${lx},${ly}`);
  assertValidPath(path, sx, sy, false);
});

test('gli hovercraft usano l’acqua, i mezzi di terra no', () => {
  let found = false;
  for (const seed of SEEDS) {
    newGame('normale', seed);
    const [sx, sy] = tileOf(units(P, u => u.builder)[0]);
    const goal = reachableWater(sx, sy);
    if (!goal) continue;
    found = true;
    const hover = findPath(sx, sy, goal[0], goal[1], true);
    assert.deepEqual(hover[hover.length - 1], goal, `seme ${seed}: l’hovercraft non arriva sull’acqua`);
    assert.ok(hover.some(([x, y]) => terr[x + y * MW] === WATER));
    assertValidPath(hover, sx, sy, true);
    const land = findPath(sx, sy, goal[0], goal[1], false);
    assert.ok(land, `seme ${seed}`);
    for (const [x, y] of land) assert.notEqual(terr[x + y * MW], WATER, `seme ${seed}: mezzo di terra in acqua`);
    assertValidPath(land, sx, sy, false);
  }
  assert.ok(found, 'nessun seme con acqua raggiungibile: il test non prova niente');
});

test('un hovercraft in gioco attraversa l’acqua fino alla meta', () => {
  newGame('normale', 12345);
  const [sx, sy] = tileOf(units(P, u => u.builder)[0]);
  const goal = reachableWater(sx, sy);
  assert.ok(goal, 'il seme 12345 deve avere acqua raggiungibile');
  const u = makeUnit(P, { c: 'L', p: 'V', w: 'MG' }, (sx + 0.5) * TILE, (sy + 0.5) * TILE);
  assert.equal(u.water, true);
  const path = findPath(sx, sy, goal[0], goal[1], true);
  assert.deepEqual(path[path.length - 1], goal);
  u.order = { t: 'move', x: (goal[0] + 0.5) * TILE, y: (goal[1] + 0.5) * TILE };
  u.path = path; u.pi = 0;
  run(30, 0.05, () => u.order.t === 'idle');
  assert.deepEqual(tileOf(u), goal, 'l’hovercraft non è arrivato sull’acqua');
  assert.ok(S.ents.includes(u));
});

test('nearestFree e formation restituiscono caselle libere e distinte', () => {
  newGame('normale', 12345);
  const f = nearestFree(B0.x, B0.y, false);
  assert.ok(f && passable(f[0], f[1], false));
  assert.ok(Math.max(Math.abs(f[0] - B0.x), Math.abs(f[1] - B0.y)) === 2, 'appena fuori dal comando 3×3');
  const tiles = formation(B0.x + 4, B0.y + 4, 9, false);
  assert.equal(tiles.length, 9);
  assert.equal(new Set(tiles.map(([x, y]) => x + y * MW)).size, 9);
  for (const [x, y] of tiles) assert.ok(passable(x, y, false));
});
