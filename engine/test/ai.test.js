// IA bloccata da un edificio che i genieri non raggiungono (controllo instabile di `npm run e2e`).
//
// Sul seme 81 il giacimento nemico (46,42) ha sotto di sé la casella (46,43): percorribile, ma chiusa da rocce
// su tre lati e dal giacimento sul quarto, quindi irraggiungibile. I genieri dell'IA arrivano da sud: `adjTile`
// (sim.js) sceglie per loro la casella adiacente più vicina, cioè proprio (46,43); il percorso si ferma a (45,44),
// dopo 6 tentativi il geniere torna fermo e `aiTick` (ai.js) lo rimanda sulla stessa pompa incompiuta, all'infinito.
// Finché esiste un edificio incompiuto l'IA non pianifica altro: niente fabbrica, niente mezzi, nessuna ondata.
// Succede su circa il 2% dei semi (81, 200, 215, 231, 269, 278, 286 tra 1 e 300), indipendentemente da Math.random
// per il seme 81.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MW, E, S, newGame, placeStruct, cmdBuild, passable, ftile, terr } from '../index.js';
import { units, structs, run, seedRandom } from './helpers.js';

const SEED = 81, DEP = { x: 46, y: 42 }, POCKET = { x: 46, y: 43 }, SOUTH = { x: 45, y: 44 };

// Caselle raggiungibili da (sx, sy) con le stesse regole di findPath: 8 direzioni, senza tagliare gli angoli.
function reachable(sx, sy) {
  const seen = new Uint8Array(terr.length), q = [[sx, sy]];
  seen[sx + sy * MW] = 1;
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!passable(nx, ny, false)) continue;
      if (dx && dy && (!passable(x + dx, y, false) || !passable(x, y + dy, false))) continue;
      if (!seen[nx + ny * MW]) { seen[nx + ny * MW] = 1; q.push([nx, ny]); }
    }
  }
  return seen;
}

// Lascia in campo solo un geniere nemico, nella casella indicata, e spegne l'IA.
function loneBuilder(tx, ty) {
  const b = units(E, u => u.builder)[0];
  for (const e of S.ents) if (e.kind === 'unit' && e !== b) e.dead = true;
  S.timers.ai = 1e9;
  b.x = b.gx = (tx + 0.5) * 32; b.y = b.gy = (ty + 0.5) * 32;
  return b;
}

test('seme 81: accanto al giacimento (46,42) c’è una casella percorribile ma irraggiungibile', () => {
  newGame('normale', SEED);
  const s = placeStruct(E, 'pump', DEP.x, DEP.y);
  assert.ok(s, 'pompa non piazzabile sul giacimento');
  assert.ok(passable(POCKET.x, POCKET.y, false), 'la casella (46,43) non è percorribile');
  const R = reachable(SOUTH.x, SOUTH.y);
  assert.equal(R[POCKET.x + POCKET.y * MW], 0, '(46,43) raggiungibile da sud: la mappa è cambiata, il test va rivisto');
  assert.equal(R[DEP.x - 1 + DEP.y * MW], 1, 'la casella (45,42), a ovest del giacimento, deve essere raggiungibile');
  // Da nord il geniere ci arriva e la costruisce: la pompa in sé si può fare.
  const b = loneBuilder(46, 39);
  cmdBuild([b], s);
  run(40);
  assert.equal(s.built, 1, 'da nord la pompa non viene costruita');
});

test('un geniere che arriva dal lato della casella isolata costruisce comunque la pompa', {
  todo: 'bug del motore: sim.js adjTile/buildTick sceglie una casella adiacente irraggiungibile (assegnare a backend)',
}, () => {
  const restore = seedRandom(1);
  try {
    newGame('normale', SEED);
    const s = placeStruct(E, 'pump', DEP.x, DEP.y);
    const b = loneBuilder(SOUTH.x, SOUTH.y);
    cmdBuild([b], s);
    run(40);
    assert.equal(s.built, 1, `pompa non costruita: geniere fermo a ${ftile(b.x)},${ftile(b.y)} con ordine «${b.order.t}»`);
  } finally { restore(); }
});

test('con il giocatore fermo l’IA costruisce una fabbrica entro 150 s anche sul seme 81', {
  todo: 'bug del motore: ai.js aiTick rimanda i genieri all’infinito su un edificio incompiuto irraggiungibile (assegnare a backend)',
}, () => {
  // Sui semi 1–60 la prima fabbrica dell'IA è piazzata al più tardi a 93 s.
  const restore = seedRandom(1);
  try {
    newGame('normale', SEED);
    run(150);
    const stuck = structs(E).filter(s => s.built < 1).map(s => `${s.type} (${s.tx},${s.ty}) al ${Math.round(s.built * 100)}%`);
    assert.ok(structs(E, 'factory').length >= 1,
      `nessuna fabbrica a ${Math.round(S.time)} s con ${Math.round(S.res[E])} di gasolio; incompiuti: ${stuck.join(', ') || 'nessuno'}`);
  } finally { restore(); }
});
