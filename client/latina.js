// Latina con un sorriso: solo nella schermaglia sulla mappa di Latina (S.map === 'latina', fuori dalla campagna).
// Testi del rapporto finale (uno di tre, scelto una volta per partita) e battute brevi in partita, nate da eventi che
// esistono già (strade, ponti, mezzi distrutti in città, pompe, fabbriche nemiche): nessuna regola di gioco.
// Ogni battuta compare al massimo una volta per partita, al massimo una ogni QUIP_GAP secondi di gioco e solo se tra
// gli avvisi in vista non ce n'è uno importante; se non può uscire subito aspetta il suo turno.
import { MW, MH, P, WATER, CITY, ROAD, S, terr, ftile } from '../engine/index.js';

export const isLatina = () => !!S && S.map === 'latina' && !S.mission;
// Riga in più sotto la descrizione della mappa nel menu.
export const LATINA_NOTE = 'Attenzione: buche segnalate su tutta la rete stradale.';

/* ---------- rapporto finale ---------- */
const END = {
  won: {
    title: 'Latina <span>liberata</span>',
    texts: [
      'Il Direttorio Ferreo ripiega verso Latina Scalo. Le sue colonne si sono arrese alle buche di via del Lido prima ancora che ai tuoi cannoni.',
      'I carri nemici sono fermi sulla circonvallazione: due nelle buche, uno ancora a cercare parcheggio in centro. Il gasolio della bonifica è tuo.',
      'Piazza del Popolo è tua, il comando nemico è caduto e la Pontina è libera. Per una volta, senza code.',
    ],
  },
  lost: {
    title: 'Brigata <span>impantanata</span>',
    texts: [
      'Hai perso il comando, le fabbriche e tutti i genieri. Ufficialmente è colpa del Direttorio Ferreo; ufficiosamente, delle buche.',
      'Il Direttorio Ferreo controlla Latina. I tuoi carri sono rimasti sulla Pontina, a metà tra una buca e un cantiere.',
      'Il nemico ha trovato parcheggio in piazza del Popolo prima di te: una disfatta su tutta la linea.',
    ],
  },
};
// Titolo (con il suo <span>) e testo del rapporto: la scelta tra i tre testi si fa una volta per partita.
export function latinaEnd(won) {
  if (st.pick == null) st.pick = Math.floor(Math.random() * 3);
  const e = won ? END.won : END.lost;
  return { title: e.title, text: e.texts[st.pick] };
}

/* ---------- battute in partita ---------- */
const QUIPS = {
  road: 'Asfalto! Occhio alle buche.',
  bridge: 'Il ponte regge. Più o meno.',
  cityKill: 'Un altro posto auto liberato in centro.',
  pump: 'Gasolio della bonifica: costa meno che al distributore.',
  factory: 'Il Direttorio chiede un rimborso per le sospensioni.',
};
const QUIP_GAP = 90;
// stato della partita: battute già uscite, in attesa, ultima uscita; mezzi visti fuori strada; scelta del rapporto
let st = null;
export function resetLatina() { st = { done: new Set(), pending: [], last: -1e9, offRoad: new Set(), pick: null }; }
resetLatina();
function want(k) { if (!st.done.has(k) && !st.pending.includes(k)) st.pending.push(k); }

// Terreno della casella (fuori mappa vale acqua: mai strada né città).
const T = (tx, ty) => (terr && tx >= 0 && ty >= 0 && tx < MW && ty < MH ? terr[tx + ty * MW] : WATER);
// Ponte: casella di strada che, lungo una delle due direzioni, ha l'acqua da entrambe le parti attraversando solo
// strada (le strade larghe due o tre caselle fanno ponti larghi due o tre caselle).
const waterAlong = (tx, ty, dx, dy) => { for (let k = 1; k <= 3; k++) { const t = T(tx + dx * k, ty + dy * k); if (t === WATER) return true; if (t !== ROAD) return false; } return false; };
const onBridge = (tx, ty) => T(tx, ty) === ROAD && ((waterAlong(tx, ty, 1, 0) && waterAlong(tx, ty, -1, 0)) || (waterAlong(tx, ty, 0, 1) && waterAlong(tx, ty, 0, -1)));
const nearCity = (tx, ty) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (T(tx + dx, ty + dy) === CITY) return true; return false; };

// Effetti del motore: un mezzo distrutto vicino alle case, una fabbrica nemica distrutta.
export function latinaFx(e) {
  if (!isLatina() || e.k !== 'boom') return;
  if (e.kind === 'unit' && !st.done.has('cityKill') && nearCity(ftile(e.x), ftile(e.y))) want('cityKill');
  else if (e.kind === 'struct' && e.owner !== P && !st.done.has('factory')) {
    for (const s of S.ents) if (s.dead && s.kind === 'struct' && s.type === 'factory' && s.owner !== P && s.x === e.x && s.y === e.y) { want('factory'); break; }
  }
}
// Edificio finito: la prima pompa del giocatore.
export function latinaBuilt(d) { if (isLatina() && d.owner === P && d.type === 'pump') want('pump'); }
// Controllo periodico (qualche volta al secondo): mezzi su ruote che entrano in strada, mezzi sul ponte; poi, se è il
// momento e non ci sono avvisi importanti, esce la prima battuta in attesa. say(testo) la mostra.
export function latinaTick(say) {
  if (!isLatina() || S.phase !== 'play') return;
  const needRoad = !st.done.has('road') && !st.pending.includes('road'), needBridge = !st.done.has('bridge') && !st.pending.includes('bridge');
  if (needRoad || needBridge) for (const u of S.ents) {
    if (u.dead || u.kind !== 'unit' || u.owner !== P) continue;
    const tx = ftile(u.x), ty = ftile(u.y), t = T(tx, ty);
    if (needRoad && !u.builder && u.d && u.d.p === 'W') {
      if (t !== ROAD) st.offRoad.add(u.id);
      else if (st.offRoad.has(u.id)) want('road');
    }
    if (needBridge && onBridge(tx, ty)) want('bridge');
  }
  if (!st.pending.length || S.time - st.last < QUIP_GAP) return;
  const box = document.getElementById('toasts');
  if (box && box.querySelector('.toast.bad, .toast.warn')) return;
  const k = st.pending.shift(); st.done.add(k); st.last = S.time;
  say(QUIPS[k]);
}
// Per i test: battute già uscite e in attesa.
export const latinaState = () => ({ done: [...st.done], pending: st.pending.slice(), pick: st.pick });
