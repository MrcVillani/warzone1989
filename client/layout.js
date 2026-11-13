// Disposizione dell'interfaccia. Il computer usa la plancia classica (barra in alto, pannello a destra). Gli schermi
// touch e quelli bassi usano la disposizione B: mappa a tutto schermo, barra delle schede a destra (in verticale una
// fila in basso) e un cassetto che si apre sopra la mappa. Qui si sceglie quale vale e si spostano i pochi nodi che
// cambiano posto; il resto lo fa lo stile con le classi «lb» (disposizione B) e «lbv» (in verticale) su <html>.
const LB_Q = '(pointer: coarse), (max-height: 520px)';
const V_Q = '(orientation: portrait)';

export const layout = { b: false, v: false };
const mq = q => (typeof matchMedia === 'function' ? matchMedia(q) : null);
const lbq = mq(LB_Q), vq = mq(V_Q);
const subs = [];
export function onLayout(fn) { subs.push(fn); }

// Nodi che nella disposizione B stanno altrove: dove sono nella pagina (casa) e dove vanno.
const MOVES = [
  ['.barbtns', '#drawMenu', null],      // Suono, velocità, pausa, comandi, esci: nel cassetto «Menu»
  ['#btnAlarm', '#tabs', '#btnMenu'],    // «Allarme» nella barra delle schede, prima di «Menu»
  ['#sel', '#drawBody', '#drawMenu'],    // dettaglio della selezione nel cassetto
  ['#tabbody', '#drawBody', '#drawMenu'], // contenuto delle schede nel cassetto
];
let homes = null;

function place(b) {
  const q = s => document.querySelector(s);
  if (!homes) homes = MOVES.map(([sel]) => { const el = q(sel); return el && { el, parent: el.parentNode, next: el.nextSibling }; });
  MOVES.forEach(([, to, before], i) => {
    const h = homes[i]; if (!h) return;
    if (b) { const t = q(to), bf = before && q(before); if (t && h.el.parentNode !== t) t.insertBefore(h.el, bf && bf.parentNode === t ? bf : null); }
    else if (h.el.parentNode !== h.parent) h.parent.insertBefore(h.el, h.next && h.next.parentNode === h.parent ? h.next : null);
  });
}

function apply() {
  const b = !!(lbq && lbq.matches), v = b && !!(vq && vq.matches);
  const changed = b !== layout.b || v !== layout.v || !homes;
  layout.b = b; layout.v = v;
  const root = document.documentElement;
  root.classList.toggle('lb', b); root.classList.toggle('lbv', v);
  place(b);
  if (changed) for (const fn of subs) fn(layout);
}

export function initLayout() {
  apply();
  for (const q of [lbq, vq]) if (q) { if (q.addEventListener) q.addEventListener('change', apply); else if (q.addListener) q.addListener(apply); }
}
