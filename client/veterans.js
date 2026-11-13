// Veterani, lato client: nomi dei gradi, soprannomi degli assi del giocatore, lampo e suono della promozione
// (evento rank del motore), pulsante e conto alla rovescia della Macchina di Villo (evento hero).
// Il soprannome è solo del client: una mappa per id del mezzo, da capo a ogni partita; se un asso non ce l'ha (per
// esempio dopo un caricamento) lo riceve al primo sguardo. Ogni soprannome esce una volta sola per partita, finché ce
// ne sono. Nessuna regola di gioco.
import * as ENG from '../engine/index.js';
import { P, S, ent, designName, gridRef, ftile } from '../engine/index.js';
import { fxs } from './state.js';
import { addP, nearView, seenAt, dens } from './effects.js';
import { uiSfx, sfx } from './audio.js';

const RANK_NAMES = ['Recluta', 'Esperto', 'Veterano', 'Asso'];
const ranks = () => ENG['RANKS'.slice()] || null;
export const rankName = r => { const R = ranks(), i = Math.max(0, Math.min(3, r | 0)); return (R && R[i] && R[i].name) || RANK_NAMES[i]; };
export const isAce = u => !!u && u.kind === 'unit' && (u.rank || 0) >= 3;

/* ---------- soprannomi ---------- */
// Di fantasia, in romanesco bonario: niente persone, marchi o parolacce.
export const NICKS = [
  'er Bufera', 'la Pantera', 'er Tritacarri', 'er Saetta', 'er Cinghiale', 'er Mastino', 'er Martello', 'la Furia',
  'er Tuono', 'er Gladiatore', 'la Lupa', 'er Fulmine', 'er Ruspa', 'la Tempesta', 'la Vipera', 'er Fenomeno',
  'er Tigna', 'er Pirata', 'la Bestia', 'er Cannone', 'er Ciclone', 'er Capoccia', 'la Regina', 'er Drago',
  'er Rombo', 'er Pischello', 'la Sora Fiamma', 'er Mejo', 'er Sorcio de Fero', 'la Zanzara', 'er Terremoto', 'la Valanga',
];
let nicks = new Map(), free = [];
export function resetVeterans() { nicks = new Map(); free = NICKS.slice(); }
resetVeterans();
// Soprannome dell'asso del giocatore u (lo assegna se manca); null per tutti gli altri mezzi. La Macchina di Villo ha
// già il suo nome.
export function nickOf(u) {
  if (!isAce(u) || u.owner !== P || u.hero || u.builder) return null;
  let n = nicks.get(u.id);
  if (!n) {
    if (!free.length) free = NICKS.slice();
    n = free.splice(Math.floor(Math.random() * free.length), 1)[0];
    nicks.set(u.id, n);
  }
  return n;
}
// Per l'anteprima che sopravvive agli aggiornamenti della pagina e per i test.
export const nicksDump = () => Object.fromEntries(nicks);
export function nicksLoad(o) {
  if (!o || typeof o !== 'object') return;
  for (const [id, n] of Object.entries(o)) if (NICKS.includes(n)) { nicks.set(+id, n); const i = free.indexOf(n); if (i >= 0) free.splice(i, 1); }
}
export const veteransState = () => ({ nicks: nicksDump(), free: free.length, total: NICKS.length });

/* ---------- promozione ---------- */
// Evento rank {id, owner, rank, x, y}: piccolo lampo dorato con qualche scintilla dove il giocatore lo vede, suono
// per i mezzi del giocatore; per i suoi assi un avviso con il soprannome (say(testo, x, y) lo mostra).
export function rankUp(d, say) {
  const mine = d.owner === P, u = ent(d.id);
  if ((mine || seenAt(d.x, d.y)) && nearView(d.x, d.y, 60)) {
    const big = d.rank >= 3;
    fxs.fx.push({ k: 'flashW', x: d.x, y: d.y, life: 0.3, max: 0.3, s: big ? 13 : 8 });
    fxs.fx.push({ k: 'ring', x: d.x, y: d.y, life: 0.45, max: 0.45, s: big ? 26 : 17 });
    fxs.fx.push({ k: 'light', x: d.x, y: d.y, life: 0.3, max: 0.3, s: big ? 22 : 14 });
    for (let i = 0, n = Math.round((big ? 14 : 7) * dens()); i < n; i++) { const a = Math.random() * 7, v = 40 + Math.random() * 70; addP('spark', d.x, d.y, Math.cos(a) * v, Math.sin(a) * v - 20, 0.4 + Math.random() * 0.3, 1.4); }
  }
  if (!mine) return;
  if (d.rank >= 3) uiSfx('rankAce'); else sfx('rank', d.x, d.y, P);
  if (d.rank < 3 || !u) return;
  const where = gridRef(ftile(d.x), ftile(d.y));
  if (u.hero) say(`La Macchina di Villo è un Asso! Settore ${where}.`, d.x, d.y);
  else say(`Nuovo asso: «${nickOf(u)}» (${designName(u.d)}), settore ${where}.`, d.x, d.y);
}
