// Fase C del piano 02: stato della campagna «Operazione Valle Grigia» (engine/campaign.js), funzioni pure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  P, E, MISSIONS, TECH, TECH_BY, DEFAULT_DESIGNS, S,
  newCampaign, normalizeCampaign, finishMission, nextCampaignState, campaignSummary, missionOpts, canPlayMission,
  startMission, objectiveLabel, CAMPAIGN_VERSION, newGame,
} from '../index.js';

const LMG = { c: 'L', p: 'W', w: 'MG' }, MCN = { c: 'M', p: 'HT', w: 'CN' }, HCN = { c: 'H', p: 'T', w: 'CN75' };
const deepFreeze = o => { if (o && typeof o === 'object') { Object.freeze(o); for (const k in o) deepFreeze(o[k]); } return o; };
// Partita finta con i soli campi che finishMission legge.
const fakeGame = (i, over = {}) => ({ phase: 'won', mission: MISSIONS[i].id, time: 600.4, tech: [{}, {}], designs: [LMG], ...over });

/* ---------- stato iniziale ---------- */

test('newCampaign: solo la prima missione sbloccata, niente vinto, niente ricerche, progetto di partenza', () => {
  const c = newCampaign();
  // Piano 10: lo stato della campagna ha anche i veterani (nessuno) e la Macchina di Villo (recluta, senza esperienza).
  assert.deepEqual(c, { v: CAMPAIGN_VERSION, unlocked: 1, done: [], tech: {}, designs: DEFAULT_DESIGNS, best: {}, veterans: [], hero: { rank: 0, xp: 0 } });
  assert.deepEqual(c.designs, [LMG]);
  assert.notEqual(c.designs[0], DEFAULT_DESIGNS[0], 'i progetti sono una copia, non i dati condivisi');
  c.designs[0].w = 'CN';
  assert.equal(DEFAULT_DESIGNS[0].w, 'MG');
  assert.deepEqual(newCampaign().designs, [LMG]);
});

test('MISSIONS: otto missioni con id unici, semi fissi, livelli che non scendono e obiettivi noti', () => {
  assert.equal(MISSIONS.length, 8);
  assert.equal(new Set(MISSIONS.map(m => m.id)).size, 8);
  const types = new Set(['outpost', 'hold', 'survive', 'survive_then_destroy', 'destroy', 'destroy_all_bases']);
  let prev = 1;
  for (const m of MISSIONS) {
    assert.ok(Number.isInteger(m.seed), m.id);
    assert.ok(m.maxTier >= prev && m.maxTier <= 4, `${m.id}: livello ${m.maxTier}`);
    prev = m.maxTier;
    assert.ok(types.has(m.objective.type), m.id);
    assert.ok(m.name && m.brief, m.id);
    for (const id of m.enemy.tech || []) assert.ok(TECH_BY[id], `${m.id}: ricerca sconosciuta ${id}`);
  }
  assert.deepEqual(MISSIONS.map(m => m.maxTier), [1, 2, 2, 3, 3, 3, 4, 4]);
  assert.deepEqual(MISSIONS.map(m => m.objective.type),
    ['outpost', 'hold', 'survive', 'destroy', 'destroy', 'destroy_all_bases', 'survive_then_destroy', 'destroy']);
});

/* ---------- sblocco e avvio ---------- */

test('canPlayMission: per indice o id, solo le missioni sbloccate', () => {
  const c = newCampaign();
  assert.equal(canPlayMission(c, 0), true);
  assert.equal(canPlayMission(c, 'testa-di-ponte'), true);
  assert.equal(canPlayMission(c, 1), false);
  assert.equal(canPlayMission(c, 'pozzi-del-guado'), false);
  assert.equal(canPlayMission(c, -1), false);
  assert.equal(canPlayMission(c, 8), false);
  assert.equal(canPlayMission(c, 'non-esiste'), false);
  c.unlocked = 8;
  for (let i = 0; i < 8; i++) assert.equal(canPlayMission(c, i), true);
  assert.equal(canPlayMission(c, 8), false);
});

test('startMission rifiuta le missioni bloccate e quelle che non esistono', () => {
  const c = newCampaign();
  for (const m of [1, 7, 'contrattacco', 99, 'boh']) assert.throws(() => startMission(c, m), /non ancora sbloccata/, String(m));
});

test('startMission: seme della missione, ricerche e progetti della campagna, opzioni in più', () => {
  const c = { ...newCampaign(), unlocked: 4, tech: { dMG1: true, chM: true, wCN: true }, designs: [LMG, MCN] };
  const before = structuredClone(c);
  const st = startMission(c, 3, 'difficile', { autoplay: true });
  assert.equal(st, S);
  assert.equal(S.mission, MISSIONS[3].id);
  assert.equal(S.seed, MISSIONS[3].seed);
  assert.equal(S.diff, 'difficile');
  assert.equal(S.maxTier, MISSIONS[3].maxTier);
  assert.equal(S.autoplay, true);
  assert.deepEqual(S.tech[P], { dMG1: true, chM: true, wCN: true });
  assert.deepEqual(S.designs, [LMG, MCN]);
  // la partita non condivide oggetti con la campagna
  S.tech[P].arm = true; S.designs.push(HCN); S.designs[0].w = 'HMG';
  assert.deepEqual(c, before);
  // per id e senza autoplay
  startMission(c, 'testa-di-ponte');
  assert.equal(S.mission, 'testa-di-ponte');
  assert.equal(S.diff, 'normale');
  assert.ok(!S.autoplay);
});

test('missionOpts: copie delle ricerche e dei progetti; missione sconosciuta è un errore', () => {
  const c = { ...newCampaign(), tech: { dMG1: true }, designs: [LMG] };
  const o = missionOpts(c, 'pozzi-del-guado');
  // Piano 10: le opzioni portano anche i veterani e la Macchina di Villo della campagna (qui nessuno e recluta).
  assert.deepEqual(o, { mission: 1, tech: { dMG1: true }, designs: [LMG], veterans: [], hero: { rank: 0, xp: 0 } });
  o.tech.mot1 = true; o.designs[0].c = 'M';
  assert.deepEqual(c.tech, { dMG1: true });
  assert.deepEqual(c.designs, [LMG]);
  assert.throws(() => missionOpts(c, 8), /sconosciuta/);
  assert.throws(() => missionOpts(c, 'boh'), /sconosciuta/);
});

/* ---------- fine missione ---------- */

test('finishMission dopo una vittoria: ricerche e progetti sommati senza doppioni, missione vinta, successiva sbloccata', () => {
  const c = deepFreeze({ ...newCampaign(), unlocked: 2, done: ['testa-di-ponte'], tech: { dMG1: true, mot1: true }, designs: [LMG, MCN], best: { 'testa-di-ponte': 500 } });
  const before = structuredClone(c);
  const g = fakeGame(1, { tech: [{ mot1: true, chM: true, wCN: true, nonEsiste: true, prHT: false }, { arm3: true }], designs: [MCN, HCN, LMG, MCN, { c: 'Z', p: 'W', w: 'MG' }] });
  const n = finishMission(c, 1, g);
  assert.deepEqual(c, before, 'non modifica la campagna passata');
  assert.notEqual(n, c);
  assert.deepEqual(n.tech, { dMG1: true, mot1: true, chM: true, wCN: true }, 'solo le ricerche vere del giocatore, una volta');
  assert.deepEqual(n.designs, [LMG, MCN, HCN], 'progetti senza doppioni né progetti non validi, nell’ordine');
  assert.deepEqual(n.done, ['testa-di-ponte', 'pozzi-del-guado']);
  assert.equal(n.unlocked, 3);
  assert.deepEqual(n.best, { 'testa-di-ponte': 500, 'pozzi-del-guado': 600 }, 'tempo arrotondato al secondo');
  assert.equal(nextCampaignState, finishMission, 'alias del piano');
  // la partita non è cambiata
  assert.equal(g.tech[P].nonEsiste, true);
});

test('finishMission: miglior tempo solo se più basso; rigiocare una missione vecchia non toglie sblocchi', () => {
  let c = { ...newCampaign(), unlocked: 5, done: MISSIONS.slice(0, 4).map(m => m.id), best: { 'testa-di-ponte': 500 } };
  c = finishMission(c, 0, fakeGame(0, { time: 620 }));
  assert.equal(c.best['testa-di-ponte'], 500, 'un tempo peggiore non sostituisce il migliore');
  assert.equal(c.unlocked, 5);
  assert.deepEqual(c.done, MISSIONS.slice(0, 4).map(m => m.id), 'nessun doppione tra le vinte');
  c = finishMission(c, 0, fakeGame(0, { time: 431.6 }));
  assert.equal(c.best['testa-di-ponte'], 432);
  c = finishMission(c, 0, fakeGame(0, { time: 432 }));
  assert.equal(c.best['testa-di-ponte'], 432);
});

test('finishMission: l’ordine di done segue le missioni anche se si vincono fuori ordine', () => {
  let c = { ...newCampaign(), unlocked: 8 };
  for (const i of [5, 2, 7, 0]) c = finishMission(c, i, fakeGame(i));
  assert.deepEqual(c.done, [0, 2, 5, 7].map(i => MISSIONS[i].id));
  assert.equal(c.unlocked, 8, 'mai oltre l’ultima missione');
});

test('finishMission dopo una sconfitta, una partita in corso o di un’altra missione non cambia nulla', () => {
  const c = deepFreeze({ ...newCampaign(), unlocked: 3, done: ['testa-di-ponte', 'pozzi-del-guado'], tech: { dMG1: true }, best: { 'testa-di-ponte': 400 } });
  const tech = [{ chM: true, wCN: true }, {}], designs = [MCN];
  for (const g of [
    fakeGame(2, { phase: 'lost', tech, designs, time: 100 }),
    fakeGame(2, { phase: 'play', tech, designs, time: 100 }),
    fakeGame(3, { tech, designs, time: 100 }), // partita della missione 4 passata come missione 3
    null, undefined,
  ]) assert.deepEqual(finishMission(c, 2, g), normalizeCampaign(c), JSON.stringify(g && g.phase));
  assert.deepEqual(finishMission(c, 99, fakeGame(2)), normalizeCampaign(c), 'missione sconosciuta');
});

test('finishMission con una schermaglia (S.mission null o assente) non cambia nulla, nemmeno se vinta', () => {
  const c = deepFreeze({ ...newCampaign(), unlocked: 2, done: ['testa-di-ponte'], tech: { dMG1: true }, best: { 'testa-di-ponte': 400 } });
  const tech = [{ chM: true, wCN: true, pump2: true }, {}], designs = [MCN, HCN];
  for (const i of [0, 1, 7]) {
    for (const g of [
      fakeGame(i, { mission: null, tech, designs, time: 100 }),
      fakeGame(i, { mission: undefined, tech, designs, time: 100 }),
      (({ mission, ...rest }) => rest)(fakeGame(i, { tech, designs, time: 100 })),
    ]) assert.deepEqual(finishMission(c, i, g), normalizeCampaign(c), `missione ${i + 1}, mission ${g.mission}`);
  }
  // partita vera di schermaglia, vinta
  newGame('normale', 12345);
  assert.equal(S.mission, null);
  S.tech[P].chM = true; S.designs.push(MCN); S.time = 300; S.phase = 'won';
  for (const i of [0, 1]) assert.deepEqual(finishMission(c, i, S), normalizeCampaign(c), `schermaglia passata come missione ${i + 1}`);
});

test('finishMission con la partita vera: dalla missione 1 vinta alla missione 2 con le ricerche fatte', () => {
  let c = newCampaign();
  startMission(c, 0);
  S.tech[P].dMG1 = true; S.tech[P].pump2 = true; S.tech[E].mot1 = true;
  S.designs.push(LMG);
  S.time = 512.3;
  assert.deepEqual(finishMission(c, 0, S), normalizeCampaign(c), 'partita ancora in corso');
  S.phase = 'won';
  c = finishMission(c, 0, S);
  assert.deepEqual(c.tech, { dMG1: true, pump2: true }, 'le ricerche del nemico non passano');
  assert.deepEqual(c.designs, [LMG]);
  assert.equal(c.unlocked, 2);
  assert.equal(c.best['testa-di-ponte'], 512);
  startMission(c, 1);
  assert.deepEqual(S.tech[P], { dMG1: true, pump2: true });
  assert.deepEqual(S.tech[E], Object.fromEntries((MISSIONS[1].enemy.tech || []).map(id => [id, true])));
});

/* ---------- dati letti dal dispositivo ---------- */

test('normalizeCampaign: valori non riconoscibili danno una campagna nuova', () => {
  for (const v of [null, undefined, 0, 42, '', 'campagna', true, NaN]) assert.deepEqual(normalizeCampaign(v), newCampaign(), String(v));
  assert.deepEqual(normalizeCampaign({}), newCampaign());
  assert.deepEqual(normalizeCampaign([]), newCampaign());
});

test('normalizeCampaign ripara dati corrotti: sblocchi, vinte, ricerche, progetti e tempi', () => {
  const c = normalizeCampaign({
    v: 0, unlocked: '3.7', done: ['pozzi-del-guado', 'boh', 'testa-di-ponte', 'pozzi-del-guado', 7],
    tech: { dMG1: true, chM: 1, wCN: false, falsa: true, arm3: 'sì' },
    designs: [LMG, LMG, { c: 'M', p: 'HT', w: 'CN', extra: 1 }, { c: 'M', p: 'XX', w: 'CN' }, null, 'LWMG', {}],
    best: { 'testa-di-ponte': '300', 'pozzi-del-guado': -5, 'colonna-rifornimenti': 'veloce', 'boh': 10, 'passo-dei-larici': 0, 'diga-serra-alta': Infinity },
    altro: 'ignorato',
  });
  assert.deepEqual(c, {
    v: CAMPAIGN_VERSION, unlocked: 3, done: ['testa-di-ponte', 'pozzi-del-guado'],
    tech: { dMG1: true, chM: true, arm3: true }, designs: [LMG, MCN], best: { 'testa-di-ponte': 300 },
    // piano 10: uno stato salvato senza veterani e senza Macchina di Villo vale «nessuno» e «recluta»
    veterans: [], hero: { rank: 0, xp: 0 },
  });
});

test('normalizeCampaign: sblocchi fuori scala e vinte che sbloccano la successiva', () => {
  assert.equal(normalizeCampaign({ unlocked: 99 }).unlocked, 8);
  assert.equal(normalizeCampaign({ unlocked: -4 }).unlocked, 1);
  assert.equal(normalizeCampaign({ unlocked: 0 }).unlocked, 1);
  assert.equal(normalizeCampaign({ unlocked: 'tanti' }).unlocked, 1);
  assert.equal(normalizeCampaign({ unlocked: null }).unlocked, 1);
  assert.equal(normalizeCampaign({ unlocked: 1, done: ['passo-dei-larici'] }).unlocked, 5, 'vinta la 4 → sbloccata la 5');
  assert.equal(normalizeCampaign({ unlocked: 1, done: ['comando-direttorio'] }).unlocked, 8);
  assert.equal(normalizeCampaign({ unlocked: 6, done: ['testa-di-ponte'] }).unlocked, 6, 'non toglie sblocchi');
});

test('normalizeCampaign: progetti tutti non validi o assenti tornano a quelli di partenza; formato vecchio completato', () => {
  assert.deepEqual(normalizeCampaign({ designs: [] }).designs, [LMG]);
  assert.deepEqual(normalizeCampaign({ designs: [{ c: 'Q' }, 3] }).designs, [LMG]);
  assert.deepEqual(normalizeCampaign({ designs: 'LWMG' }).designs, [LMG]);
  // formato senza versione e senza alcuni campi
  const old = normalizeCampaign({ unlocked: 2, done: ['testa-di-ponte'] });
  assert.deepEqual(old, { ...newCampaign(), unlocked: 2, done: ['testa-di-ponte'] });
});

test('normalizeCampaign: stabile e senza riferimenti all’oggetto letto', () => {
  const raw = { unlocked: 4, done: ['testa-di-ponte', 'pozzi-del-guado', 'colonna-rifornimenti'], tech: { dMG1: true }, designs: [MCN], best: { 'testa-di-ponte': 321 } };
  const before = structuredClone(raw);
  const a = normalizeCampaign(raw);
  assert.deepEqual(raw, before, 'non modifica i dati letti');
  assert.deepEqual(normalizeCampaign(a), a, 'una campagna valida resta uguale');
  assert.deepEqual(normalizeCampaign(JSON.parse(JSON.stringify(a))), a, 'regge il passaggio da JSON');
  a.designs[0].c = 'H'; a.tech.chH = true; a.done.push('x');
  assert.deepEqual(raw, before);
});

/* ---------- riassunto ---------- */

test('campaignSummary: campagna nuova', () => {
  const s = campaignSummary(newCampaign());
  assert.equal(s.missions.length, 8);
  assert.equal(s.total, 8);
  assert.equal(s.unlocked, 1);
  assert.equal(s.completed, 0);
  assert.equal(s.next, 0);
  assert.equal(s.finished, false);
  assert.equal(s.techCount, 0);
  assert.equal(s.designCount, 1);
  s.missions.forEach((m, i) => {
    assert.equal(m.index, i);
    assert.equal(m.id, MISSIONS[i].id);
    assert.equal(m.name, MISSIONS[i].name);
    assert.equal(m.brief, MISSIONS[i].brief);
    assert.equal(m.objective, MISSIONS[i].objective.type);
    assert.equal(m.maxTier, MISSIONS[i].maxTier);
    assert.equal(m.unlocked, i === 0);
    assert.equal(m.done, false);
    assert.equal(m.best, null);
    assert.ok(m.objectiveText && !/undefined|NaN/.test(m.objectiveText), m.objectiveText);
    assert.equal(m.objectiveText, objectiveLabel(MISSIONS[i].objective));
  });
  assert.deepEqual(s.missions.map(m => m.tiers), ['I', 'I–II', 'I–II', 'I–III', 'I–III', 'I–III', 'I–IV', 'I–IV']);
  assert.deepEqual(s.missions.map(m => m.objectiveText), [
    'Avvia 6 pompe e distruggi l’avamposto', 'Tieni 8 pompe per 9 minuti', 'Resisti 12 minuti', 'Distruggi la base nemica',
    'Distruggi la base nemica', 'Distruggi tutte le basi', 'Resisti 8 minuti, poi distruggi la base', 'Distruggi la base nemica',
  ]);
});

test('campaignSummary coerente lungo la campagna e alla fine', () => {
  let c = newCampaign();
  for (let i = 0; i < 8; i++) {
    const s = campaignSummary(c);
    assert.equal(s.next, i, `prossima missione dopo ${i} vittorie`);
    assert.equal(s.completed, i);
    assert.equal(s.unlocked, i + 1);
    assert.equal(s.missions.filter(m => m.unlocked).length, i + 1);
    assert.equal(s.missions.filter(m => m.done).length, i);
    c = finishMission(c, i, fakeGame(i, { time: 300 + i, tech: [{ [TECH[i].id]: true }, {}] }));
  }
  const s = campaignSummary(c);
  assert.equal(s.finished, true);
  assert.equal(s.next, null);
  assert.equal(s.completed, 8);
  assert.equal(s.techCount, 8);
  assert.deepEqual(s.missions.map(m => m.best), [300, 301, 302, 303, 304, 305, 306, 307]);
  // rigiocabili: tutte sbloccate
  for (let i = 0; i < 8; i++) assert.equal(canPlayMission(c, i), true);
});

test('campaignSummary: la prossima è la prima sbloccata non vinta; i dati corrotti non la rompono', () => {
  const s = campaignSummary({ unlocked: 5, done: ['testa-di-ponte', 'colonna-rifornimenti'], designs: [LMG, MCN, MCN] });
  assert.equal(s.next, 1);
  assert.equal(s.unlocked, 5);
  assert.equal(s.designCount, 2);
  assert.deepEqual(campaignSummary('rotto'), campaignSummary(newCampaign()));
});
