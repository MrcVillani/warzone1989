import { P, ent } from '../engine/index.js';
import { ui } from './state.js';

export function selEnts() { return ui.sel.map(ent).filter(e => e && !e.dead); }
export function selUnits() { return selEnts().filter(e => e.kind === 'unit' && e.owner === P); }
export function selStructs() { return selEnts().filter(e => e.kind === 'struct' && e.owner === P); }
// Chi vuole sapere delle selezioni fatte dal giocatore (il cassetto della disposizione B).
let selHook = null;
export function onSelect(fn) { selHook = fn; }
// Cambia la selezione e porta il pannello sulla scheda utile: fabbrica → Produzione, laboratorio → Ricerca,
// genieri → Costruisci.
export function setSel(ids) {
  ui.sel = ids.slice(); ui.key = '';
  const es = selEnts();
  if (es.length === 1 && es[0].kind === 'struct' && es[0].owner === P) {
    const s = es[0];
    if (s.type === 'factory' || s.type === 'hq') { ui.tab = 'prod'; ui.producer = s.id; }
    else if (s.type === 'lab') ui.tab = 'res';
  } else if (es.some(e => e.kind === 'unit' && e.builder && e.owner === P) && ui.tab !== 'build') ui.tab = 'build';
  if (selHook) selHook(es);
}
