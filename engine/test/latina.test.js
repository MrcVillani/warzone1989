// Mappa «Latina» (piano 09): terreni CITTÀ e STRADA, velocità sulla strada, mappe disegnate, basi, salvataggi e
// notte solo nella missione 1 (campo `night` di MISSIONS, piano 08).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TILE, MW, MH, N, P, E, GROUND, DIRT, WATER, ROCK, FOREST, CITY, ROAD, TERRAIN, WALKABLE, BUILDABLE, walkable,
  PROPS, BUILDER, MISSIONS, MAPS, MAP_BY, mapDef, drawnMap, parseMap, genMap,
  S, newGame, serialize, loadState, terr, deposits, depIdx, occ, explored, hasRoad, homeOf, roadMul, makeUnit,
  passable, findPath, reachMap, reachableAdj, canPlace, followPath, step,
} from '../index.js';
import { run, seedRandom, units, structs } from './helpers.js';

const roundTrip = () => JSON.parse(JSON.stringify(serialize()));
const at = (x, y) => terr[x + y * MW];
// Disegno minimo valido: tutto erba, le due basi agli angoli.
const blank = (patch = {}) => {
  const rows = Array.from({ length: MH }, () => '.'.repeat(MW));
  return { id: 'prova', rows, bases: [{ x: 9, y: 9 }, { x: MW - 10, y: MH - 10 }], ...patch };
};
const setCh = (rows, x, y, ch) => { rows[y] = rows[y].slice(0, x) + ch + rows[y].slice(x + 1); };
// Caselle libere attorno al rettangolo di un edificio, e caselle raggiungibili da lì.
const around = (tx, ty, w, h, water = false) => reachableAdj(tx, ty, w, h, new Uint16Array(N).fill(1)).filter(([x, y]) => passable(x, y, water));
const reachFrom = (s, water = false) => reachMap(around(s.tx, s.ty, s.w, s.h, water), water);

/* ---------- terreni ---------- */

test('CITTÀ non si attraversa e non si costruisce; STRADA si attraversa e si costruisce', () => {
  assert.equal(TERRAIN[CITY].ch, '#');
  assert.equal(TERRAIN[ROAD].ch, '=');
  assert.equal(WALKABLE[CITY], 0); assert.equal(BUILDABLE[CITY], 0);
  assert.equal(WALKABLE[ROAD], 1); assert.equal(BUILDABLE[ROAD], 1);
  assert.equal(walkable(CITY, false), false);
  assert.equal(walkable(CITY, true), false, 'neanche l’hovercraft passa sugli isolati');
  assert.equal(walkable(ROAD, false), true);
  assert.equal(walkable(ROAD, true), true);
  // CITTÀ si comporta come la roccia.
  assert.deepEqual([WALKABLE[CITY], BUILDABLE[CITY]], [WALKABLE[ROCK], BUILDABLE[ROCK]]);
  // Le lettere delle mappe disegnate sono uniche e diverse da '*' (giacimento).
  const chs = TERRAIN.map(t => t.ch);
  assert.equal(new Set(chs).size, chs.length);
  assert.ok(!chs.includes('*'));
});

test('su Latina passable e canPlace rispettano CITTÀ e STRADA', () => {
  newGame('normale', 12345, { map: 'latina' });
  explored.fill(1); // per canPlace del giocatore serve terreno esplorato
  let city = 0, road = 0, roadPlaced = 0, cityBlocked = 0;
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const v = at(x, y), i = x + y * MW;
    if (v === CITY) {
      city++;
      assert.equal(passable(x, y, false), false, `isolato attraversabile in (${x}, ${y})`);
      assert.equal(passable(x, y, true), false, `isolato attraversabile in hovercraft in (${x}, ${y})`);
      if (!canPlace(P, 'tower', x, y)) cityBlocked++;
    }
    if (v === ROAD) {
      road++;
      if (!occ[i]) assert.equal(passable(x, y, false), true, `strada non attraversabile in (${x}, ${y})`);
      if (!occ[i] && depIdx[i] < 0 && canPlace(P, 'tower', x, y)) roadPlaced++;
    }
  }
  assert.ok(city > 50, `pochi isolati: ${city}`);
  assert.ok(road > 100, `poche strade: ${road}`);
  assert.equal(cityBlocked, city, 'nessuna torretta su un isolato');
  assert.ok(roadPlaced > road * 0.8, `torrette sulla strada: ${roadPlaced} su ${road}`);
  // Un edificio più grande con l'impronta che tocca un isolato non si piazza.
  let found = false;
  for (let y = 1; y < MH - 2 && !found; y++) for (let x = 1; x < MW - 2 && !found; x++) {
    if (at(x, y) !== CITY) continue;
    for (const [tx, ty] of [[x - 1, y], [x, y - 1], [x - 1, y - 1]]) assert.equal(canPlace(P, 'lab', tx, ty), false);
    found = true;
  }
  assert.ok(found);
});

test('una fabbrica si costruisce su un tratto di sola strada', () => {
  newGame('normale', 12345, { map: 'latina' });
  explored.fill(1);
  let spot = null;
  for (let y = 0; y < MH - 1 && !spot; y++) for (let x = 0; x < MW - 2 && !spot; x++) {
    let ok = true;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 3; dx++) if (at(x + dx, y + dy) !== ROAD) ok = false;
    if (ok && canPlace(P, 'factory', x, y)) spot = [x, y];
  }
  // Le strade sono larghe una casella quasi ovunque: se non c'è un tratto 3×2 si prova su una strada scritta a mano.
  if (!spot) {
    for (let y = 30; y < 32; y++) for (let x = 5; x < 8; x++) terr[x + y * MW] = ROAD;
    spot = [5, 30];
  }
  assert.equal(canPlace(P, 'factory', spot[0], spot[1]), true);
});

/* ---------- velocità sulla strada ---------- */

test('roadMul: ruote più veloci dei semicingoli, semicingoli più dei cingoli; i genieri come le ruote', () => {
  newGame('normale', 12345, { map: 'latina' });
  const mk = p => makeUnit(P, { c: 'L', p, w: 'MG' }, 100, 100);
  const w = roadMul(mk('W')), ht = roadMul(mk('HT')), t = roadMul(mk('T'));
  assert.equal(w, PROPS.W.road); assert.equal(ht, PROPS.HT.road); assert.equal(t, PROPS.T.road);
  assert.ok(w > ht && ht > t && t > 1, `ruote ${w}, semicingoli ${ht}, cingoli ${t}`);
  assert.equal(roadMul(mk('TR')), PROPS.TR.road);
  assert.equal(roadMul(mk('V')), PROPS.V.road);
  const b = makeUnit(P, null, 100, 100);
  assert.equal(roadMul(b), BUILDER.road);
  assert.equal(BUILDER.road, PROPS.W.road, 'i genieri vanno su ruote');
  for (const k in PROPS) assert.ok(PROPS[k].road >= 1 && PROPS[k].road <= 2, `${k}: road ${PROPS[k].road}`);
  // Una propulsione senza campo road vale 1 (nessun guadagno), senza errori.
  const u = mk('W'); u.d = { ...u.d, p: 'NUOVA' };
  const saved = PROPS.NUOVA; PROPS.NUOVA = { speed: 1 };
  try { assert.equal(roadMul(u), 1); } finally { if (saved === undefined) delete PROPS.NUOVA; else PROPS.NUOVA = saved; }
});

test('sulla strada il mezzo percorre più strada nello stesso tempo, secondo roadMul', () => {
  // Mappa generata: si cerca un tratto orizzontale di erba, si misura la distanza percorsa in 1 s su erba e sullo
  // stesso tratto trasformato in strada.
  for (const p of ['W', 'HT', 'T']) {
    const dist = asRoad => {
      newGame('normale', 12345);
      let row = null;
      for (let y = 20; y < 44 && !row; y++) for (let x = 15; x < 40 && !row; x++) {
        let ok = true;
        for (let k = 0; k < 12; k++) if (at(x + k, y) !== GROUND || occ[x + k + y * MW]) ok = false;
        if (ok) row = [x, y];
      }
      assert.ok(row, 'serve un tratto di erba libero');
      const [x0, y0] = row;
      if (asRoad) for (let k = 0; k < 12; k++) terr[x0 + k + y0 * MW] = ROAD;
      const u = makeUnit(P, { c: 'L', p, w: 'MG' }, (x0 + 0.5) * TILE, (y0 + 0.5) * TILE);
      u.ang = 0; // già rivolto verso est
      // Una sola tappa lontana: il tick del cambio di tappa (in cui il mezzo non avanza) non falsa la misura.
      u.path = [[x0 + 11, y0]]; u.pi = 0;
      const sx = u.x;
      for (let i = 0; i < 20; i++) followPath(u, 0.05, 1);
      return u.x - sx;
    };
    const g = dist(false), r = dist(true);
    assert.ok(g > 10, `${p}: su erba si muove (${g})`);
    const ratio = r / g;
    assert.ok(Math.abs(ratio - PROPS[p].road) < 0.05, `${p}: rapporto strada/erba ${ratio.toFixed(3)} invece di ${PROPS[p].road}`);
  }
});

test('su Latina il percorso con roadMul non è mai più lento di quello senza, e usa più strada', () => {
  newGame('normale', 12345, { map: 'latina' });
  assert.equal(hasRoad, true);
  const time = (path, sx, sy, mul) => {
    let t = 0, px = sx, py = sy;
    for (const [x, y] of path) {
      const c = x !== px && y !== py ? 1.414 : 1;
      t += at(x, y) === ROAD ? c / mul : c; px = x; py = y;
    }
    return t;
  };
  const a = homeOf(P), b = homeOf(E);
  const [sx, sy] = [a.x + 2, a.y + 2], [gx, gy] = [b.x - 2, b.y - 2];
  let better = 0;
  for (const mul of [PROPS.W.road, PROPS.HT.road, PROPS.T.road]) {
    const plain = findPath(sx, sy, gx, gy, false, 1), fast = findPath(sx, sy, gx, gy, false, mul);
    assert.ok(plain && plain.length && fast && fast.length);
    assert.deepEqual(fast[fast.length - 1], plain[plain.length - 1], 'stessa meta');
    const tp = time(plain, sx, sy, mul), tf = time(fast, sx, sy, mul);
    assert.ok(tf <= tp + 1e-3, `road ${mul}: con le strade ${tf.toFixed(2)}, senza ${tp.toFixed(2)}`);
    if (tf < tp - 0.5) better++;
    const onRoad = p => p.filter(([x, y]) => at(x, y) === ROAD).length;
    assert.ok(onRoad(fast) >= onRoad(plain), `road ${mul}: meno caselle di strada`);
  }
  assert.ok(better >= 1, 'almeno con le ruote la strada fa guadagnare tempo');
});

/* ---------- mappe disegnate ---------- */

test('MAPS e mapDef: «Casuale» e «Latina»', () => {
  assert.deepEqual(MAPS.map(m => m.id), ['casuale', 'latina']);
  for (const m of MAPS) assert.ok(m.name && m.desc, `${m.id} senza nome o descrizione`);
  assert.equal(mapDef('casuale'), undefined);
  assert.equal(mapDef('nessuna'), undefined);
  assert.equal(mapDef('latina'), MAP_BY.latina);
  assert.equal(mapDef('latina').name, 'Latina');
  assert.throws(() => drawnMap('nessuna'), /sconosciuta/);
});

test('parseMap legge lettere, giacimenti e basi', () => {
  const d = blank();
  setCh(d.rows, 30, 30, '#'); setCh(d.rows, 31, 30, '='); setCh(d.rows, 32, 30, '~'); setCh(d.rows, 33, 30, '^');
  setCh(d.rows, 34, 30, 'T'); setCh(d.rows, 35, 30, ':'); setCh(d.rows, 20, 5, '*'); setCh(d.rows, 3, 40, '*');
  const m = parseMap(d);
  assert.equal(m.t.length, N);
  const v = (x, y) => m.t[x + y * MW];
  assert.deepEqual([v(30, 30), v(31, 30), v(32, 30), v(33, 30), v(34, 30), v(35, 30)], [CITY, ROAD, WATER, ROCK, FOREST, DIRT]);
  assert.equal(v(20, 5), GROUND, 'il giacimento è su erba');
  assert.deepEqual(m.deps, [{ x: 20, y: 5 }, { x: 3, y: 40 }], 'giacimenti in ordine di lettura');
  assert.deepEqual(m.bases, [{ x: 9, y: 9 }, { x: MW - 10, y: MH - 10 }]);
  assert.notEqual(m.bases[0], d.bases[0], 'basi copiate');
});

test('parseMap rifiuta i disegni sbagliati', () => {
  assert.throws(() => parseMap(blank({ rows: blank().rows.slice(1) })), /righe/);
  const short = blank(); short.rows[7] = short.rows[7].slice(1);
  assert.throws(() => parseMap(short), /riga 7/);
  const bad = blank(); setCh(bad.rows, 4, 4, 'Q');
  assert.throws(() => parseMap(bad), /lettera sconosciuta/);
  assert.throws(() => parseMap(blank({ bases: [{ x: 9, y: 9 }] })), /basi/);
  assert.throws(() => parseMap(blank({ bases: undefined })), /basi/);
  // Comando su un isolato o accanto all'acqua: la sua impronta 3×3 deve essere edificabile.
  for (const ch of ['#', '~', '^', 'T']) {
    const d = blank(); setCh(d.rows, 10, 10, ch);
    assert.throws(() => parseMap(d), /terreno libero/, `comando su «${ch}»`);
  }
  // Sulla strada e sulla terra sì.
  for (const ch of ['=', ':']) { const d = blank(); setCh(d.rows, 10, 10, ch); assert.doesNotThrow(() => parseMap(d)); }
});

test('drawnMap("latina") è 64×64 con città, strade, acqua e giacimenti, e restituisce copie', () => {
  const def = mapDef('latina');
  assert.equal(def.rows.length, MH);
  for (const r of def.rows) assert.equal(r.length, MW);
  const m = drawnMap('latina');
  assert.equal(MW, 64); assert.equal(MH, 64);
  assert.equal(m.t.length, N);
  const kinds = new Set(m.t);
  for (const k of [GROUND, WATER, ROCK, FOREST, CITY, ROAD]) assert.ok(kinds.has(k), `manca il terreno ${TERRAIN[k].name}`);
  for (const k of kinds) assert.ok(k >= 0 && k < TERRAIN.length);
  assert.ok(m.deps.length >= 16, `giacimenti: ${m.deps.length}`);
  for (const d of m.deps) assert.equal(m.t[d.x + d.y * MW], GROUND);
  assert.equal(m.bases.length, 2);
  // Brigata a sud-ovest (lido), Direttorio a nord-est (Latina Scalo).
  assert.ok(m.bases[0].x < 32 && m.bases[0].y > 32, `base della Brigata in ${JSON.stringify(m.bases[0])}`);
  assert.ok(m.bases[1].x > 32 && m.bases[1].y < 32, `base del Direttorio in ${JSON.stringify(m.bases[1])}`);
  // Copie: modificare il risultato non cambia la chiamata successiva.
  m.t.fill(CITY); m.deps.length = 0; m.bases[0].x = -1;
  const m2 = drawnMap('latina');
  assert.notEqual(m2.t[m2.bases[0].x + m2.bases[0].y * MW], CITY);
  assert.ok(m2.deps.length >= 16);
  assert.ok(m2.bases[0].x >= 0);
  assert.deepEqual(drawnMap('latina'), parseMap(def));
});

test('su Latina le basi sono collegate tra loro e i giacimenti si raggiungono da entrambe', () => {
  newGame('normale', 12345, { map: 'latina' });
  const hq = o => structs(o, 'hq')[0];
  for (const o of [P, E]) {
    const h = hq(o), b = homeOf(o);
    assert.ok(h, `comando del lato ${o}`);
    assert.deepEqual([h.tx + 1, h.ty + 1], [b.x, b.y], 'comando centrato sulla base');
  }
  const adj = o => { const h = hq(o); return around(h.tx, h.ty, h.w, h.h); };
  for (const water of [false, true]) {
    const h1 = hq(E), R = reachFrom(hq(P), water);
    assert.ok(reachableAdj(h1.tx, h1.ty, 3, 3, R).length > 0, `base del Direttorio irraggiungibile (water ${water})`);
  }
  // Percorso A* da una casella libera accanto al comando della Brigata fino a una accanto a quello del Direttorio.
  const [s] = adj(P), goal = adj(E);
  assert.ok(s && goal.length);
  for (const mul of [1, PROPS.W.road]) {
    const path = findPath(s[0], s[1], goal[0][0], goal[0][1], false, mul);
    assert.ok(path && path.length > 20, 'percorso tra le basi');
    assert.deepEqual(path[path.length - 1], goal[0], `il percorso arriva alla base avversaria (road ${mul})`);
    for (const [x, y] of path) assert.ok(WALKABLE[at(x, y)], `percorso su terreno non attraversabile in (${x}, ${y})`);
  }
  // Ogni giacimento ha almeno una casella di lato raggiungibile da entrambe le basi.
  for (const o of [P, E]) {
    const R = reachFrom(hq(o));
    for (const d of deposits) assert.ok(reachableAdj(d.x, d.y, 1, 1, R).length > 0, `lato ${o}: giacimento in (${d.x}, ${d.y}) irraggiungibile`);
  }
});

test('su Latina i giacimenti vicini alle due basi sono in numero simile', () => {
  newGame('normale', 12345, { map: 'latina' });
  const near = o => {
    const R = reachFrom(structs(o, 'hq')[0]);
    const dist = deposits.map(d => Math.min(...reachableAdj(d.x, d.y, 1, 1, R).map(([x, y]) => R[x + y * MW])));
    return [12, 20].map(lim => dist.filter(v => v <= lim).length);
  };
  const a = near(P), b = near(E);
  for (let k = 0; k < a.length; k++) assert.ok(Math.abs(a[k] - b[k]) <= 2, `giacimenti vicini: Brigata ${a}, Direttorio ${b}`);
  assert.ok(a[0] >= 3 && b[0] >= 3, `ogni base ha qualche giacimento vicino: ${a}, ${b}`);
});

test('newGame con la mappa: Latina, «casuale», mappe sconosciute e missioni', () => {
  newGame('normale', 12345, { map: 'latina' });
  assert.equal(S.map, 'latina');
  assert.deepEqual(terr, drawnMap('latina').t);
  assert.deepEqual(deposits, drawnMap('latina').deps);
  assert.deepEqual([homeOf(P), homeOf(E)], drawnMap('latina').bases);
  assert.equal(hasRoad, true);
  assert.equal(S.night, false);
  for (const o of [P, E]) {
    assert.equal(units(o, u => u.builder).length, 2, `genieri del lato ${o}`);
    assert.equal(units(o, u => !u.builder).length, 2, `mezzi del lato ${o}`);
    for (const u of units(o)) assert.ok(WALKABLE[at(Math.floor(u.x / TILE), Math.floor(u.y / TILE))], 'mezzo su terreno libero');
  }
  // Semi diversi: la mappa disegnata non cambia.
  newGame('facile', 7, { map: 'latina' });
  assert.deepEqual(terr, drawnMap('latina').t);

  newGame('normale', 12345, { map: 'casuale' });
  assert.equal(S.map, null);
  assert.deepEqual(terr, genMap(12345).t);
  assert.equal(hasRoad, false);
  newGame('normale', 12345);
  assert.equal(S.map, null);
  assert.throws(() => newGame('normale', 1, { map: 'atlantide' }), /Mappa sconosciuta/);
  assert.throws(() => newGame('normale', 1, { map: 'latina', mission: 0 }), /schermaglia/);
  assert.doesNotThrow(() => newGame('normale', 1, { map: 'casuale', mission: 0 }));
  assert.equal(S.map, null);
});

test('su Latina IA contro IA: nessun mezzo finisce su un isolato o in acqua, e si costruisce', () => {
  const restore = seedRandom(9);
  try {
    newGame('normale', 4242, { map: 'latina', autoplay: true });
    let bad = null;
    for (let i = 0; i < 6000 && S.phase === 'play' && !bad; i++) {
      step(0.05);
      if (i % 20) continue;
      for (const u of S.ents) {
        if (u.dead || u.kind !== 'unit') continue;
        const v = at(Math.floor(u.x / TILE), Math.floor(u.y / TILE));
        if (v === CITY || v === ROCK || v === FOREST || (v === WATER && !u.water)) { bad = { id: u.id, x: u.x, y: u.y, v, t: S.time }; break; }
      }
    }
    assert.equal(bad, null, `mezzo su terreno vietato: ${JSON.stringify(bad)}`);
    for (const o of [P, E]) {
      assert.ok(structs(o, 'pump').length >= 2, `lato ${o}: pompe ${structs(o, 'pump').length}`);
      assert.ok(structs(o, 'factory').length >= 1 || S.phase !== 'play', `lato ${o}: nessuna fabbrica`);
    }
    assert.ok(S.stats.made[0] + S.stats.made[1] > 4, `mezzi prodotti: ${S.stats.made}`);
  } finally { restore(); }
});

/* ---------- salvataggio ---------- */

test('salvataggio e caricamento su Latina: mappa, basi e strade tornano', () => {
  const restore = seedRandom(3);
  try {
    newGame('normale', 12345, { map: 'latina' });
    run(90);
    const saved = roundTrip();
    assert.equal(saved.map, 'latina');
    assert.equal(saved.night, false);
    const occBefore = Int32Array.from(occ);
    newGame('normale', 12345); // un'altra partita in mezzo, su mappa generata
    assert.equal(hasRoad, false);
    loadState(saved);
    assert.equal(S.map, 'latina');
    assert.equal(S.night, false);
    assert.equal(hasRoad, true);
    assert.deepEqual(terr, drawnMap('latina').t);
    assert.deepEqual([homeOf(P), homeOf(E)], drawnMap('latina').bases);
    assert.deepEqual(occ, occBefore);
    assert.doesNotThrow(() => run(60));
  } finally { restore(); }
});

test('da un salvataggio su Latina la simulazione procede come se non si fosse mai fermata', () => {
  let restore = seedRandom(5);
  newGame('normale', 777, { map: 'latina' });
  run(120);
  restore();
  const saved = JSON.stringify(serialize());
  restore = seedRandom(77); run(30); restore();
  const a = JSON.stringify(serialize());
  newGame('facile', 1);
  loadState(JSON.parse(saved));
  restore = seedRandom(77); run(30); restore();
  assert.ok(a === JSON.stringify(serialize()), 'stato diverso dopo il caricamento');
});

test('un salvataggio senza i campi map e night carica la mappa generata, di giorno', () => {
  newGame('normale', 12345);
  run(20);
  const saved = roundTrip();
  delete saved.map; delete saved.night;
  newGame('normale', 1, { map: 'latina' });
  loadState(saved);
  assert.ok(S.map == null, `S.map = ${S.map}`);
  assert.equal(S.map || 'casuale', 'casuale', 'il client lo legge come «casuale»');
  assert.equal(S.night, false);
  assert.equal(hasRoad, false);
  assert.deepEqual(terr, genMap(12345).t);
  assert.deepEqual([homeOf(P), homeOf(E)].map(b => [b.x, b.y]), [[9, 9], [MW - 10, MH - 10]]);
  assert.doesNotThrow(() => run(30));
  // Anche una missione salvata prima del campo night è di giorno.
  newGame('normale', 1101, { mission: 0 });
  const m = roundTrip(); delete m.night; delete m.map;
  loadState(m);
  assert.equal(S.night, false);
  assert.equal(S.mission, 'testa-di-ponte');
});

test('night sopravvive al salvataggio; valori non booleani diventano booleani', () => {
  newGame('normale', 1101, { mission: 0 });
  assert.equal(S.night, true);
  run(10);
  const saved = roundTrip();
  assert.equal(saved.night, true);
  newGame('normale', 1);
  loadState(saved);
  assert.equal(S.night, true);
  assert.equal(S.map, null);
  for (const [v, want] of [[1, true], [0, false], [null, false], ['', false]]) {
    newGame('normale', 1101, { mission: 0 });
    const st = roundTrip(); st.night = v;
    loadState(st);
    assert.equal(S.night, want, `night ${JSON.stringify(v)}`);
  }
});

/* ---------- notte ---------- */

test('S.night è vero solo nella missione 1', () => {
  assert.equal(MISSIONS[0].id, 'testa-di-ponte');
  assert.equal(MISSIONS[0].night, true);
  for (const M of MISSIONS) assert.equal(typeof M.night, 'boolean', `${M.id}: night non booleano`);
  assert.deepEqual(MISSIONS.filter(M => M.night).map(M => M.id), ['testa-di-ponte']);
  MISSIONS.forEach((M, i) => {
    newGame('normale', M.seed, { mission: i });
    assert.equal(S.night, i === 0, `missione ${i + 1} (${M.id})`);
    newGame('facile', M.seed, { mission: M.id });
    assert.equal(S.night, i === 0, `missione ${M.id} per id`);
  });
  for (const opts of [undefined, {}, { map: 'casuale' }, { map: 'latina' }, { tech: { chM: true } }, { autoplay: true }]) {
    newGame('normale', 12345, opts);
    assert.equal(S.night, false, `schermaglia ${JSON.stringify(opts)}`);
  }
});

test('la notte è solo aspetto: la missione 1 di notte e di giorno procede uguale', () => {
  const play = night => {
    const restore = seedRandom(21);
    try {
      newGame('normale', 1101, { mission: 0 });
      S.night = night;
      run(120);
      const st = roundTrip(); delete st.night;
      return JSON.stringify(st);
    } finally { restore(); }
  };
  assert.ok(play(true) === play(false), 'la notte cambia la simulazione');
});
