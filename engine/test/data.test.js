// Coerenza dei dati di bilanciamento e calcolo delle statistiche dei progetti.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHASSIS, PROPS, WEAPONS, STRUCTS, TECH, TECH_BY, AI_TECH, DIFF, BUILD_ORDER, BUILDER, TOWER_MG, TOWER_CN,
  TOWER_CN75, BUNKER_W, TIER_GATE, TIERS, FAMILIES, UNIT_CAP, P, E, S, newGame, dStats, designName, gridRef, mulberry32, damageAfterArmor,
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

test('ogni ricerca ha un livello da 1 a 4 e i requisiti non sono di livello superiore', () => {
  assert.equal(TIERS.length, 4);
  assert.equal(TIER_GATE, 2);
  for (const t of TECH) {
    assert.ok(Number.isInteger(t.tier) && t.tier >= 1 && t.tier <= 4, `${t.id}.tier = ${t.tier}`);
    for (const r of t.req) assert.ok(TECH_BY[r].tier <= t.tier, `${t.id} (livello ${t.tier}) richiede ${r} (livello ${TECH_BY[r].tier})`);
  }
  // Ogni livello offre abbastanza ricerche da aprire il successivo.
  for (let tier = 1; tier <= 3; tier++) assert.ok(TECH.filter(t => t.tier === tier).length >= TIER_GATE, `livello ${tier}`);
});

test('ogni ricerca è raggiungibile dal livello I rispettando requisiti e cancello dei livelli', () => {
  // Si parte da zero e si completa, a ogni giro, tutto ciò che è avviabile: requisiti specifici fatti e almeno
  // TIER_GATE ricerche completate del livello precedente. Alla fine devono esserci tutte.
  const done = new Set();
  const doneAt = tier => TECH.filter(t => t.tier === tier && done.has(t.id)).length;
  const open = t => t.tier <= 1 || doneAt(t.tier - 1) >= TIER_GATE;
  let progress = true;
  while (progress) {
    progress = false;
    const now = TECH.filter(t => !done.has(t.id) && open(t) && t.req.every(r => done.has(r)));
    for (const t of now) { done.add(t.id); progress = true; }
  }
  assert.deepEqual(TECH.filter(t => !done.has(t.id)).map(t => t.id), []);
  // All'inizio sono avviabili solo ricerche di livello I senza requisiti.
  const first = TECH.filter(t => t.tier === 1);
  assert.ok(first.length >= TIER_GATE);
  for (const t of first) assert.deepEqual(t.req, [], `${t.id}: una ricerca di livello I non ha requisiti`);
});

test('parti ed edifici hanno un livello coerente con la ricerca che li sblocca', () => {
  for (const [group, table] of Object.entries({ ...parts, STRUCTS })) for (const [k, v] of Object.entries(table)) {
    assert.ok(Number.isInteger(v.tier) && v.tier >= 1 && v.tier <= 4, `${group}.${k}.tier`);
    if (v.req) assert.equal(TECH_BY[v.req].tier, v.tier, `${group}.${k}: livello ${v.tier}, ricerca ${v.req} di livello ${TECH_BY[v.req].tier}`);
    else if (group !== 'STRUCTS') assert.equal(v.tier, 1, `${group}.${k}: una parte libera è di livello I`);
  }
  // Ogni livello offre almeno un telaio o una propulsione o un'arma nuova.
  for (let tier = 1; tier <= 4; tier++) assert.ok(Object.values(parts).some(t => Object.values(t).some(v => v.tier === tier)), `livello ${tier}`);
});

test('parti nuove della fase B: Mammut, Cingoli rinforzati, armi e bunker', () => {
  assert.equal(CHASSIS.X.name, 'Mammut');
  assert.ok(CHASSIS.X.hp > CHASSIS.H.hp && CHASSIS.X.armor > CHASSIS.H.armor && CHASSIS.X.wt > CHASSIS.H.wt);
  assert.ok(PROPS.TR.hpm > PROPS.T.hpm && PROPS.TR.speed < PROPS.T.speed && PROPS.TR.water === false);
  for (const k of ['MG', 'HMG', 'CN', 'FL', 'RP', 'CN75', 'RK', 'AT', 'MO', 'CN105', 'HW', 'MRL']) {
    const w = WEAPONS[k];
    assert.ok(w, k);
    assert.equal(w.key, k);
    assert.ok(w.family in FAMILIES, `${k}.family = ${w.family}`);
  }
  assert.ok(WEAPONS.HMG.dmg > WEAPONS.MG.dmg && WEAPONS.HMG.range > WEAPONS.MG.range);
  assert.equal(WEAPONS.FL.proj, 'flame'); assert.equal(WEAPONS.FL.armorK, 0.5); assert.equal(WEAPONS.FL.vsStruct, 1.5);
  assert.ok(WEAPONS.FL.splash > 0 && WEAPONS.FL.range < WEAPONS.MG.range, 'lanciafiamme: corto raggio, ad area');
  assert.equal(WEAPONS.RP.dmg, 0); assert.equal(WEAPONS.RP.heal, 15); assert.equal(WEAPONS.RP.range, 3); assert.equal(WEAPONS.RP.family, 'support');
  assert.equal(WEAPONS.AT.proj, 'missile'); assert.equal(WEAPONS.AT.antiArmor, 0.1); assert.equal(WEAPONS.AT.splash, 0);
  assert.equal(WEAPONS.HW.proj, 'mortar'); assert.equal(WEAPONS.HW.minRange, 3.5);
  assert.ok(WEAPONS.HW.range > WEAPONS.MO.range && WEAPONS.HW.splash > WEAPONS.MO.splash);
  assert.equal(WEAPONS.MRL.proj, 'rocket'); assert.equal(WEAPONS.MRL.salvo, 6);
  assert.ok(WEAPONS.CN105.dmg > WEAPONS.CN75.dmg && WEAPONS.CN75.dmg > WEAPONS.CN.dmg);
  assert.equal(STRUCTS.bunker.req, 'stBK'); assert.equal(STRUCTS.bunker.tier, 3);
  assert.ok(BUILD_ORDER.includes('bunker'));
  assert.equal(BUNKER_W.key, 'CN75'); assert.equal(BUNKER_W.family, 'cannon');
  assert.equal(TOWER_CN75.key, 'CN75');
  assert.ok(TOWER_CN75.range > TOWER_CN.range && TOWER_CN75.dmg > TOWER_CN.dmg);
  assert.equal(UNIT_CAP, 100);
});

test('ogni effetto delle ricerche è valido', () => {
  const keys = new Set(['armor', 'dmg', 'speed', 'pump', 'tower']);
  for (const t of TECH) {
    if (!t.eff) continue;
    for (const [k, v] of Object.entries(t.eff)) {
      assert.ok(keys.has(k), `${t.id}: effetto sconosciuto ${k}`);
      if (k === 'dmg') { assert.ok(v[0] in FAMILIES, `${t.id}: famiglia ${v[0]}`); assert.ok(v[1] > 0); }
      else if (k === 'tower') assert.ok(['CN', 'CN75'].includes(v), `${t.id}: torretta ${v}`);
      else assert.ok(v > 0, `${t.id}.${k}`);
    }
  }
  // Danno per famiglia: ogni famiglia d'arma (tranne il supporto) ha tre gradi da +20%, mitragliatrici incluse.
  for (const f of ['mg', 'cannon', 'rocket', 'artillery', 'fire']) {
    const g = TECH.filter(t => t.eff && t.eff.dmg && t.eff.dmg[0] === f);
    assert.equal(g.length, 3, f);
    for (const t of g) assert.equal(t.eff.dmg[1], 0.2);
  }
  assert.deepEqual(TECH.filter(t => t.eff && t.eff.armor).map(t => t.tier), [2, 3, 4]);
  assert.deepEqual(TECH.filter(t => t.eff && t.eff.tower).map(t => t.eff.tower), ['CN', 'CN75']);
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
  for (const [k, v] of Object.entries(WEAPONS)) {
    assert.ok(v.rof > 0 && v.range > 0, k);
    // Il modulo riparazione non fa danno: ripara (heal > 0). Ogni altra arma fa danno e non ripara.
    if (v.family === 'support') assert.ok(v.dmg === 0 && v.heal > 0, `${k}: supporto con dmg ${v.dmg} e heal ${v.heal}`);
    else assert.ok(v.dmg > 0 && !v.heal, `${k}.dmg`);
  }
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
  assert.equal(Object.keys(CHASSIS).length * Object.keys(PROPS).length * Object.keys(WEAPONS).length, 240);
  let n = 0;
  for (const c of Object.keys(CHASSIS)) for (const p of Object.keys(PROPS)) for (const w of Object.keys(WEAPONS)) {
    const st = dStats({ c, p, w });
    const cost = CHASSIS[c].cost + PROPS[p].cost + WEAPONS[w].cost;
    assert.equal(st.cost, cost, `${c}/${p}/${w}`);
    assert.equal(st.time, Math.round(5 + cost / 14));
    assert.equal(st.hp, Math.round(CHASSIS[c].hp * PROPS[p].hpm));
    assert.equal(st.armor, CHASSIS[c].armor);
    assert.equal(st.range, WEAPONS[w].range);
    assert.ok(Math.abs(st.dps - WEAPONS[w].dmg / WEAPONS[w].rof) < 1e-9);
    assert.equal(st.hps, WEAPONS[w].heal || 0);
    assert.ok(st.speed > 0);
    n++;
  }
  assert.equal(n, 240);
});

test('dStats: i telai più pesanti sono più lenti, la corazza composita aggiunge 2', () => {
  const sp = c => dStats({ c, p: 'W', w: 'MG' }).speed;
  assert.ok(sp('L') > sp('M') && sp('M') > sp('H') && sp('H') > sp('X'));
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
