// Campagna sul dispositivo: lettura e salvataggio in localStorage (chiave wz.campagna). Le regole del passaggio tra
// missioni sono nel motore (engine/campaign.js); qui solo l'archivio e la difficoltà scelta dal giocatore.
import { DIFF, newCampaign, normalizeCampaign } from '../engine/index.js';

const KEY = 'wz.campagna';
let camp = null, diff = 'normale';

// Legge la campagna salvata; un valore mancante, illeggibile o non valido diventa una campagna nuova.
function load() {
  let raw = null;
  try { const s = localStorage.getItem(KEY); raw = s ? JSON.parse(s) : null; } catch (e) { raw = null; }
  camp = normalizeCampaign(raw);
  diff = raw && typeof raw === 'object' && DIFF[raw.diff] ? raw.diff : 'normale';
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify({ ...camp, diff })); } catch (e) { /* archivio non disponibile */ }
}
export function getCampaign() { if (!camp) load(); return camp; }
export function setCampaign(c) { camp = normalizeCampaign(c); save(); return camp; }
export function resetCampaign() { camp = newCampaign(); save(); return camp; }
export function campaignDiff() { if (!camp) load(); return diff; }
export function setCampaignDiff(d) { if (!DIFF[d]) return; if (!camp) load(); diff = d; save(); }
