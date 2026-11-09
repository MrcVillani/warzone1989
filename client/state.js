// Stato del solo client: interfaccia, camera, selezione, effetti visivi. Niente regole di gioco qui.
export const FACTION = ['Brigata Aurora', 'Direttorio Ferreo'];
export const PAL = [
  { body: '#c98a2e', dark: '#5e3f12', light: '#efc47c', dot: '#f0b04a' },
  { body: '#a8463b', dark: '#4f1c17', light: '#dd8b7f', dot: '#e0564a' },
];
export const ui = {
  tab: 'build', placing: null, amove: false, producer: 0,
  draft: { c: 'L', p: 'W', w: 'MG' }, key: '', paused: true, speed: 1, overlay: 'start',
  diff: 'normale', groups: {}, sel: [], lastGroup: null, lastGroupT: 0,
  // resFold: livelli della scheda Ricerca aperti o chiusi dal giocatore (livello → true/false; se manca, default)
  resFold: {},
  // techBefore: ricerche della campagna all'avvio della missione in corso (per il rapporto: quelle nuove)
  techBefore: [],
  // Disposizione B (telefono): drawer = cassetto aperto (build, prod, res, des, sel, menu) o null; ghost = punto del
  // mondo dove sta l'edificio da piazzare (centro dell'edificio); miniBig = minimappa ingrandita.
  drawer: null, ghost: null, miniBig: false,
};
export const cam = { x: 0, y: 0, z: 1 };
export const view = { dpr: 1, cw: 800, ch: 600 };
export const hover = { x: 0, y: 0, in: false };
// parts: particelle; fx: effetti brevi; wrecks: relitti che bruciano; settle: edifici appena piazzati (id → {t0, dust});
// spawns: mezzi appena consegnati (id → t0); shake: ampiezza della scossa dello schermo in pixel.
export const fxs = { parts: [], fx: [], pings: [], boxSel: null, wrecks: [], settle: new Map(), spawns: new Map(), shake: 0 };
// «Riduci movimento» del sistema: niente scossa, meno particelle, niente pulsazioni.
const rmq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
export const reducedMotion = () => !!(rmq && rmq.matches);
