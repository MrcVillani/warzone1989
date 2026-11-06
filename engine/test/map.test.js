// Generazione della mappa: determinismo, simmetria, giacimenti e collegamento tra le basi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MW, MH, N, GROUND, DIRT, WATER, ROCK, FOREST, B0, B1, STRUCTS,
  genMap, bfsReach, newGame, terr, deposits, depIdx, onEvent,
} from '../index.js';
import { SEEDS } from './helpers.js';

const walkable = v => v === GROUND || v === DIRT;
const mirror = d => ({ x: MW - 1 - d.x, y: MH - 1 - d.y });

test('genMap è deterministica con lo stesso seme', () => {
  for (const seed of SEEDS) {
    const a = genMap(seed), b = genMap(seed);
    assert.deepEqual(a.t, b.t, `terreno diverso con il seme ${seed}`);
    assert.deepEqual(a.deps, b.deps, `giacimenti diversi con il seme ${seed}`);
  }
});

test('semi diversi danno mappe diverse', () => {
  const maps = SEEDS.map(s => Buffer.from(genMap(s).t).toString('base64'));
  assert.equal(new Set(maps).size, SEEDS.length);
});

test('il terreno ha la dimensione giusta e solo tipi validi', () => {
  for (const seed of SEEDS) {
    const { t } = genMap(seed);
    assert.equal(t.length, N);
    for (const v of t) assert.ok([GROUND, DIRT, WATER, ROCK, FOREST].includes(v));
    // La mappa non è tutta uguale: deve avere ostacoli e terreno percorribile.
    const kinds = new Set(t);
    assert.ok(kinds.has(GROUND) && kinds.size >= 3, `seme ${seed}: tipi di terreno ${[...kinds]}`);
  }
});

test('la mappa è simmetrica rispetto al centro', () => {
  for (const seed of SEEDS) {
    const { t } = genMap(seed);
    for (let i = 0; i < N; i++) if (t[i] !== t[N - 1 - i]) assert.fail(`seme ${seed}: casella ${i} diversa dalla ${N - 1 - i}`);
  }
});

test('i giacimenti sono in numero pari, speculari e su terreno percorribile', () => {
  for (const seed of SEEDS) {
    const { t, deps } = genMap(seed);
    assert.equal(deps.length % 2, 0, `seme ${seed}: ${deps.length} giacimenti`);
    assert.ok(deps.length >= 8, `seme ${seed}: solo ${deps.length} giacimenti`);
    const key = d => d.x + ',' + d.y;
    const all = new Set(deps.map(key));
    assert.equal(all.size, deps.length, `seme ${seed}: giacimenti duplicati`);
    for (const d of deps) {
      assert.ok(all.has(key(mirror(d))), `seme ${seed}: manca lo speculare di ${key(d)}`);
      assert.ok(d.x >= 0 && d.y >= 0 && d.x < MW && d.y < MH);
      assert.ok(walkable(t[d.x + d.y * MW]), `seme ${seed}: giacimento ${key(d)} su terreno ${t[d.x + d.y * MW]}`);
    }
    // Distanza minima tra giacimenti (non due pompe attaccate).
    for (let i = 0; i < deps.length; i++) for (let j = i + 1; j < deps.length; j++)
      assert.ok(Math.abs(deps[i].x - deps[j].x) + Math.abs(deps[i].y - deps[j].y) >= 3, `seme ${seed}: giacimenti troppo vicini`);
  }
});

test('le due basi sono collegate e ogni giacimento è raggiungibile da entrambe', () => {
  for (const seed of SEEDS) {
    const { t, deps } = genMap(seed);
    const r0 = bfsReach(t, B0.x, B0.y), r1 = bfsReach(t, B1.x, B1.y);
    assert.equal(r0[B1.x + B1.y * MW], 1, `seme ${seed}: basi non collegate`);
    for (const d of deps) {
      assert.equal(r0[d.x + d.y * MW], 1, `seme ${seed}: giacimento ${d.x},${d.y} irraggiungibile da B0`);
      assert.equal(r1[d.x + d.y * MW], 1, `seme ${seed}: giacimento ${d.x},${d.y} irraggiungibile da B1`);
    }
  }
});

test('il terreno sotto i due comandi è edificabile e libero da giacimenti', () => {
  const D = STRUCTS.hq;
  for (const seed of SEEDS) {
    const { t, deps } = genMap(seed);
    for (const b of [B0, B1]) for (let y = b.y - 1; y < b.y - 1 + D.h; y++) for (let x = b.x - 1; x < b.x - 1 + D.w; x++) {
      assert.ok(walkable(t[x + y * MW]), `seme ${seed}: casella ${x},${y} del comando non edificabile`);
      assert.ok(!deps.some(d => d.x === x && d.y === y), `seme ${seed}: giacimento sotto il comando`);
    }
  }
});

test('bfsReach non attraversa acqua, roccia e foresta', () => {
  const { t } = genMap(12345);
  const r = bfsReach(t, B0.x, B0.y);
  for (let i = 0; i < N; i++) if (r[i]) assert.ok(walkable(t[i]), `casella ${i} raggiunta ma non percorribile`);
});

test('proprietà della mappa su 200 semi consecutivi', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const { t, deps } = genMap(seed);
    const r0 = bfsReach(t, B0.x, B0.y);
    assert.equal(r0[B1.x + B1.y * MW], 1, `seme ${seed}: basi non collegate`);
    assert.equal(deps.length % 2, 0, `seme ${seed}`);
    for (const d of deps) assert.equal(r0[d.x + d.y * MW], 1, `seme ${seed}: giacimento irraggiungibile`);
    for (let i = 0; i < N / 2; i++) if (t[i] !== t[N - 1 - i]) assert.fail(`seme ${seed}: mappa non simmetrica`);
  }
});

test('newGame carica terreno e giacimenti del seme ed emette «world»', () => {
  const seen = [];
  const off = onEvent(t => seen.push(t));
  newGame('normale', 12345);
  off();
  const m = genMap(12345);
  assert.deepEqual(terr, m.t);
  assert.deepEqual(deposits, m.deps);
  deposits.forEach((d, i) => assert.equal(depIdx[d.x + d.y * MW], i));
  assert.equal([...depIdx].filter(v => v >= 0).length, deposits.length);
  assert.ok(seen.includes('world') && seen.includes('fog'));
});
