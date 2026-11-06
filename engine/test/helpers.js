// Funzioni di supporto per i test del motore (non contiene test).
import { S, MW, MH, P, deposits, explored, onEvent, step, canPlace, ftile, mulberry32 } from '../index.js';

export const SEEDS = [1, 2, 3, 12345, 999999];

// Avanza la simulazione di `seconds` secondi (si ferma se la partita finisce, salvo `until`).
export function run(seconds, dt = 0.05, until = null) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) {
    if (S.phase !== 'play') return false;
    step(dt);
    if (until && until()) return true;
  }
  return false;
}

// Registra tutti gli eventi emessi dal motore finché non si chiama stop().
export function recordEvents() {
  const list = [];
  const stop = onEvent((type, data) => list.push({ type, data }));
  return { list, stop, of: t => list.filter(e => e.type === t).map(e => e.data) };
}

// Sostituisce Math.random con un generatore con seme, per rendere ripetibile la simulazione.
export function seedRandom(seed) {
  const orig = Math.random;
  Math.random = mulberry32(seed);
  return () => { Math.random = orig; };
}

export const units = (owner, pred = () => true) => S.ents.filter(e => !e.dead && e.kind === 'unit' && e.owner === owner && pred(e));
export const structs = (owner, type) => S.ents.filter(e => !e.dead && e.kind === 'struct' && e.owner === owner && (!type || e.type === type));
export const tileOf = e => [ftile(e.x), ftile(e.y)];

// Giacimento libero ed esplorato più vicino al geniere indicato.
export function nearestExploredDeposit(b) {
  const [bx, by] = tileOf(b);
  return deposits
    .filter(d => explored[d.x + d.y * MW])
    .sort((a, c) => Math.hypot(a.x - bx, a.y - by) - Math.hypot(c.x - bx, c.y - by))[0];
}

// Primo posto valido per un edificio, cercando a spirale attorno a (cx, cy).
export function findSpot(owner, type, cx, cy, margin = 0) {
  for (let r = 0; r < Math.max(MW, MH); r++)
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
      if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r) continue;
      if (canPlace(owner, type, x, y, margin)) return [x, y];
    }
  return null;
}

export const playerBuilder = () => units(P, u => u.builder)[0];
