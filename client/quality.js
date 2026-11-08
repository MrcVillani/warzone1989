// Qualità degli effetti visivi, adattiva: misura il tempo per fotogramma e sceglie tra alta, media e bassa.
// Cambia solo il disegno (particelle, fumo, tracce, bagliori, risoluzione della tela), mai le regole di gioco.

// Parametri per livello (0 bassa, 1 media, 2 alta).
//   maxP: tetto delle particelle · dens: densità di fumo, scie, scintille e detriti · dmg: fumo e fuoco dei mezzi
//   danneggiati · tracks: passo minimo in pixel tra due impronte di cingoli e ruote (0 = niente tracce) ·
//   glow: bagliori e onde d'urto completi · res: tetto della risoluzione della tela (pixel per pixel CSS)
export const LEVELS = [
  { name: 'bassa', maxP: 150, dens: 0.35, dmg: 0.35, tracks: 0, glow: false, res: 1 },
  { name: 'media', maxP: 350, dens: 0.6, dmg: 0.6, tracks: 9, glow: true, res: 1.5 },
  { name: 'alta', maxP: 700, dens: 1, dmg: 1, tracks: 5, glow: true, res: 2 },
];
export const PREFS = ['auto', 'alta', 'bassa'];
const KEY = 'wz.effetti';
const load = () => { try { const v = localStorage.getItem(KEY); return PREFS.includes(v) ? v : 'auto'; } catch (e) { return 'auto'; } };
const save = v => { try { localStorage.setItem(KEY, v); } catch (e) { /* archivio non disponibile */ } };

const pref0 = load();
// fx.q: parametri del livello in uso, letti dal disegno a ogni fotogramma.
export const fxq = { pref: pref0, level: pref0 === 'bassa' ? 0 : 2, q: null };
fxq.q = LEVELS[fxq.level];
const listeners = [];
export const onQualityChange = f => listeners.push(f);
function setLevel(l) {
  if (l === fxq.level) return;
  fxq.level = l; fxq.q = LEVELS[l];
  for (const f of listeners) f(l);
}
export function setPref(p) {
  if (!PREFS.includes(p)) return;
  fxq.pref = p; save(p);
  setLevel(p === 'bassa' ? 0 : 2);
  down = up = 0; hold = 0; blockUntil = 0;
}

// Misura: media mobile esponenziale (circa mezzo secondo) del costo del fotogramma. Se il gioco resta al passo
// con lo schermo conta il tempo di lavoro nel ciclo; se perde fotogrammi conta l'intervallo reale tra due.
const HI = 22, LO = 14, DOWN_S = 2, UP_S = 5, MANY = 120;
let avg = 0, down = 0, up = 0, clockS = 0, lastUp = -1e9, hold = 0, blockUntil = 0, many = false;
// interval: ms dall'ultimo fotogramma; work: ms spesi nel ciclo; units: mezzi in campo (o null se non contati ora).
export function frameTick(interval, work, units) {
  if (fxq.pref !== 'auto') return;
  if (units != null) {
    // molti mezzi in campo: si parte direttamente dalla media (una volta per battaglia, poi decide la misura)
    if (!many && units > MANY) { many = true; if (fxq.level > 1) { setLevel(1); down = up = 0; } }
    else if (many && units < MANY - 20) many = false;
  }
  if (!(interval > 0) || interval > 250) return; // scheda nascosta, caricamento: non è una misura
  const s = interval / 1000, cost = interval > 20 ? interval : work;
  avg = avg ? avg + (cost - avg) * Math.min(1, s / 0.5) : cost;
  clockS += s;
  down = avg > HI ? down + s : 0;
  up = avg < LO ? up + s : 0;
  if (down >= DOWN_S && fxq.level > 0) {
    // se si riscende poco dopo essere saliti, si aspetta sempre di più prima di riprovare (niente sfarfallio)
    hold = clockS - lastUp < 15 ? Math.min(120, Math.max(15, hold * 2)) : 0;
    blockUntil = clockS + hold;
    setLevel(fxq.level - 1); down = up = 0;
  } else if (up >= UP_S && fxq.level < 2 && clockS >= blockUntil) {
    setLevel(fxq.level + 1); lastUp = clockS; down = up = 0;
  }
}
export const qualityState = () => ({ pref: fxq.pref, level: fxq.q.name, avg: +avg.toFixed(1) });
