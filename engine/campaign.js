// Campagna «Operazione Valle Grigia»: funzioni pure sullo stato della campagna (nessun accesso al dispositivo: il
// salvataggio su localStorage è del client). Stato: {v, unlocked, done, tech, designs, best, veterans, hero}
//   v: versione del formato (1); unlocked: missioni sbloccate (1–8, le prime `unlocked`); done: id delle missioni
//   vinte almeno una volta; tech: ricerche del giocatore portate avanti ({id: true}); designs: progetti salvati;
//   best: miglior tempo di vittoria per missione ({id: secondi});
//   veterans: mezzi dell'ultima vittoria che seguono il giocatore nella prossima missione ([{d, rank, xp}], al più
//   VETERANS_MAX, sostituiti a ogni vittoria); hero: grado ed esperienza della Macchina di Villo ({rank, xp}).
//   Gli stati salvati prima di questi due campi valgono veterans [] e hero {rank: 0, xp: 0}.
import { MISSIONS, TECH_BY, TIERS, DEFAULT_DESIGNS, RANKS, VETERANS_MAX, VETERANS_RANK, missionOf, P } from './data.js';
import { newGame, validDesign, rankFor } from './world.js';

export const CAMPAIGN_VERSION = 1;
export function newCampaign() {
  return { v: CAMPAIGN_VERSION, unlocked: 1, done: [], tech: {}, designs: DEFAULT_DESIGNS.map(d => ({ ...d })), best: {}, veterans: [], hero: { rank: 0, xp: 0 } };
}
// Grado (0–3, almeno quello che spetta all'esperienza) ed esperienza (almeno quella del grado) resi coerenti.
function rankXp(rank, xp) {
  const x = Math.max(0, Number(xp) || 0), r = Math.max(rankFor(x), Math.max(0, Math.min(RANKS.length - 1, Math.floor(Number(rank) || 0))));
  return { rank: r, xp: Math.max(x, RANKS[r].kills) };
}
// Elenco di veterani reso valido: progetto conosciuto, grado da VETERANS_RANK in su, prima gli assi e poi per
// esperienza, al più VETERANS_MAX.
function cleanVeterans(list) {
  const out = [];
  for (const v of Array.isArray(list) ? list : []) {
    if (!v || typeof v !== 'object' || !validDesign(v.d)) continue;
    const k = rankXp(v.rank, v.xp);
    if (k.rank >= VETERANS_RANK) out.push({ d: { c: v.d.c, p: v.d.p, w: v.d.w }, rank: k.rank, xp: k.xp });
  }
  return out.sort((a, b) => b.rank - a.rank || b.xp - a.xp).slice(0, VETERANS_MAX);
}
// Mezzi della partita S che seguirebbero il giocatore nella missione dopo: quelli vivi del giocatore dal grado
// VETERANS_RANK in su (non i genieri, non la Macchina di Villo), prima gli assi e poi per esperienza, al più
// VETERANS_MAX. Ogni voce è {d: progetto, rank, xp}.
export function missionVeterans(S) {
  if (!S || !Array.isArray(S.ents)) return [];
  return cleanVeterans(S.ents.filter(e => e && !e.dead && e.kind === 'unit' && e.owner === P && !e.builder && !e.hero && e.d));
}
// Rende valido uno stato letto dal dispositivo (campi mancanti, ricerche o progetti sconosciuti, valori fuori scala);
// un valore non riconoscibile diventa una campagna nuova.
export function normalizeCampaign(c) {
  if (!c || typeof c !== 'object') return newCampaign();
  const out = newCampaign();
  const n = Number(c.unlocked);
  out.unlocked = Number.isFinite(n) ? Math.max(1, Math.min(MISSIONS.length, Math.floor(n))) : 1;
  if (Array.isArray(c.done)) out.done = MISSIONS.map(m => m.id).filter(id => c.done.includes(id));
  if (c.tech && typeof c.tech === 'object') for (const id in c.tech) if (c.tech[id] && TECH_BY[id]) out.tech[id] = true;
  if (Array.isArray(c.designs)) { const d = uniqDesigns(c.designs); if (d.length) out.designs = d; }
  if (c.best && typeof c.best === 'object') for (const m of MISSIONS) { const t = Number(c.best[m.id]); if (Number.isFinite(t) && t > 0) out.best[m.id] = t; }
  out.veterans = cleanVeterans(c.veterans);
  if (c.hero && typeof c.hero === 'object') out.hero = rankXp(c.hero.rank, c.hero.xp);
  // le missioni vinte sbloccano sempre la successiva
  for (const id of out.done) out.unlocked = Math.max(out.unlocked, Math.min(MISSIONS.length, MISSIONS.findIndex(m => m.id === id) + 2));
  return out;
}
function uniqDesigns(list) {
  const seen = new Set(), out = [];
  for (const d of list) { if (!validDesign(d)) continue; const k = `${d.c}/${d.p}/${d.w}`; if (seen.has(k)) continue; seen.add(k); out.push({ c: d.c, p: d.p, w: d.w }); }
  return out;
}
const indexOf = m => typeof m === 'number' ? m : MISSIONS.findIndex(x => x.id === m);
// Opzioni di newGame per la missione `index` (0–7 o id) con le ricerche, i progetti, i veterani e la Macchina di
// Villo della campagna.
export function missionOpts(camp, index) {
  const i = indexOf(index), M = MISSIONS[i];
  if (!M) throw new Error(`Missione sconosciuta: ${index}`);
  return {
    mission: i, tech: { ...camp.tech }, designs: camp.designs.map(d => ({ ...d })),
    veterans: cleanVeterans(camp.veterans), hero: rankXp(camp.hero && camp.hero.rank, camp.hero && camp.hero.xp),
  };
}
// La missione si può giocare: è tra quelle sbloccate.
export function canPlayMission(camp, index) { const i = indexOf(index); return i >= 0 && i < MISSIONS.length && i < camp.unlocked; }
// Avvia la missione (newGame con seme della missione, ricerche e progetti della campagna); extra: altre opzioni di
// newGame (per esempio {autoplay: true} nelle simulazioni). Restituisce S. Una missione non sbloccata è un errore.
export function startMission(camp, index, diff = 'normale', extra) {
  if (!canPlayMission(camp, index)) throw new Error(`Missione non ancora sbloccata: ${index}`);
  const i = indexOf(index);
  return newGame(diff, MISSIONS[i].seed, Object.assign(missionOpts(camp, i), extra || {}));
}
// Nuovo stato della campagna dopo la partita S della missione `index`. Solo una vittoria cambia qualcosa: ricerche
// completate e progetti salvati del giocatore si sommano a quelli della campagna, la missione è vinta, la successiva
// è sbloccata e il tempo è il migliore se più basso. I veterani diventano quelli di questa partita (missionVeterans:
// fino a tre mezzi vivi di grado Veterano o Asso; nessuno se non ce ne sono) e la Macchina di Villo tiene il grado e
// l'esperienza che ha in S.hero (mai meno di quelli già in campagna). Conta solo una partita di questa missione: una
// schermaglia (S.mission null) o una partita di un'altra missione non cambia nulla. Non modifica `camp`.
export function finishMission(camp, index, S) {
  const c = normalizeCampaign(camp), i = indexOf(index), M = MISSIONS[i];
  if (!M || !S || S.phase !== 'won' || S.mission !== M.id) return c;
  for (const id in S.tech[P]) if (S.tech[P][id] && TECH_BY[id]) c.tech[id] = true;
  c.designs = uniqDesigns(c.designs.concat(S.designs || []));
  if (!c.done.includes(M.id)) c.done = MISSIONS.map(m => m.id).filter(id => id === M.id || c.done.includes(id));
  c.unlocked = Math.max(c.unlocked, Math.min(MISSIONS.length, i + 2));
  const t = Math.round(S.time);
  if (!(c.best[M.id] <= t)) c.best[M.id] = t;
  c.veterans = missionVeterans(S);
  if (S.hero && typeof S.hero === 'object') { const h = rankXp(S.hero.rank, S.hero.xp); if (h.xp >= c.hero.xp) c.hero = h; }
  return c;
}
// Nome del piano (fase C): lo stesso di finishMission.
export const nextCampaignState = finishMission;
// Riassunto per il menu: missioni con stato, prossima da giocare, ricerche portate, campagna finita.
const OBJ_LABEL = {
  outpost: 'Avvia le pompe e distruggi l’avamposto', hold: 'Tieni le pompe', survive: 'Resisti',
  destroy: 'Distruggi la base nemica', survive_then_destroy: 'Resisti, poi distruggi la base', destroy_all_bases: 'Distruggi tutte le basi',
};
export function objectiveLabel(spec) {
  const t = spec.time ? ` (${Math.floor(spec.time / 60)}:${String(spec.time % 60).padStart(2, '0')})` : '';
  if (spec.type === 'outpost') return `Avvia ${spec.pumps} pompe e distruggi l’avamposto`;
  if (spec.type === 'hold') return `Tieni ${spec.pumps} pompe per ${Math.round(spec.time / 60)} minuti`;
  if (spec.type === 'survive') return `Resisti ${Math.round(spec.time / 60)} minuti`;
  if (spec.type === 'survive_then_destroy') return `Resisti ${Math.round(spec.time / 60)} minuti, poi distruggi la base`;
  return (OBJ_LABEL[spec.type] || spec.type) + (spec.type === 'destroy' || spec.type === 'destroy_all_bases' ? '' : t);
}
export function campaignSummary(camp) {
  const c = normalizeCampaign(camp);
  const missions = MISSIONS.map((m, i) => ({
    index: i, id: m.id, name: m.name, brief: m.brief, objective: m.objective.type, objectiveText: objectiveLabel(m.objective),
    maxTier: m.maxTier, tiers: `${TIERS[0]}–${TIERS[m.maxTier - 1]}`.replace(/^I–I$/, 'I'),
    unlocked: i < c.unlocked, done: c.done.includes(m.id), best: c.best[m.id] ?? null,
  }));
  const next = missions.find(m => m.unlocked && !m.done);
  return {
    missions, unlocked: c.unlocked, completed: c.done.length, total: MISSIONS.length,
    next: next ? next.index : null, finished: c.done.length === MISSIONS.length,
    techCount: Object.keys(c.tech).length, designCount: c.designs.length,
  };
}
