// Mappe disegnate a mano: elenco per il menu e lettura del disegno in terreno, giacimenti e basi.
// Ogni mappa è un modulo in questa cartella con: id, name, desc (descrizione breve per il menu), rows (MH righe di MW
// lettere, una per casella: le lettere dei terreni sono in TERRAIN[].ch, più '*' = giacimento su erba) e bases
// ([{x, y}, {x, y}]: centro del comando della Brigata Aurora e del Direttorio Ferreo).
import { MW, MH, N, GROUND, TERRAIN, BUILDABLE } from '../data.js';
import latina from './latina.js';

const DRAWN = [latina];
// Elenco per il menu della schermaglia: «Casuale» (la mappa generata dal seme, come sempre) e le mappe disegnate.
export const MAPS = [
  { id: 'casuale', name: 'Casuale', desc: 'Mappa generata dal seme, uguale per i due schieramenti.' },
  ...DRAWN.map(m => ({ id: m.id, name: m.name, desc: m.desc })),
];
export const MAP_BY = Object.fromEntries(DRAWN.map(m => [m.id, m]));
// Mappa disegnata per id (undefined se non c'è; 'casuale' non è una mappa disegnata).
export const mapDef = id => MAP_BY[id];

const CODE = new Map(TERRAIN.map((t, i) => [t.ch, i]));
const cache = new Map();
// Terreno (Uint8Array di N caselle), giacimenti ([{x, y}], in ordine di lettura) e basi della mappa disegnata `id`.
// Il terreno è una copia nuova a ogni chiamata (chi lo riceve può modificarlo).
export function drawnMap(id) {
  const def = MAP_BY[id];
  if (!def) throw new Error(`Mappa sconosciuta: ${id}`);
  if (!cache.has(id)) cache.set(id, parseMap(def));
  const m = cache.get(id);
  return { t: Uint8Array.from(m.t), deps: m.deps.map(d => ({ ...d })), bases: m.bases.map(b => ({ ...b })) };
}
export function parseMap(def) {
  const { rows, bases } = def;
  if (!Array.isArray(rows) || rows.length !== MH) throw new Error(`Mappa ${def.id}: servono ${MH} righe`);
  const t = new Uint8Array(N), deps = [];
  rows.forEach((r, y) => {
    if (r.length !== MW) throw new Error(`Mappa ${def.id}: la riga ${y} ha ${r.length} caselle invece di ${MW}`);
    for (let x = 0; x < MW; x++) {
      const ch = r[x];
      if (ch === '*') { t[x + y * MW] = GROUND; deps.push({ x, y }); continue; }
      const v = CODE.get(ch);
      if (v == null) throw new Error(`Mappa ${def.id}: lettera sconosciuta «${ch}» in (${x}, ${y})`);
      t[x + y * MW] = v;
    }
  });
  if (!Array.isArray(bases) || bases.length !== 2) throw new Error(`Mappa ${def.id}: servono le basi dei due lati`);
  for (const b of bases) for (let y = b.y - 1; y <= b.y + 1; y++) for (let x = b.x - 1; x <= b.x + 1; x++)
    if (!BUILDABLE[t[x + y * MW]]) throw new Error(`Mappa ${def.id}: il comando in (${b.x}, ${b.y}) non sta su terreno libero`);
  return { t, deps, bases: bases.map(b => ({ x: b.x, y: b.y })) };
}
