// Coerenza dei dati di bilanciamento e calcolo delle statistiche dei progetti.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHASSIS, PROPS, WEAPONS, STRUCTS, TECH, TECH_BY, AI_TECH, DIFF, BUILD_ORDER, BUILDER, TOWER_MG, TOWER_CN,
  P, E, S, newGame, dStats, designName, gridRef, mulberry32, damageAfterArmor,
} from '../index.js';

const parts = { CHASSIS, PROPS, WEAPONS };

test('ogni requisito di ricerca di parti ed edifici esiste', () => {
  for (const [group, table] of Object.entries({ ...parts, STRUCTS }))
    for (const [k, v] of Object.entries(table))
      if (v.req) assert.ok(TECH_BY[v.req], `${group}.${k} richiede ${v.req}, che non esiste`);
});

test('ogni ricerca ha id unico e requisiti esistenti, senza cicli', () => {
  assert.equal(new Set(TECH.map(t => t.id)).size, TECH.length);
  for (const t of TECH) for (const r of t.req) {
    assert.ok(TECH_BY[r], `${t.id} richiede ${r}, che non esiste`);
    assert.notEqual(r, t.id);
  }
  // Ordine topologico: ogni ricerca deve diventare disponibile partendo da zero.
  const done = new Set();
  let progress = true;
  while (progress) {
    progress = false;
    for (const t of TECH) if (!done.has(t.id) && t.req.every(r => done.has(r))) { done.add(t.id); progress = true; }
  }
  assert.equal(done.size, TECH.length, 'alcune ricerche non sono mai raggiungibili');
});

test('ogni parte bloccata è sbloccata da una ricerca, e quelle iniziali sono libere', () => {
  for (const table of Object.values(parts)) {
    const free = Object.values(table).filter(v => !v.req);
    assert.ok(free.length >= 1, 'serve almeno una parte disponibile dall’inizio');
  }
  const g = newGame('normale', 1);
  for (const d of g.designs) {
    assert.equal(CHASSIS[d.c].req, null);
    assert.equal(PROPS[d.p].req, null);
    assert.equal(WEAPONS[d.w].req, null);
  }
  // Le parti con req sono tutte raggiungibili dalle ricerche.
  const unlocked = new Set(TECH.map(t => t.id));
  for (const table of Object.values(parts)) for (const v of Object.values(table)) if (v.req) assert.ok(unlocked.has(v.req));
});

test('le ricerche dell’IA esistono e non si ripetono', () => {
  assert.equal(new Set(AI_TECH).size, AI_TECH.length);
  for (const id of AI_TECH) assert.ok(TECH_BY[id], id);
});

test('costi, tempi e punti struttura sono positivi', () => {
  for (const table of Object.values(parts)) for (const [k, v] of Object.entries(table)) {
    assert.ok(Number.isFinite(v.cost) && v.cost > 0, `${k}.cost`);
  }
  for (const v of Object.values(CHASSIS)) assert.ok(v.hp > 0 && v.armor >= 0);
  for (const v of Object.values(PROPS)) assert.ok(v.speed > 0 && v.hpm > 0);
  for (const v of Object.values(WEAPONS)) assert.ok(v.dmg > 0 && v.rof > 0 && v.range > 0);
  for (const [k, v] of Object.entries(STRUCTS)) {
    assert.ok(v.hp > 0 && v.time > 0 && v.w > 0 && v.h > 0 && v.sight > 0, k);
    if (k === 'hq') assert.equal(v.cost, 0); else assert.ok(v.cost > 0, `${k}.cost`);
  }
  for (const t of TECH) assert.ok(t.cost > 0 && t.time > 0, t.id);
  assert.ok(BUILDER.cost > 0 && BUILDER.time > 0 && BUILDER.hp > 0 && BUILDER.speed > 0);
});

test('l’ordine del menu Costruisci contiene solo edifici costruibili', () => {
  for (const t of BUILD_ORDER) { assert.ok(STRUCTS[t], t); assert.notEqual(t, 'hq'); }
  assert.equal(new Set(BUILD_ORDER).size, BUILD_ORDER.length);
});

test('le difficoltà crescono in modo coerente', () => {
  const { facile: f, normale: n, difficile: d } = DIFF;
  assert.ok(f.first > n.first && n.first > d.first, 'primo attacco più presto salendo di livello');
  assert.ok(f.gap > n.gap && n.gap > d.gap);
  assert.ok(f.inc < n.inc && n.inc < d.inc);
  assert.ok(f.rs > n.rs && n.rs > d.rs);
  for (const v of [f, n, d]) assert.ok(v.w0 > 0 && v.wmax >= v.w0);
});

test('dStats: costo = telaio + propulsione + arma, per ogni combinazione', () => {
  for (const c of Object.keys(CHASSIS)) for (const p of Object.keys(PROPS)) for (const w of Object.keys(WEAPONS)) {
    const st = dStats({ c, p, w });
    const cost = CHASSIS[c].cost + PROPS[p].cost + WEAPONS[w].cost;
    assert.equal(st.cost, cost, `${c}/${p}/${w}`);
    assert.equal(st.time, Math.round(5 + cost / 14));
    assert.equal(st.hp, Math.round(CHASSIS[c].hp * PROPS[p].hpm));
    assert.equal(st.armor, CHASSIS[c].armor);
    assert.equal(st.range, WEAPONS[w].range);
    assert.ok(Math.abs(st.dps - WEAPONS[w].dmg / WEAPONS[w].rof) < 1e-9);
    assert.ok(st.speed > 0);
  }
});

test('dStats: i telai più pesanti sono più lenti, la corazza composita aggiunge 2', () => {
  const sp = c => dStats({ c, p: 'W', w: 'MG' }).speed;
  assert.ok(sp('L') > sp('M') && sp('M') > sp('H'));
  newGame('normale', 1);
  const d = { c: 'M', p: 'W', w: 'MG' };
  assert.equal(dStats(d, P).armor, 2);
  S.tech[P].arm = true;
  assert.equal(dStats(d, P).armor, 4);
  assert.equal(dStats(d, E).armor, 2, 'la ricerca del giocatore non vale per il nemico');
});

test('designName compone telaio, arma e propulsione', () => {
  assert.equal(designName({ c: 'L', p: 'W', w: 'MG' }), 'Gheppio MG Ruote');
});

test('le torrette derivano dalle armi senza modificarle', () => {
  assert.equal(WEAPONS.MG.range, 4.5);
  assert.equal(WEAPONS.CN.dmg, 38);
  assert.ok(TOWER_MG.range > WEAPONS.MG.range && TOWER_CN.range > WEAPONS.CN.range);
  assert.equal(TOWER_CN.proj, 'shell');
});

test('gridRef copre la carta da A1 a H8 e non esce dai bordi', () => {
  assert.equal(gridRef(0, 0), 'A1');
  assert.equal(gridRef(63, 63), 'H8');
  assert.equal(gridRef(8, 15), 'B2');
  assert.equal(gridRef(-5, 200), 'A8');
});

test('mulberry32 è ripetibile e resta in [0, 1)', () => {
  const a = mulberry32(42), b = mulberry32(42), c = mulberry32(43);
  const xs = Array.from({ length: 1000 }, () => a());
  assert.deepEqual(Array.from({ length: 1000 }, () => b()), xs);
  assert.notEqual(c(), xs[0]);
  for (const x of xs) assert.ok(x >= 0 && x < 1);
});

test('damageAfterArmor è sempre almeno il 35% del colpo', () => {
  for (const w of Object.values(WEAPONS)) for (let armor = 0; armor <= 12; armor++) {
    const d = damageAfterArmor(w.dmg, armor);
    assert.ok(d >= w.dmg * 0.35 - 1e-9 && d <= w.dmg);
  }
});
