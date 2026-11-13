// Qualità della grafica, adattiva: misura il tempo per fotogramma e sceglie tra alta, media, bassa e minima.
// Cambia solo il disegno (particelle, luce, acqua, nuvole, risoluzione della tela), mai le regole di gioco.
// «Minima» costa quanto la grafica di prima del piano 08: terreno cotto, mezzi in due copie per fotogramma, nessuna
// passata a tutto schermo in più. Così nessun dispositivo va peggio di prima; quelli capaci vedono di più.

// Parametri per livello (0 minima, 1 bassa, 2 media, 3 alta).
//   maxP: tetto delle particelle · dens: densità di fumo, scie, scintille e detriti · dmg: fumo e fuoco dei mezzi
//   danneggiati · tracks: passo minimo in pixel tra due impronte di cingoli e ruote (0 = niente impronte) ·
//   glow: bagliori e onde d'urto completi · res: tetto della risoluzione della tela (pixel per pixel CSS) ·
//   aq: direzioni della luce cotte nelle sagome dei mezzi (1 = luce fissa sul mezzo) · mush: fungo di fumo ·
//   casings: bossoli · exhaust: sbuffi dello scarico (al secondo, per mezzo) · water: acqua animata (0 ferma,
//   1 un livello di increspature, 2 due) · clouds: ombre delle nuvole e riflesso del cielo · grade: correzione colore ·
//   vignette: vignettatura · trees: alberi vivi (ondeggiano e si piegano all'onda d'urto) · light: tela della luce
//   di notte (fari, finestre, incendi) · shake: scossa dello schermo
export const LEVELS = [
  { name: 'minima', maxP: 120, dens: 0.3, dmg: 0.3, tracks: 0, glow: false, res: 1, aq: 1, mush: false, casings: false, exhaust: 0, water: 0, clouds: false, grade: false, vignette: false, trees: false, light: false, shake: false },
  { name: 'bassa', maxP: 150, dens: 0.35, dmg: 0.35, tracks: 0, glow: false, res: 1, aq: 8, mush: true, casings: false, exhaust: 0, water: 0, clouds: false, grade: false, vignette: true, trees: false, light: true, shake: true },
  { name: 'media', maxP: 350, dens: 0.6, dmg: 0.6, tracks: 9, glow: true, res: 1.5, aq: 16, mush: true, casings: true, exhaust: 0.8, water: 1, clouds: true, grade: false, vignette: true, trees: false, light: true, shake: true },
  { name: 'alta', maxP: 700, dens: 1, dmg: 1, tracks: 5, glow: true, res: 2, aq: 16, mush: true, casings: true, exhaust: 1.6, water: 2, clouds: true, grade: true, vignette: true, trees: true, light: true, shake: true },
];
const TOP = LEVELS.length - 1;
export const PREFS = ['auto', 'alta', 'media', 'bassa', 'minima'];
const KEY = 'wz.effetti';
const load = () => { try { const v = localStorage.getItem(KEY); return PREFS.includes(v) ? v : 'auto'; } catch (e) { return 'auto'; } };
const save = v => { try { localStorage.setItem(KEY, v); } catch (e) { /* archivio non disponibile */ } };
const levelOf = p => { const i = LEVELS.findIndex(l => l.name === p); return i < 0 ? TOP : i; };

const pref0 = load();
// fxq.q: parametri del livello in uso, letti dal disegno a ogni fotogramma; fxq.level: indice in LEVELS.
export const fxq = { pref: pref0, level: levelOf(pref0), q: null };
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
  setLevel(levelOf(p));
  down = up = 0; hold = 0; blockUntil = 0; many = false;
}

// Misura: media mobile esponenziale (circa mezzo secondo) del costo del fotogramma. Se il gioco resta al passo
// con lo schermo conta il tempo di lavoro nel ciclo; se perde fotogrammi conta l'intervallo reale tra due.
// Si scende di un livello dopo DOWN_S secondi sopra HI ms (FAST_S se il fotogramma costa più del doppio), si sale dopo
// UP_S secondi sotto LO ms (UP_MANY_S con molti mezzi in campo: in una battaglia grande si sale con più prudenza).
const HI = 22, LO = 14, DOWN_S = 2, FAST_S = 1, UP_S = 5, UP_MANY_S = 12, MANY = 120, MANY_LEVEL = 1;
let avg = 0, down = 0, up = 0, clockS = 0, lastUp = -1e9, hold = 0, blockUntil = 0, many = false, warmUntil = 0;
// Mappa nuova: i primi WARM_S secondi di gioco non si misurano (si creano sagome, trame e terreno: fotogrammi lenti che
// non dicono quanto costa la grafica).
const WARM_S = 1.5;
export function qualityNewMap() { warmUntil = clockS + WARM_S; avg = 0; down = up = 0; many = false; }
// interval: ms dall'ultimo fotogramma; work: ms spesi nel ciclo; units: mezzi in campo (o null se non contati ora).
// Mezzi in campo (contati prima di disegnare il fotogramma): con molti mezzi si parte direttamente da «bassa», una
// volta per battaglia; poi decide la misura.
export function unitsTick(units) {
  if (fxq.pref !== 'auto' || units == null) return;
  if (!many && units > MANY) { many = true; if (fxq.level > MANY_LEVEL) { setLevel(MANY_LEVEL); down = up = 0; } }
  else if (many && units < MANY - 20) many = false;
}
export function frameTick(interval, work, units) {
  if (fxq.pref !== 'auto') return;
  unitsTick(units);
  if (!(interval > 0) || interval > 250) return; // scheda nascosta, caricamento: non è una misura
  const s = interval / 1000, cost = interval > 20 ? interval : work;
  clockS += s;
  if (clockS < warmUntil) return;
  avg = avg ? avg + (cost - avg) * Math.min(1, s / 0.5) : cost;
  down = avg > HI ? down + s : 0;
  up = avg < LO ? up + s : 0;
  if ((down >= DOWN_S || (down >= FAST_S && avg > 2 * HI)) && fxq.level > 0) {
    // se si riscende poco dopo essere saliti, si aspetta sempre di più prima di riprovare (niente sfarfallio)
    hold = clockS - lastUp < 15 ? Math.min(120, Math.max(15, hold * 2)) : 0;
    blockUntil = clockS + hold;
    setLevel(fxq.level - 1); down = up = 0;
  } else if (up >= (many ? UP_MANY_S : UP_S) && fxq.level < TOP && clockS >= blockUntil) {
    setLevel(fxq.level + 1); lastUp = clockS; down = up = 0;
  }
}
export const qualityState = () => ({ pref: fxq.pref, level: fxq.q.name, avg: +avg.toFixed(1) });
