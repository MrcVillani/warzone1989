// La schermaglia non cambia con il bilanciamento della campagna: MISSION_DIFF, enemy.keep, enemy.factories e le
// novità dell'IA del giocatore valgono solo in missione (o con S.autoplay). A parità di seme della mappa e di
// casualità (Math.random con seme) la partita deve restare identica, passo per passo.
// Le impronte sotto sono state calcolate con il motore del commit d99bd29 (prima del bilanciamento della campagna).
// Vanno aggiornate solo quando si cambia apposta la schermaglia, e il cambio va detto nel commit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { S, P, B0, RANKS, newGame, step, makeStruct, canPlace, mulberry32 } from '../index.js';

function spot(type, cx, cy) {
  for (let r = 0; r < 30; r++) for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r) continue;
    if (canPlace(P, type, x, y, 1)) return [x, y];
  }
  return null;
}
// Partita di schermaglia con il giocatore fermo (più `towers` torrette pronte accanto al comando, perché duri qualche
// ondata), simulata a passi di 0,05 s per `secs` secondi o fino alla fine; impronta dello stato finale.
function fingerprint(diff, seed, rseed, secs, towers) {
  const orig = Math.random;
  Math.random = mulberry32(rseed);
  try {
    newGame(diff, seed);
    for (let k = 0; k < towers; k++) { const [x, y] = spot('tower', B0.x + 4, B0.y + 4); makeStruct('tower', P, x, y, true); }
    const n = Math.round(secs / 0.05);
    for (let i = 0; i < n && S.phase === 'play'; i++) step(0.05);
    const ents = S.ents.filter(e => !e.dead).map(e => [e.id, e.owner, e.type || 'u', e.kind, Math.round(e.x), Math.round(e.y), Math.round(e.hp), e.d ? `${e.d.c}${e.d.p}${e.d.w}` : '']);
    const str = JSON.stringify({ t: Math.round(S.time * 100), ph: S.phase, res: S.res.map(Math.round), tech: S.tech.map(t => Object.keys(t).filter(k => t[k]).sort()), ai: [S.ai.wave, S.ai.waveSize, Math.round(S.ai.nextAttack)], ents });
    return { hash: createHash('sha256').update(str).digest('hex').slice(0, 16), phase: S.phase, time: +S.time.toFixed(1), wave: S.ai.wave, made: S.stats.made.slice() };
  } finally { Math.random = orig; }
}

// Impronte del commit d99bd29. Con il piano 10 i gradi dei veterani valgono anche in schermaglia (per tutti e due i
// lati) e cambiano le partite: queste impronte restano valide solo con i gradi neutralizzati (withoutRanks), a prova
// che il resto della schermaglia serena (meteo predefinito, IA, produzione) non è cambiato.
const CASES = [
  { diff: 'normale', seed: 12345, rseed: 7, secs: 600, towers: 0, want: { hash: 'ea65823a7df88816', phase: 'lost', time: 276.1, wave: 1 } },
  { diff: 'difficile', seed: 2, rseed: 11, secs: 500, towers: 0, want: { hash: '3c156d20aea7975f', phase: 'lost', time: 209.1, wave: 1 } },
  { diff: 'facile', seed: 81, rseed: 3, secs: 400, towers: 0, want: { hash: 'a5d63c05d93639e6', phase: 'lost', time: 366.1, wave: 1 } },
  { diff: 'normale', seed: 12345, rseed: 7, secs: 900, towers: 14, want: { hash: '6d7f124ffa2cfa8c', phase: 'lost', time: 431.1, wave: 2, made: [0, 31] } },
  { diff: 'difficile', seed: 2, rseed: 11, secs: 900, towers: 14, want: { hash: '3b86968f3b5cf1da', phase: 'lost', time: 441.1, wave: 3, made: [0, 31] } },
];
// Le stesse partite con i gradi attivi (piano 10, «Meteo e veterani»): cambiano perché i mezzi che distruggono
// nemici salgono di grado (più danno e più punti struttura). La prima non cambia: nessun mezzo arriva a 2 distruzioni.
const CASES_RANKS = [
  { diff: 'normale', seed: 12345, rseed: 7, secs: 600, towers: 0, want: { hash: 'ea65823a7df88816', phase: 'lost', time: 276.1, wave: 1 } },
  { diff: 'difficile', seed: 2, rseed: 11, secs: 500, towers: 0, want: { hash: 'a2aabf66fb854e37', phase: 'lost', time: 209.1, wave: 1 } },
  { diff: 'facile', seed: 81, rseed: 3, secs: 400, towers: 0, want: { hash: 'b18a188b52a9edef', phase: 'lost', time: 366.1, wave: 1 } },
  { diff: 'normale', seed: 12345, rseed: 7, secs: 900, towers: 14, want: { hash: 'fbf31c8fd214b844', phase: 'lost', time: 444.1, wave: 2, made: [0, 31] } },
  { diff: 'difficile', seed: 2, rseed: 11, secs: 900, towers: 14, want: { hash: '259042a259d3a279', phase: 'lost', time: 437.1, wave: 3, made: [0, 32] } },
];
// Esegue fn con i vantaggi dei gradi spenti (danno e punti struttura ×1, nessuna rigenerazione) e poi li ripristina.
function withoutRanks(fn) {
  const saved = RANKS.map(r => ({ ...r }));
  try {
    for (const r of RANKS) Object.assign(r, { dmg: 1, hp: 1, regen: 0 });
    return fn();
  } finally { RANKS.forEach((r, i) => Object.assign(r, saved[i])); }
}

for (const c of CASES) {
  test(`schermaglia identica a parità di casualità (gradi neutralizzati): ${c.diff}, seme ${c.seed}, casualità ${c.rseed}, ${c.towers} torrette`, () => {
    const got = withoutRanks(() => fingerprint(c.diff, c.seed, c.rseed, c.secs, c.towers));
    assert.equal(S.ecfg, undefined, 'la schermaglia non ha la configurazione delle missioni');
    assert.equal(S.mission, null);
    assert.equal(S.weather, 'clear', 'la schermaglia senza opzioni è serena');
    assert.equal(S.hero, null, 'niente Macchina di Villo in schermaglia');
    for (const k in c.want) assert.deepEqual(got[k], c.want[k], `${k}`);
  });
}
for (const c of CASES_RANKS) {
  test(`schermaglia identica a parità di casualità (gradi attivi): ${c.diff}, seme ${c.seed}, casualità ${c.rseed}, ${c.towers} torrette`, () => {
    const got = fingerprint(c.diff, c.seed, c.rseed, c.secs, c.towers);
    assert.equal(S.mission, null);
    for (const k in c.want) assert.deepEqual(got[k], c.want[k], `${k}`);
  });
}

test('withoutRanks ripristina i gradi anche se la partita dà errore', () => {
  const before = RANKS.map(r => ({ ...r }));
  assert.throws(() => withoutRanks(() => { assert.equal(RANKS[3].dmg, 1); throw new Error('prova'); }), /prova/);
  assert.deepEqual(RANKS, before);
});

test('schermaglia ripetibile: due partite con la stessa casualità danno la stessa impronta', () => {
  const a = fingerprint('normale', 3, 42, 300, 6), b = fingerprint('normale', 3, 42, 300, 6);
  assert.deepEqual(a, b);
  const c = fingerprint('normale', 3, 43, 300, 6);
  assert.notEqual(c.hash, a.hash, 'una casualità diversa cambia la partita (l’impronta non è cieca)');
});
