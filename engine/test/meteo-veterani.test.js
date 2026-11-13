// Piano 10 «Meteo e veterani»: meteo (WEATHER, S.weather, S.weatherMode, evento weather), gradi dei mezzi (RANKS,
// RANK_XP, RANK_CALM, evento rank), veterani tra le missioni della campagna (VETERANS_MAX, VETERANS_RANK) e Macchina
// di Villo (HERO, HERO_W, S.hero, evento hero; solo in campagna).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TILE, MW, P, E, B0, GROUND, ROAD, PROPS, WEAPONS, CHASSIS, BUILDER, SIGHT, STRUCTS, WEATHER, WEATHER_MODES, WEATHER_VAR,
  RANKS, RANK_XP, RANK_CALM, VETERANS_MAX, VETERANS_RANK, HERO, HERO_W, MISSIONS, TOWER_MG, DEFAULT_DESIGNS,
  S, terr, newGame, step, serialize, loadState, makeUnit, makeStruct, kill, damage, fire, hitDamage, armorOf, sightOf,
  offroadMul, setWeather, weatherTick, canSee, nearestEnemy, updateFog, followPath, updUnit, gainXp, rankFor, unitMaxHp,
  setRank, heroLevel, nearestFree, enqueue, unitCount, validDesign, isHeroDesign, missionTick, updateObjective,
  newCampaign, normalizeCampaign, finishMission, missionOpts, startMission, missionVeterans, dStats,
} from '../index.js';
import { recordEvents, run, seedRandom, units, structs } from './helpers.js';

const LMG = { c: 'L', p: 'W', w: 'MG' }, MCN = { c: 'M', p: 'HT', w: 'CN' }, HCN = { c: 'H', p: 'T', w: 'CN75' };
const roundTrip = () => JSON.parse(JSON.stringify(serialize()));
const mission = (i, opts = {}) => newGame('normale', MISSIONS[i].seed, { mission: i, ...opts });
const at = (tx, ty) => [(tx + 0.5) * TILE, (ty + 0.5) * TILE];
// Casella percorribile libera vicino a (tx, ty).
const free = (tx, ty) => { const f = nearestFree(tx, ty, false, 12); assert.ok(f, `nessuna casella libera vicino a ${tx},${ty}`); return f; };
const hero = () => units(P, u => u.hero)[0];

/* ================= meteo ================= */

test('WEATHER: sereno, pioggia e nebbia con i campi del contratto; le missioni usano solo chiavi note', () => {
  assert.deepEqual(Object.keys(WEATHER), ['clear', 'rain', 'fog']);
  for (const k in WEATHER) {
    const w = WEATHER[k];
    assert.ok(w.name && w.toast, k);
    for (const p in PROPS) assert.ok(w.offroad[p] > 0 && w.offroad[p] <= 1, `${k}.offroad.${p}`);
    assert.ok(w.sight > 0 && w.sight <= 1 && w.fire > 0 && w.fire <= 1, k);
  }
  assert.deepEqual(WEATHER_MODES.map(m => m.id), ['clear', 'rain', 'fog', 'variable']);
  for (const M of MISSIONS) {
    assert.ok(WEATHER[M.weather], `${M.id}: meteo ${M.weather}`);
    if (M.weather2 != null) assert.ok(WEATHER[M.weather2], `${M.id}: weather2 ${M.weather2}`);
  }
});

test('meteo sconosciuto: errore in newGame (schermaglia) e in setWeather; in missione l’opzione si ignora', () => {
  for (const w of ['boh', 'Sereno', 'CLEAR', 7, '']) assert.throws(() => newGame('normale', 1, { weather: w }), /Meteo sconosciuto/, String(w));
  newGame('normale', 1);
  assert.throws(() => setWeather('neve'), /Meteo sconosciuto/);
  assert.throws(() => setWeather('variable'), /Meteo sconosciuto/, 'variable è una scelta del menu, non una condizione');
  assert.equal(S.weather, 'clear');
  mission(0, { weather: 'boh' });
  assert.equal(S.weather, 'clear', 'in missione vale il meteo della missione');
  mission(3, { weather: 'rain' });
  assert.equal(S.weather, 'fog');
});

test('schermaglia: sereno senza opzioni; pioggia e nebbia fisse; nessun evento weather all’avvio; niente Macchina di Villo', () => {
  const rec = recordEvents();
  try {
    newGame('normale', 12345);
    assert.equal(S.weather, 'clear'); assert.equal(S.weatherMode, 'clear'); assert.equal(S.weatherT, null);
    for (const w of ['clear', 'rain', 'fog']) {
      newGame('normale', 12345, { weather: w });
      assert.equal(S.weather, w); assert.equal(S.weatherMode, w); assert.equal(S.weatherT, null); assert.equal(S.weatherN, 0);
      assert.equal(S.hero, null);
      assert.equal(units(P, u => u.hero).length, 0);
      run(20);
      assert.equal(S.weather, w, 'il meteo fisso non cambia');
    }
    assert.equal(rec.of('weather').length, 0);
  } finally { rec.stop(); }
});

// Distanza percorsa in un passo di 0,1 s da un mezzo con propulsione p (o un geniere) su una fila di caselle tutte
// del terreno `ground`, con il meteo w, senza ricerche e già orientato.
function stepDistance(p, w, ground) {
  newGame('normale', 12345, { weather: w });
  const y = 20;
  for (let x = 26; x <= 40; x++) for (let yy = y - 1; yy <= y + 1; yy++) terr[x + yy * MW] = ground;
  const [px, py] = at(28, y);
  const u = p ? makeUnit(P, { c: 'L', p, w: 'MG' }, px, py) : makeUnit(P, null, px, py);
  u.ang = 0; u.path = []; for (let x = 29; x <= 40; x++) u.path.push([x, y]); u.pi = 0;
  followPath(u, 0.1, 1);
  return { d: u.x - px, speed: u.speed };
}

test('pioggia: fuori strada ruote al 80%, semicingoli al 90%, cingoli e hovercraft invariati; su strada nessun fango', () => {
  for (const p of ['W', 'HT', 'T', 'V', 'TR']) {
    const clear = stepDistance(p, 'clear', GROUND), rain = stepDistance(p, 'rain', GROUND);
    assert.ok(Math.abs(clear.d - clear.speed * 0.1) < 1e-6, `${p}: sereno a piena velocità`);
    assert.ok(Math.abs(rain.d / clear.d - WEATHER.rain.offroad[p]) < 1e-9, `${p}: pioggia ${rain.d / clear.d}`);
    const roadC = stepDistance(p, 'clear', ROAD), roadR = stepDistance(p, 'rain', ROAD);
    assert.ok(Math.abs(roadR.d - roadC.d) < 1e-9, `${p}: su strada la pioggia non rallenta`);
    assert.ok(Math.abs(roadC.d / clear.d - PROPS[p].road) < 1e-9, `${p}: vantaggio della strada`);
    const fog = stepDistance(p, 'fog', GROUND);
    assert.ok(Math.abs(fog.d - clear.d) < 1e-9, `${p}: la nebbia non rallenta`);
  }
  assert.equal(WEATHER.rain.offroad.W, 0.8); assert.equal(WEATHER.rain.offroad.HT, 0.9);
  // i genieri vanno su ruote
  const b = stepDistance(null, 'rain', GROUND).d / stepDistance(null, 'clear', GROUND).d;
  assert.ok(Math.abs(b - 0.8) < 1e-9, `geniere sotto la pioggia: ${b}`);
  newGame('normale', 1, { weather: 'rain' });
  assert.equal(offroadMul(makeUnit(P, null, 100, 100)), WEATHER.rain.offroad[BUILDER.prop]);
});

test('pioggia: il lanciafiamme fa il 75% del danno, le altre armi no', () => {
  const hit = (w, weather) => {
    newGame('normale', 12345, { weather });
    const [x, y] = at(32, 32);
    const t = makeUnit(E, { c: 'H', p: 'T', w: 'MG' }, x, y);
    const h0 = t.hp;
    fire(x - 40, y, 0, t, WEAPONS[w], P, 0);
    return h0 - t.hp;
  };
  const fc = hit('FL', 'clear'), fr = hit('FL', 'rain');
  assert.ok(fc > 0);
  // il danno è prima della corazza (conta la metà per la fiamma): si confronta con hitDamage
  newGame('normale', 12345);
  const t = makeUnit(E, { c: 'H', p: 'T', w: 'MG' }, 100, 100);
  assert.ok(Math.abs(fc - hitDamage(t, WEAPONS.FL.dmg, WEAPONS.FL)) < 1e-9);
  assert.ok(Math.abs(fr - hitDamage(t, WEAPONS.FL.dmg * 0.75, WEAPONS.FL)) < 1e-9, `pioggia: ${fr}`);
  assert.equal(hit('MG', 'rain'), hit('MG', 'clear'), 'la mitragliatrice non cambia con la pioggia');
  assert.equal(hit('FL', 'fog'), fc, 'la nebbia non cambia la fiamma');
});

test('nebbia: vista di mezzi ed edifici al 70%, mai sotto 2,5 caselle; il sereno e la pioggia non la cambiano', () => {
  newGame('normale', 12345, { weather: 'fog' });
  const u = makeUnit(P, LMG, 200, 200), b = makeUnit(P, null, 220, 220);
  const hq = structs(P, 'hq')[0];
  const site = makeStruct('pump', P, 30, 30, false), pump = makeStruct('pump', P, 32, 30, true);
  assert.ok(Math.abs(sightOf(u) - SIGHT.unit * 0.7) < 1e-9);
  assert.ok(Math.abs(sightOf(b) - SIGHT.builder * 0.7) < 1e-9);
  assert.ok(Math.abs(sightOf(hq) - STRUCTS.hq.sight * 0.7) < 1e-9);
  assert.ok(Math.abs(sightOf(pump) - Math.max(SIGHT.min, STRUCTS.pump.sight * 0.7)) < 1e-9);
  assert.equal(sightOf(site), SIGHT.min, 'il cantiere (2,5 × 0,7) resta a 2,5');
  for (const e of [u, b, hq, site, pump]) assert.ok(sightOf(e) >= SIGHT.min);
  for (const w of ['clear', 'rain']) {
    setWeather(w);
    assert.equal(sightOf(u), SIGHT.unit); assert.equal(sightOf(hq), STRUCTS.hq.sight); assert.equal(sightOf(site), SIGHT.site);
  }
});

test('nebbia: tutti e due i lati sparano solo a ciò che vedono (gittate invariate)', () => {
  for (const w of ['clear', 'fog']) {
    newGame('normale', 12345, { weather: w });
    const [ex, ey] = at(32, 20), [px, py] = at(38, 20);
    const eu = makeUnit(E, LMG, ex, ey), pu = makeUnit(P, LMG, px, py);
    updateFog();
    const R = (WEAPONS.MG.range + 2.5) * TILE;
    if (w === 'clear') {
      assert.equal(canSee(E, pu), true, 'col sereno il Direttorio vede tutto');
      assert.equal(nearestEnemy(eu, R), pu);
    } else {
      assert.equal(canSee(E, pu), false, 'in nebbia il Direttorio non vede a 6 caselle');
      assert.equal(canSee(P, eu), false, 'in nebbia nemmeno il giocatore');
      assert.equal(nearestEnemy(eu, R), null);
      assert.equal(nearestEnemy(pu, R), null);
      // vicini (3 caselle) si vedono e si sparano
      pu.x = ex + 3 * TILE; updateFog();
      assert.equal(canSee(E, pu), true); assert.equal(nearestEnemy(eu, R), pu); assert.equal(nearestEnemy(pu, R), eu);
    }
  }
});

// Sequenza dei primi n cambi del meteo variabile della schermaglia con quel seme: [{at, from, to}].
function variableSequence(seed, n) {
  newGame('normale', seed, { weather: 'variable' });
  const out = [];
  const rec = recordEvents();
  try {
    for (let i = 0; i < n; i++) {
      const t = S.weatherT;
      S.time = t - 0.01; weatherTick();
      assert.equal(rec.of('weather').length, i, 'nessun cambio prima dell’ora');
      S.time = t; weatherTick();
      const ev = rec.of('weather');
      assert.equal(ev.length, i + 1, 'un cambio all’ora giusta');
      out.push({ at: t, ...ev[i] });
    }
    return { out, toasts: rec.of('toast').map(x => x.text) };
  } finally { rec.stop(); }
}

test('meteo variabile: parte sereno, cambia ogni 150–240 s, mai due volte lo stesso di fila, con evento e avviso', () => {
  newGame('normale', 12345, { weather: 'variable' });
  assert.equal(S.weatherMode, 'variable'); assert.equal(S.weather, 'clear'); assert.equal(S.weatherN, 0);
  assert.ok(S.weatherT >= WEATHER_VAR.min && S.weatherT <= WEATHER_VAR.max, `primo cambio a ${S.weatherT}`);
  const { out, toasts } = variableSequence(12345, 30);
  let prev = 'clear', last = 0;
  for (const c of out) {
    assert.equal(c.from, prev);
    assert.notEqual(c.to, c.from, 'mai lo stesso di fila');
    assert.ok(WEATHER[c.to]);
    assert.ok(c.at - last >= WEATHER_VAR.min - 1e-9 && c.at - last <= WEATHER_VAR.max + 1e-9, `attesa ${c.at - last}`);
    prev = c.to; last = c.at;
  }
  assert.equal(S.weather, prev); assert.equal(S.weatherN, 30);
  assert.deepEqual(new Set(out.map(c => c.to)), new Set(['clear', 'rain', 'fog']), 'in 30 cambi arrivano tutte e tre');
  for (const c of out) assert.ok(toasts.includes(WEATHER[c.to].toast));
});

test('meteo variabile: deterministico dal seme, indipendente da Math.random, diverso tra semi', () => {
  let restore = seedRandom(1);
  const a = variableSequence(777, 12).out; restore();
  restore = seedRandom(99);
  const b = variableSequence(777, 12).out; restore();
  assert.deepEqual(a, b);
  const others = [1, 2, 3, 12345].map(s => JSON.stringify(variableSequence(s, 12).out));
  assert.ok(others.some(o => o !== JSON.stringify(a)), 'semi diversi danno sequenze diverse');
  // nella simulazione vera il cambio arriva da step
  newGame('normale', 4, { weather: 'variable' });
  const rec = recordEvents();
  try {
    S.time = S.weatherT - 0.02; step(0.05);
    assert.equal(rec.of('weather').length, 1);
  } finally { rec.stop(); }
});

test('meteo variabile salvato a metà: dopo il caricamento continua con la stessa sequenza, senza evento al caricamento', () => {
  const full = variableSequence(31337, 8).out;
  newGame('normale', 31337, { weather: 'variable' });
  for (let i = 0; i < 4; i++) { S.time = S.weatherT; weatherTick(); }
  const saved = roundTrip();
  assert.equal(saved.weatherMode, 'variable'); assert.equal(saved.weatherN, 4);
  newGame('facile', 1);
  const rec = recordEvents();
  try {
    loadState(saved);
    assert.equal(rec.of('weather').length, 0, 'il caricamento non manda weather');
    assert.equal(S.weather, full[3].to);
    for (let i = 4; i < 8; i++) { const t = S.weatherT; S.time = t; weatherTick(); assert.equal(t, full[i].at); }
    assert.deepEqual(rec.of('weather').map(e => [e.from, e.to]), full.slice(4).map(c => [c.from, c.to]));
  } finally { rec.stop(); }
});

test('salvataggi del meteo: i nuovi lo conservano, i vecchi valgono sereno, i valori strani si riparano', () => {
  newGame('normale', 12345, { weather: 'fog' });
  let st = roundTrip();
  loadState(st);
  assert.equal(S.weather, 'fog'); assert.equal(S.weatherMode, 'fog'); assert.equal(sightOf(units(P, u => !u.builder)[0]), SIGHT.unit * 0.7);
  // salvataggio di prima del meteo
  newGame('normale', 12345);
  st = roundTrip();
  for (const k of ['weather', 'weatherMode', 'weatherT', 'weatherN']) delete st[k];
  loadState(st);
  assert.equal(S.weather, 'clear'); assert.equal(S.weatherMode, 'clear'); assert.equal(S.weatherT, null); assert.equal(S.weatherN, 0);
  run(5);
  // condizione sconosciuta, modo mancante
  st = roundTrip(); st.weather = 'neve'; delete st.weatherMode;
  loadState(st);
  assert.equal(S.weather, 'clear'); assert.equal(S.weatherMode, 'clear');
  st = roundTrip(); st.weather = 'rain'; delete st.weatherMode;
  loadState(st);
  assert.equal(S.weatherMode, 'rain', 'senza modo vale la condizione salvata');
  // variabile senza ora del prossimo cambio: ne riceve una nel futuro
  st = roundTrip(); st.weatherMode = 'variable'; delete st.weatherT; st.time = 500;
  loadState(st);
  assert.ok(S.weatherT >= 500 + WEATHER_VAR.min && S.weatherT <= 500 + WEATHER_VAR.max, `${S.weatherT}`);
  st = roundTrip(); st.weatherMode = 'boh';
  loadState(st);
  assert.equal(S.weatherMode, S.weather);
});

test('campagna: «Il passo dei larici» con la nebbia, «La diga di Serra Alta» con la pioggia, le altre serene; la 1 resta di notte', () => {
  const want = ['clear', 'clear', 'clear', 'fog', 'rain', 'clear', 'rain', 'clear'];
  MISSIONS.forEach((M, i) => {
    mission(i);
    assert.equal(S.weather, want[i], M.id);
    assert.equal(S.weatherMode, want[i], M.id);
    assert.equal(S.weatherT, null, `${M.id}: in missione il meteo non è variabile`);
    assert.equal(S.night, i === 0, M.id);
  });
  assert.equal(MISSIONS[3].id, 'passo-dei-larici'); assert.equal(MISSIONS[4].id, 'diga-serra-alta'); assert.equal(MISSIONS[6].id, 'contrattacco');
});

test('«Contrattacco»: piove nella fase 1 e torna il sereno con il passaggio alla fase 2, una volta sola', () => {
  mission(6);
  assert.equal(S.weather, 'rain');
  const rec = recordEvents();
  try {
    S.time = MISSIONS[6].objective.time - 1; updateObjective();
    assert.equal(S.objective.stage, 1); assert.equal(S.weather, 'rain');
    S.time = MISSIONS[6].objective.time; updateObjective();
    assert.equal(S.objective.stage, 2); assert.equal(S.weather, 'clear');
    assert.deepEqual(rec.of('weather'), [{ from: 'rain', to: 'clear' }]);
    updateObjective(); missionTick();
    assert.equal(rec.of('weather').length, 1, 'il cambio non si ripete');
    // dopo un salvataggio in fase 2 resta sereno
    loadState(roundTrip());
    assert.equal(S.weather, 'clear');
  } finally { rec.stop(); }
});

/* ================= gradi ================= */

test('RANKS: quattro gradi con soglie 0/2/5/10 e vantaggi del piano', () => {
  assert.deepEqual(RANKS.map(r => r.kills), [0, 2, 5, 10]);
  assert.deepEqual(RANKS.map(r => r.dmg), [1, 1.08, 1.16, 1.25]);
  assert.deepEqual(RANKS.map(r => r.hp), [1, 1.10, 1.20, 1.30]);
  assert.deepEqual(RANKS.map(r => r.regen > 0), [false, false, false, true]);
  assert.deepEqual(RANK_XP, { kill: 1, repair: 0.5, repairPts: 150 });
  for (const [xp, r] of [[0, 0], [1.99, 0], [2, 1], [4.99, 1], [5, 2], [9.5, 2], [10, 3], [999, 3]]) assert.equal(rankFor(xp), r, `xp ${xp}`);
});

test('nuovi mezzi reclute; xp al colpo di grazia (non a chi colpisce e basta, non senza tiratore)', () => {
  newGame('normale', 12345);
  const [x, y] = at(32, 20);
  const a = makeUnit(P, LMG, x, y), b = makeUnit(P, LMG, x + 10, y);
  assert.equal(a.xp, 0); assert.equal(a.rank, 0);
  const t = makeUnit(E, LMG, x + 60, y);
  damage(t, t.hp / 2, P, WEAPONS.MG, b.id);
  assert.equal(b.xp, 0, 'il colpo che non distrugge non dà esperienza');
  damage(t, 9999, P, WEAPONS.MG, a.id);
  assert.ok(t.dead);
  assert.equal(a.xp, RANK_XP.kill); assert.equal(b.xp, 0);
  // distruzione senza tiratore (per esempio uno script): nessuna esperienza
  const t2 = makeUnit(E, LMG, x + 60, y);
  kill(t2, P);
  assert.equal(a.xp, 1);
  // anche gli edifici nemici contano
  const s = makeStruct('pump', E, 40, 20, true);
  damage(s, 99999, P, WEAPONS.MG, a.id);
  assert.ok(s.dead); assert.equal(a.xp, 2); assert.equal(a.rank, 1);
  // un colpo vero: fire() con il tiratore porta l'id fino a kill
  const t3 = makeUnit(E, LMG, x + 60, y); t3.hp = 1;
  fire(a.x, a.y, 0, t3, WEAPONS.MG, P, 10, a);
  assert.ok(t3.dead); assert.equal(a.xp, 3);
  // il nemico sale allo stesso modo
  const e = makeUnit(E, LMG, x, y + 60);
  for (let i = 0; i < 5; i++) { const v = makeUnit(P, LMG, x, y + 90); damage(v, 9999, E, WEAPONS.MG, e.id); }
  assert.equal(e.xp, 5); assert.equal(e.rank, 2);
  assert.equal(S.stats.kills[P] >= 4, true);
});

test('promozione: evento rank, punti struttura ×1,10/1,20/1,30 con quelli attuali in proporzione', () => {
  newGame('normale', 12345);
  const rec = recordEvents();
  try {
    const u = makeUnit(P, MCN, 300, 300), base = Math.round(CHASSIS.M.hp * PROPS.HT.hpm);
    assert.equal(u.max, base);
    u.hp = base / 2;
    gainXp(u, 1.5);
    assert.equal(u.rank, 0); assert.equal(rec.of('rank').length, 0);
    gainXp(u, 0.5);
    assert.equal(u.rank, 1); assert.equal(u.max, Math.round(base * 1.1));
    assert.ok(Math.abs(u.hp - u.max / 2) < 1e-9, 'metà prima, metà dopo');
    assert.deepEqual(rec.of('rank'), [{ id: u.id, owner: P, rank: 1, x: u.x, y: u.y }]);
    gainXp(u, 3); assert.equal(u.rank, 2); assert.equal(u.max, Math.round(base * 1.2));
    gainXp(u, 5); assert.equal(u.rank, 3); assert.equal(u.max, Math.round(base * 1.3)); assert.equal(unitMaxHp(u), u.max);
    assert.deepEqual(rec.of('rank').map(r => r.rank), [1, 2, 3]);
    gainXp(u, 50); assert.equal(u.rank, 3); assert.equal(rec.of('rank').length, 3, 'oltre l’asso nessuna promozione');
    // un salto di più gradi in una volta: un evento solo, al grado finale
    const v = makeUnit(E, LMG, 400, 400);
    gainXp(v, 12);
    assert.equal(v.rank, 3); assert.equal(rec.of('rank').at(-1).rank, 3); assert.equal(rec.of('rank').at(-1).owner, E);
    assert.equal(rec.of('rank').length, 4);
    // valori non validi non fanno nulla
    for (const n of [0, -3, NaN, undefined, 'tanto']) gainXp(v, n);
    assert.equal(v.xp, 12);
  } finally { rec.stop(); }
});

test('il grado moltiplica il danno inflitto: +8%, +16%, +25%', () => {
  newGame('normale', 12345);
  const shooter = makeUnit(P, LMG, 300, 300);
  for (let r = 0; r < RANKS.length; r++) {
    setRank(shooter, r);
    const t = makeUnit(E, LMG, 360, 300), h0 = t.hp;
    fire(shooter.x, shooter.y, 0, t, WEAPONS.MG, P, 10, shooter);
    assert.ok(Math.abs((h0 - t.hp) - hitDamage(t, WEAPONS.MG.dmg * RANKS[r].dmg, WEAPONS.MG)) < 1e-9, `grado ${r}`);
    kill(t, P);
  }
  // senza tiratore il colpo non ha grado
  const t = makeUnit(E, LMG, 360, 300), h0 = t.hp;
  fire(300, 300, 0, t, WEAPONS.MG, P, 10);
  assert.equal(h0 - t.hp, WEAPONS.MG.dmg);
});

test('genieri, torrette ed edifici non salgono di grado', () => {
  newGame('normale', 12345);
  const b = makeUnit(P, null, 300, 300);
  gainXp(b, 20);
  assert.equal(b.xp, 0); assert.equal(b.rank, 0); assert.equal(b.max, BUILDER.hp);
  const tw = makeStruct('tower', P, 30, 30, true);
  gainXp(tw, 20);
  assert.equal(tw.rank, undefined); assert.equal(tw.xp, undefined); assert.equal(tw.max, STRUCTS.tower.hp);
  // una torretta che distrugge non prende esperienza
  const t = makeUnit(E, LMG, tw.x + 50, tw.y); t.hp = 1;
  fire(tw.x, tw.y, 0, t, TOWER_MG, P, 12, tw);
  assert.ok(t.dead); assert.equal(tw.xp, undefined);
  // un geniere a cui si attribuisce un colpo di grazia nemmeno
  const t2 = makeUnit(E, LMG, 500, 300);
  damage(t2, 9999, P, null, b.id);
  assert.equal(b.xp, 0);
});

test('l’asso si ripara piano da solo solo a riposo (RANK_CALM secondi senza sparare né subire); gli altri gradi no', () => {
  newGame('normale', 12345);
  const [x, y] = at(...free(20, 14));
  const u = makeUnit(P, LMG, x, y);
  setRank(u, 3); u.xp = 10;
  u.hp = u.max / 2;
  S.time = 100; u.fought = 100 - RANK_CALM + 0.5;
  updUnit(u, 1);
  assert.equal(u.hp, u.max / 2, 'ha combattuto da poco');
  u.fought = 100 - RANK_CALM;
  updUnit(u, 1);
  assert.ok(Math.abs(u.hp - (u.max / 2 + u.max * RANKS[3].regen)) < 1e-9, `${u.hp}`);
  u.hp = u.max - 0.1; updUnit(u, 1);
  assert.equal(u.hp, u.max, 'non supera i punti massimi');
  // subire danno o sparare azzera la calma
  u.hp = u.max / 2; damage(u, 1, E);
  assert.equal(u.fought, S.time);
  const h = u.hp; updUnit(u, 1); assert.equal(u.hp, h);
  // il veterano non si ripara
  const v = makeUnit(P, LMG, x + 20, y); setRank(v, 2); v.hp = v.max / 2;
  updUnit(v, 1); assert.equal(v.hp, v.max / 2);
  // un asso che non ha mai combattuto si ripara subito
  const w = makeUnit(P, LMG, x - 20, y); setRank(w, 3); w.hp = w.max / 2;
  updUnit(w, 1); assert.ok(w.hp > w.max / 2);
});

test('il modulo riparazione fa carriera: +0,5 di esperienza ogni 150 punti riparati davvero', () => {
  newGame('normale', 12345);
  const [x, y] = at(...free(20, 14));
  const r = makeUnit(P, { c: 'M', p: 'W', w: 'RP' }, x, y);
  const hurt = makeUnit(P, { c: 'H', p: 'T', w: 'MG' }, x + 30, y);
  hurt.hp = hurt.max - 400;
  for (let i = 0; i < 100; i++) updUnit(r, 0.1); // 10 s × 15 = 150 punti
  assert.ok(Math.abs(hurt.hp - (hurt.max - 250)) < 1e-6, `${hurt.hp}`);
  assert.equal(r.xp, RANK_XP.repair);
  for (let i = 0; i < 400; i++) updUnit(r, 0.1); // altri 250 punti e poi niente da riparare
  assert.equal(hurt.hp, hurt.max);
  assert.equal(r.xp, 1, '400 punti riparati: due volte 150');
  for (let i = 0; i < 300; i++) updUnit(r, 0.1);
  assert.equal(r.xp, 1, 'riparare un mezzo già intero non dà esperienza');
  // con abbastanza riparazioni sale di grado (2 di esperienza = 600 punti)
  hurt.hp = hurt.max - 300;
  for (let i = 0; i < 300; i++) updUnit(r, 0.1);
  assert.equal(r.xp, 2); assert.equal(r.rank, 1);
});

test('salvataggi dei gradi: xp e rank conservati; i salvataggi vecchi hanno reclute; i valori strani si riparano', () => {
  newGame('normale', 12345);
  const u = makeUnit(P, LMG, 300, 300); gainXp(u, 6.5);
  const id = u.id;
  let st = roundTrip();
  loadState(st);
  let v = S.ents.find(e => e.id === id);
  assert.equal(v.xp, 6.5); assert.equal(v.rank, 2); assert.equal(v.max, Math.round(CHASSIS.L.hp * 1.2));
  st = roundTrip();
  for (const e of st.ents) if (e.kind === 'unit') { delete e.xp; delete e.rank; }
  loadState(st);
  for (const e of S.ents) if (e.kind === 'unit') { assert.equal(e.xp, 0); assert.equal(e.rank, 0); }
  run(5);
  st = roundTrip();
  const us = st.ents.filter(e => e.kind === 'unit');
  us[0].rank = 9; us[0].xp = -4; us[1].rank = 'asso'; us[1].xp = 'tanta';
  loadState(st);
  const a = S.ents.find(e => e.id === us[0].id), b = S.ents.find(e => e.id === us[1].id);
  assert.equal(a.rank, 3); assert.equal(a.xp, 0); assert.equal(b.rank, 0); assert.equal(b.xp, 0);
});

/* ================= veterani in campagna ================= */

// Partita della missione i con mezzi del giocatore promossi a mano: specs = [[progetto, xp]].
function gameWithVeterans(i, specs) {
  mission(i);
  const [tx, ty] = free(B0.x + 6, B0.y + 6);
  return specs.map(([d, xp], k) => { const u = makeUnit(P, d, ...at(tx + (k % 4), ty + Math.floor(k / 4))); gainXp(u, xp); return u; });
}

test('missionVeterans: al più 3, solo dal grado 2, prima gli assi poi per esperienza; niente genieri, nemici, morti, Macchina di Villo', () => {
  assert.equal(VETERANS_MAX, 3); assert.equal(VETERANS_RANK, 2);
  const [a, b, c, d, dead] = gameWithVeterans(0, [[HCN, 12], [MCN, 6], [LMG, 7], [LMG, 4.5], [HCN, 30]]);
  kill(dead, E);
  const e = makeUnit(E, HCN, 900, 900); gainXp(e, 20);
  gainXp(hero(), 25);
  const v = missionVeterans(S);
  assert.deepEqual(v, [{ d: HCN, rank: 3, xp: 12 }, { d: LMG, rank: 2, xp: 7 }, { d: MCN, rank: 2, xp: 6 }]);
  assert.ok(d.rank === 1);
  // con quattro idonei resta fuori il meno esperto
  const extra = makeUnit(P, MCN, a.x, a.y + 40); gainXp(extra, 5);
  assert.equal(missionVeterans(S).length, 3);
  assert.ok(!missionVeterans(S).some(x => x.xp === 5));
  assert.deepEqual(missionVeterans(null), []);
  assert.deepEqual(missionVeterans({}), []);
  void b; void c;
});

test('veterani: la vittoria li ricorda, la missione dopo li mette in campo in più, con grado, esperienza e punti pieni', () => {
  gameWithVeterans(0, [[HCN, 12], [MCN, 6], [LMG, 7], [LMG, 3]]);
  gainXp(hero(), 5.5);
  S.phase = 'won';
  const camp = finishMission({ ...newCampaign(), unlocked: 1 }, 0, S);
  assert.deepEqual(camp.veterans, [{ d: HCN, rank: 3, xp: 12 }, { d: LMG, rank: 2, xp: 7 }, { d: MCN, rank: 2, xp: 6 }]);
  assert.deepEqual(camp.hero, { rank: 2, xp: 5.5 });
  // salvataggio della campagna come JSON
  const saved = normalizeCampaign(JSON.parse(JSON.stringify(camp)));
  assert.deepEqual(saved.veterans, camp.veterans); assert.deepEqual(saved.hero, camp.hero);
  const o = missionOpts(saved, 1);
  assert.deepEqual(o.veterans, camp.veterans); assert.deepEqual(o.hero, camp.hero);
  startMission(saved, 1);
  const M = MISSIONS[1];
  const vets = units(P, u => u.vet);
  assert.equal(vets.length, 3);
  assert.deepEqual(vets.map(u => [u.d, u.rank, u.xp]), camp.veterans.map(v => [v.d, v.rank, v.xp]));
  for (const u of vets) { assert.equal(u.max, unitMaxHp(u)); assert.equal(u.hp, u.max); }
  assert.equal(vets[0].max, Math.round(CHASSIS.H.hp * PROPS.T.hpm * 1.3), 'asso pesante anche se la missione è di livello II');
  assert.equal(units(P, u => !u.builder && !u.hero && !u.vet).length, M.player.units.length, 'i mezzi di partenza ci sono tutti');
  // posti distinti e liberi
  const tiles = new Set(units(P).map(u => `${Math.floor(u.x / TILE)},${Math.floor(u.y / TILE)}`));
  assert.equal(tiles.size, units(P).length, 'ogni mezzo su una casella sua');
  const h = hero();
  assert.equal(h.rank, 2); assert.equal(h.xp, 5.5); assert.equal(S.hero.rank, 2);
  // una vittoria senza veterani svuota l'elenco
  S.phase = 'won';
  for (const u of vets) kill(u, E);
  const camp2 = finishMission(saved, 1, S);
  assert.deepEqual(camp2.veterans, []);
  assert.deepEqual(camp2.hero, { rank: 2, xp: 5.5 });
});

test('veterani: la sconfitta e la schermaglia non cambiano nulla; la Macchina di Villo non perde mai esperienza', () => {
  gameWithVeterans(0, [[HCN, 12]]);
  S.phase = 'lost';
  const c0 = { ...newCampaign(), veterans: [{ d: MCN, rank: 2, xp: 5 }], hero: { rank: 3, xp: 11 } };
  assert.deepEqual(finishMission(c0, 0, S).veterans, c0.veterans);
  newGame('normale', 1); S.phase = 'won';
  assert.deepEqual(finishMission(c0, 0, S).veterans, c0.veterans);
  mission(0); S.phase = 'won';
  assert.deepEqual(finishMission(c0, 0, S).hero, { rank: 3, xp: 11 }, 'la partita con meno esperienza non abbassa');
});

test('normalizeCampaign e newGame ripuliscono i veterani: gradi bassi, progetti non validi, troppi', () => {
  const c = normalizeCampaign({
    veterans: [
      { d: LMG, rank: 1, xp: 3 }, { d: { c: 'Z', p: 'W', w: 'MG' }, rank: 3, xp: 10 }, { d: HERO.design, rank: 3, xp: 20 },
      null, 'carro', { d: MCN, rank: 2 }, { d: HCN, xp: 11 }, { d: LMG, rank: 3, xp: 50 }, { d: MCN, rank: 2, xp: 9 },
    ],
    hero: { rank: 'boh', xp: 7 },
  });
  assert.deepEqual(c.veterans, [{ d: LMG, rank: 3, xp: 50 }, { d: HCN, rank: 3, xp: 11 }, { d: MCN, rank: 2, xp: 9 }]);
  assert.deepEqual(c.hero, { rank: 2, xp: 7 });
  assert.deepEqual(normalizeCampaign({ veterans: 'tanti', hero: 3 }).veterans, []);
  assert.deepEqual(normalizeCampaign({ hero: null }).hero, { rank: 0, xp: 0 });
  // newGame: al più VETERANS_MAX; solo in missione
  const many = Array.from({ length: 6 }, () => ({ d: LMG, rank: 2, xp: 5 }));
  mission(0, { veterans: many });
  assert.equal(units(P, u => u.vet).length, VETERANS_MAX);
  newGame('normale', 1, { veterans: many });
  assert.equal(units(P, u => u.vet).length, 0, 'in schermaglia i veterani si ignorano');
  mission(0, { veterans: [{ d: HERO.design, rank: 3, xp: 10 }] });
  assert.equal(units(P, u => u.vet).length, 0, 'la Macchina di Villo non entra come veterano');
  assert.equal(units(P, u => u.hero).length, 1);
});

/* ================= Macchina di Villo ================= */

test('HERO: otto livelli che crescono, respawn 60, ruote; telaio e arma nascosti dagli elenchi', () => {
  assert.equal(HERO.levels.length, MISSIONS.length);
  for (let i = 1; i < HERO.levels.length; i++) for (const k of ['hp', 'armor', 'dmg', 'worth']) assert.ok(HERO.levels[i][k] >= HERO.levels[i - 1][k], `livello ${i + 1}.${k}`);
  assert.equal(HERO.respawn, 60); assert.equal(HERO.design.p, 'W'); assert.equal(HERO_W.bigEvery, 3);
  assert.ok(HERO_W.bigSplash > HERO_W.splash && HERO_W.bigDmg > 1);
  assert.ok(!Object.keys(CHASSIS).includes('VILLO')); assert.ok(!Object.keys(WEAPONS).includes('VILLO'));
  assert.equal(CHASSIS.VILLO.hero, true); assert.equal(WEAPONS.VILLO, HERO_W);
  assert.equal(isHeroDesign(HERO.design), true); assert.equal(validDesign(HERO.design), false);
  assert.equal(isHeroDesign({ c: 'L', p: 'W', w: 'VILLO' }), true); assert.equal(isHeroDesign(LMG), false); assert.equal(isHeroDesign(null), false);
});

test('Macchina di Villo in tutte le 8 missioni: una sola, accanto al comando, livello = numero della missione', () => {
  MISSIONS.forEach((M, i) => {
    mission(i);
    const hs = units(P, u => u.hero);
    assert.equal(hs.length, 1, M.id);
    const h = hs[0], L = HERO.levels[i], hq = structs(P, 'hq')[0];
    assert.equal(h.hero, HERO.id);
    assert.deepEqual(S.hero, { id: h.id, down: false, backAt: null, rank: 0, xp: 0, lvl: i + 1 });
    assert.equal(heroLevel(), L);
    assert.equal(h.max, L.hp); assert.equal(h.hp, L.hp);
    assert.equal(armorOf(h), L.armor);
    assert.equal(h.speed, HERO.speed); assert.equal(h.water, false);
    assert.ok(Math.hypot(h.x - hq.x, h.y - hq.y) < 6 * TILE, `${M.id}: lontana dal comando`);
    assert.equal(dStats(HERO.design, P).hp, L.hp);
    assert.equal(units(E, u => u.hero).length, 0);
  });
});

test('Macchina di Villo mai in schermaglia (mappa generata o disegnata, anche passando hero)', () => {
  for (const opts of [undefined, { weather: 'rain' }, { map: 'latina' }, { hero: { rank: 3, xp: 30 } }, { autoplay: true }]) {
    newGame('normale', 12345, opts);
    assert.equal(S.hero, null, JSON.stringify(opts));
    assert.equal(S.ents.filter(e => e.hero).length, 0, JSON.stringify(opts));
  }
  newGame('normale', 12345, { autoplay: true });
  run(60);
  assert.equal(S.ents.filter(e => e.hero).length, 0, 'l’IA non la produce');
});

test('la Macchina di Villo non si produce, non si salva tra i progetti e non conta per il limite dei mezzi', () => {
  mission(2); // ha già una fabbrica
  const fac = structs(P, 'factory')[0];
  const res = S.res[P];
  assert.equal(enqueue(fac, HERO.design, P), false);
  assert.equal(enqueue(fac, { c: 'VILLO', p: 'W', w: 'MG' }, P), false);
  assert.equal(enqueue(fac, { c: 'L', p: 'W', w: 'VILLO' }, P), false);
  assert.equal(fac.queue.length, 0); assert.equal(S.res[P], res);
  assert.equal(unitCount(P), units(P).length - 1, 'la Macchina di Villo non conta');
  mission(0, { designs: [HERO.design, LMG] });
  assert.deepEqual(S.designs, [LMG]);
  mission(0, { designs: [HERO.design] });
  assert.deepEqual(S.designs, DEFAULT_DESIGNS);
  assert.deepEqual(normalizeCampaign({ designs: [HERO.design, MCN] }).designs, [MCN]);
});

test('Bassi a palla: colpo grosso ogni terzo colpo, fx hero/big, danno ad area, danno del livello e del grado', () => {
  mission(3);
  const h = hero(), L = HERO.levels[3];
  const [x, y] = at(32, 32);
  const rec = recordEvents();
  try {
    const shots = [];
    for (let n = 1; n <= 6; n++) {
      const t = makeUnit(E, { c: 'X', p: 'TR', w: 'MG' }, x, y), near = makeUnit(E, LMG, x + 2 * TILE, y);
      const h0 = t.hp, n0 = near.hp;
      fire(x - 150, y, 0, t, HERO_W, P, 12, h);
      shots.push({ dmg: h0 - t.hp, near: n0 - near.hp, t });
      kill(t, P); kill(near, P);
    }
    const flashes = rec.of('fx').filter(f => f.k === 'flash' && f.w === 'VILLO');
    const booms = rec.of('fx').filter(f => f.k === 'boom' && f.kind === 'shot');
    assert.equal(flashes.length, 6); assert.equal(booms.length, 6);
    flashes.forEach((f, i) => {
      const big = (i + 1) % 3 === 0;
      assert.equal(f.hero, true); assert.equal(!!f.big, big, `colpo ${i + 1}`);
      assert.equal(f.owner, P); assert.ok(Number.isFinite(f.tx) && Number.isFinite(f.ty));
      assert.equal(booms[i].hero, true); assert.equal(!!booms[i].big, big);
      assert.ok(booms[i].size > 0);
      const want = hitDamage(shots[i].t, L.dmg * (big ? HERO_W.bigDmg : 1), HERO_W);
      assert.ok(Math.abs(shots[i].dmg - want) < 1e-6, `colpo ${i + 1}: ${shots[i].dmg} invece di ${want}`);
      // a due caselle: fuori dall'area normale (1,5), dentro quella grossa (2,4)
      assert.equal(shots[i].near > 0, big, `colpo ${i + 1}: area`);
    });
    assert.equal(h.shots, 6);
    // il grado vale anche per lei
    setRank(h, 3);
    const t = makeUnit(E, { c: 'X', p: 'TR', w: 'MG' }, x, y), h0 = t.hp;
    fire(x - 150, y, 0, t, HERO_W, P, 12, h);
    assert.ok(Math.abs((h0 - t.hp) - hitDamage(t, L.dmg * RANKS[3].dmg, HERO_W)) < 1e-6);
    // i colpi normali degli altri mezzi non hanno hero
    const u = makeUnit(P, LMG, x - 100, y);
    fire(u.x, u.y, 0, t, WEAPONS.MG, P, 10, u);
    assert.equal(rec.of('fx').filter(f => f.k === 'flash').at(-1).hero, undefined);
  } finally { rec.stop(); }
});

test('Macchina di Villo distrutta: non fa perdere, torna dopo HERO.respawn secondi accanto al comando con grado ed esperienza', () => {
  mission(1);
  let h = hero();
  gainXp(h, 6);
  assert.equal(S.hero.rank, 2); assert.equal(S.hero.xp, 6);
  const rec = recordEvents();
  try {
    h.hp = 1; damage(h, 50, E);
    assert.ok(h.dead);
    assert.equal(S.hero.down, true); assert.equal(S.hero.id, 0); assert.equal(S.hero.backAt, S.time + HERO.respawn);
    assert.deepEqual(rec.of('hero'), [{ state: 'down', x: h.x, y: h.y }]);
    assert.ok(rec.of('toast').some(t => /carrozziere/.test(t.text)));
    missionTick();
    assert.equal(S.phase, 'play', 'perdere la Macchina di Villo non fa perdere la missione');
    // salvataggio mentre è dal carrozziere
    loadState(roundTrip());
    assert.equal(S.hero.down, true);
    S.time = S.hero.backAt - 1; step(0.05);
    assert.equal(units(P, u => u.hero).length, 0, 'non torna prima del tempo');
    S.time = S.hero.backAt - 0.01; step(0.05);
    h = hero();
    assert.ok(h, 'è tornata');
    assert.equal(h.rank, 2); assert.equal(h.xp, 6); assert.equal(h.hp, h.max); assert.equal(h.max, Math.round(HERO.levels[1].hp * RANKS[2].hp));
    assert.deepEqual(S.hero, { id: h.id, down: false, backAt: null, rank: 2, xp: 6, lvl: 2 });
    const back = rec.of('hero').at(-1);
    assert.equal(back.state, 'back'); assert.equal(back.x, h.x); assert.equal(back.y, h.y);
    const hq = structs(P, 'hq')[0];
    assert.ok(Math.hypot(h.x - hq.x, h.y - hq.y) < 6 * TILE);
    assert.equal(rec.of('hero').length, 2);
  } finally { rec.stop(); }
});

test('Macchina di Villo: senza comando non torna (aspetta), e torna se il comando c’è di nuovo', () => {
  mission(0);
  const hq = structs(P, 'hq')[0], spot = [hq.tx, hq.ty];
  kill(hero(), E);
  kill(hq, E);
  S.time = S.hero.backAt + 5; step(0.05);
  assert.equal(S.phase, 'play', 'i genieri tengono in gioco');
  assert.equal(units(P, u => u.hero).length, 0);
  assert.equal(S.hero.down, true);
  run(2);
  assert.equal(units(P, u => u.hero).length, 0);
  // un comando in costruzione non basta
  const site = makeStruct('hq', P, spot[0], spot[1], false);
  step(0.05);
  assert.equal(units(P, u => u.hero).length, 0, 'il cantiere non conta');
  site.built = 1; step(0.05);
  assert.equal(units(P, u => u.hero).length, 1);
});

test('la Macchina di Villo prende esperienza come gli altri e la tiene in S.hero', () => {
  mission(0);
  const h = hero();
  const rec = recordEvents();
  try {
    for (let i = 0; i < 2; i++) { const t = makeUnit(E, LMG, h.x + 60, h.y); damage(t, 9999, P, HERO_W, h.id); }
    assert.equal(h.xp, 2); assert.equal(h.rank, 1);
    assert.equal(S.hero.xp, 2); assert.equal(S.hero.rank, 1);
    assert.equal(rec.of('rank').at(-1).id, h.id);
  } finally { rec.stop(); }
  // grado portato dalla campagna
  mission(4, { hero: { rank: 1, xp: 11 } });
  assert.equal(hero().rank, 3); assert.equal(hero().xp, 11); assert.equal(hero().max, Math.round(HERO.levels[4].hp * 1.3));
  mission(4, { hero: { rank: 'x', xp: -3 } });
  assert.equal(hero().rank, 0); assert.equal(hero().xp, 0);
});

test('salvataggi di missione con la Macchina di Villo: i nuovi la conservano, i vecchi senza S.hero non danno errori', () => {
  mission(2);
  const id = hero().id;
  let st = roundTrip();
  loadState(st);
  assert.equal(S.hero.id, id); assert.equal(hero().id, id); assert.equal(S.hero.lvl, 3);
  assert.equal(hero().max, HERO.levels[2].hp);
  run(5);
  // salvataggio di prima della Macchina di Villo: niente campo hero e niente mezzo
  st = roundTrip(); delete st.hero; st.ents = st.ents.filter(e => !e.hero);
  loadState(st);
  assert.equal(S.hero, null);
  run(10);
  assert.equal(units(P, u => u.hero).length, 0);
  assert.equal(S.phase, 'play');
  // caso strano: il mezzo c'è ma S.hero manca (o non è un oggetto): distruggerlo non dà errori e non torna
  mission(2);
  st = roundTrip(); st.hero = 'villo';
  loadState(st);
  assert.equal(S.hero, null);
  const h = units(P, u => u.hero)[0];
  assert.ok(h);
  assert.doesNotThrow(() => { damage(h, 1e6, E); run(70); });
  assert.equal(units(P, u => u.hero).length, 0);
  // la vittoria di una partita senza S.hero non tocca la Macchina di Villo della campagna
  S.phase = 'won';
  const c = finishMission({ ...newCampaign(), hero: { rank: 1, xp: 3 } }, 2, S);
  assert.deepEqual(c.hero, { rank: 1, xp: 3 });
});

test('IA in autoplay in missione: usa la Macchina di Villo senza errori e senza smontarla', () => {
  const restore = seedRandom(5);
  try {
    newGame('normale', MISSIONS[1].seed, { mission: 1, autoplay: true });
    const id = hero().id;
    run(240);
    assert.ok(S.hero.down || ent(id), 'o è in campo o è dal carrozziere');
    if (!S.hero.down) assert.equal(hero().id, id);
  } finally { restore(); }
});

function ent(id) { return S.ents.find(e => e.id === id && !e.dead); }
