// Avvio del client: collega gli eventi del motore al disegno e all'interfaccia, poi fa girare il ciclo.
import { P, S, ent, onEvent, step, loadState, serialize } from '../engine/index.js';
import { ui, fxs } from './state.js';
import { initRender, resize, renderTerrain, updateFogImage, spawnFx, updParts, updHero, render, renderMini, resetFx, unitSpawned, structPlaced, structBuilt, renderState } from './render.js';
import { heroFx, heroState, heroUnit } from './hero.js';
import { rankUp, resetVeterans, veteransState, nicksDump, nicksLoad } from './veterans.js';
import { initAudio, fxSound, uiSfx, audioState, onAudioReady, heard, weatherAudio } from './audio.js';
import { wx } from './weather.js';
import { attachMusic, musicMode, musicMission, musicHit, musicDuck, musicState } from './music.js';
import { fxq, frameTick, unitsTick, onQualityChange, qualityState, setPref, qualityNewMap } from './quality.js';
const fxPref = () => fxq.pref;
import { initInput, camScroll } from './input.js';
import { initUI, renderPanel, updateBar, updateSelCount, toast, toastGo, startGame, randomSeed } from './ui.js';
import { alertFx, alertPing, alertBuilt, alertToast, updateArrows, resetAlerts } from './alerts.js';
import { initLayout } from './layout.js';
import { setMapPref, setWeatherPref } from './prefs.js';
import { resetLatina, latinaFx, latinaBuilt, latinaTick, latinaState } from './latina.js';
import { initDrawer, updatePlacebar } from './drawer.js';
import { initScreens, showStart, showEnd, showCampaign, showBrief, refreshObjective, resetObjectiveHud, limitText, missionIndex } from './screens.js';

const cv = document.getElementById('view'), mini = document.getElementById('mini');
initRender(cv, mini);

initAudio();
onAudioReady((ac, master) => attachMusic(ac, master));
// cambio del livello di qualità: la tela della mappa prende la risoluzione del nuovo livello all'inizio del fotogramma
// dopo, prima di disegnare (cambiare la misura della tela la svuota: fatto dopo il disegno, si vedrebbe un fotogramma
// vuoto)
let resizeDue = false;
onQualityChange(() => { resizeDue = true; });

onEvent((type, d) => {
  if (type === 'world') { resetFx(); resetAlerts(); resetLatina(); resetVeterans(); qualityNewMap(); renderTerrain(S.seed); }
  else if (type === 'fog') updateFogImage();
  // i colpi della Macchina di Villo (hero: true) hanno i loro effetti (hero.js) al posto di quelli di serie
  else if (type === 'fx') { if (!heroFx(d)) spawnFx(d); fxSound(d); musicFx(d); alertFx(d); latinaFx(d); }
  else if (type === 'toast') {
    // avvisi con una posizione (contatto, edificio pronto o perso, reparti in arrivo): toccandoli si va lì
    alertToast(toast(d.text, d.kind), d);
    if (d.kind === 'bad') musicHit(/^Contatto nemico/.test(d.text) ? 0.3 : 0.1);
    // allarme radio sul contatto nemico; i toast di «pronto» e «ricerca» fanno da riserva agli eventi dedicati
    // (i suoni hanno un intervallo minimo, quindi non si sentono due volte)
    if (d.kind === 'bad' && /^Contatto nemico/.test(d.text)) uiSfx('alarm');
    else if (/^Ricerca completata/.test(d.text)) uiSfx('research');
    else if (/ (pronto|pronta) nel settore/.test(d.text)) uiSfx('built');
  }
  else if (type === 'ping') { fxs.pings.push({ x: d.x, y: d.y, t: S.time }); alertPing(d); }
  else if (type === 'unit') { unitSpawned(d); if (d.owner === P) uiSfx('unitReady'); }
  else if (type === 'built') { structBuilt(d); alertBuilt(d); latinaBuilt(d); if (d.owner === P) uiSfx('built'); }
  else if (type === 'research') { if (d.owner === P) uiSfx('research'); }
  else if (type === 'placed') structPlaced(d);
  else if (type === 'objective') refreshObjective(d);
  // promozione: lampo e suono; per gli assi del giocatore un avviso con il soprannome, che porta sul mezzo
  else if (type === 'rank') rankUp(d, (text, x, y) => { const el = toast(text); if (el) toastGo(el, x, y); });
  // Macchina di Villo distrutta o di ritorno: gli avvisi li manda il motore; qui il segnale sulla minimappa
  else if (type === 'hero') { if (d.x != null) fxs.pings.push({ x: d.x, y: d.y, t: S.time }); if (d.state === 'back') uiSfx('unitReady'); }
  else if (type === 'end') showEnd(d.won, d.reason);
});

// Musica: vampe ed esplosioni che il giocatore vede (o che lo riguardano) alzano l'intensità del combattimento;
// le esplosioni grandi vicine abbassano per un attimo la musica.
function musicFx(e) {
  if (e.k === 'flash') { const w = heard(e.x, e.y, e.owner); if (w) musicHit(0.03 * w); }
  else if (e.k === 'boom') {
    const kind = e.kind || (e.size >= 2 ? 'struct' : Math.abs(e.size - 0.9) < 0.01 ? 'unit' : 'shot');
    const w = heard(e.x, e.y, kind === 'shot' ? undefined : e.owner), mine = kind !== 'shot' && e.owner === P;
    if (kind === 'struct') { const v = Math.max(w, mine ? 0.6 : 0); if (v) musicHit(0.3 * v); if (w > 0.3) musicDuck(0.4); }
    else if (kind === 'unit') { const v = Math.max(w, mine ? 0.5 : 0); if (v) musicHit(0.15 * v); }
    else if (w) { musicHit(0.02 * w); if (e.size >= 1.5 && w > 0.5) musicDuck(0.2); }
  }
}
// Momento musicale secondo la schermata: menu, partita, vittoria o sconfitta; alla fine della campagna «Valle
// liberata». Il manuale e la conferma d'uscita lasciano la musica com'è.
function musicFor() {
  const o = ui.overlay;
  if (o === 'final') return 'finale';
  if (o === 'start' || o === 'campaign' || o === 'brief') return 'menu';
  if (o === 'help' || o === 'exit' || !S) return null;
  if (S.phase === 'won') return 'win';
  if (S.phase === 'lost') return 'lose';
  return o ? null : 'game';
}

let last = performance.now(), uiT = 0, mmT = 0;
// Un errore in una parte del fotogramma non deve fermare il ciclo: la parte salta quel fotogramma e le altre
// vanno avanti. L'errore resta visibile: si segnala come errore non gestito (console e test end-to-end),
// una sola volta per tipo, così un errore che si ripete non riempie la console a ogni fotogramma.
const reported = new Set();
function guard(part, fn) {
  try { fn(); } catch (err) {
    const key = `${part}|${err && err.name}|${String(err && err.message).replace(/[-\d.]+/g, '#')}`;
    if (reported.has(key)) return;
    reported.add(key);
    console.error(`Errore nel fotogramma (${part}); il gioco continua.`);
    if (typeof reportError === 'function') reportError(err); else setTimeout(() => { throw err; });
  }
}
function frame(now) {
  requestAnimationFrame(frame); // prima del lavoro: anche un errore non previsto non ferma il ciclo
  const iv = now - last, dt = Math.min(0.05, iv / 1000), t0 = performance.now(); last = now;
  guard('simulazione', () => { if (S && !ui.paused && !ui.overlay && S.phase === 'play') for (let k = 0; k < ui.speed; k++) step(dt); });
  guard('effetti', () => { if (S && (!ui.paused || ui.overlay === 'ended')) { updParts(dt); updHero(dt); } });
  if (ui.sel.length && ui.sel.some(id => !ent(id))) ui.sel = ui.sel.filter(id => ent(id));
  if (resizeDue) { resizeDue = false; guard('misure', resize); }
  guard('camera', () => camScroll(dt));
  // qualità adattiva: conta i mezzi in campo prima di disegnare (una battaglia grande parte subito dal livello giusto)
  // e misura il fotogramma solo a partita in corso
  const running = !!S && !ui.paused && !ui.overlay && S.phase === 'play';
  if (running && fxPref() === 'auto') { let units = 0; for (const e of S.ents) if (e.kind === 'unit' && !e.dead) units++; guard('qualità', () => unitsTick(units)); }
  guard('disegno', () => render(now));
  guard('frecce', () => { updateArrows(); updateSelCount(); updatePlacebar(); });
  if ((mmT -= dt) <= 0) { mmT = 0.1; guard('minimappa', renderMini); }
  if ((uiT -= dt) <= 0) { uiT = 0.2; guard('pannello', () => { renderPanel(false); updateBar(); if (S && S.timeLimit) limitText(); if (S && !ui.overlay) latinaTick(t => toast(t)); }); guard('musica', () => { const m = musicFor(); if (m) { musicMission(S && S.mission, S && S.objective && S.objective.stage); musicMode(m); } });
    // pioggia e suoni ovattati dalla nebbia solo a partita aperta (non sotto menu e briefing)
    guard('meteo', () => { const inGame = !!S && (!ui.overlay || ui.overlay === 'help' || ui.overlay === 'exit' || ui.overlay === 'ended'); weatherAudio(inGame ? wx.rain : 0, inGame ? wx.fog : 0); }); }
  if (running) guard('qualità', () => frameTick(iv, performance.now() - t0, null));
}

function start(data) {
  initLayout();
  new ResizeObserver(resize).observe(cv);
  new ResizeObserver(resize).observe(mini);
  resize();
  initInput(cv, mini);
  initUI(cv);
  initDrawer();
  initScreens();
  let restored = false;
  const ctx = (data && data.ctx) || {};
  try {
    if (data && data.S && data.S.ents) { loadState(data.S); if (data.cam) Object.assign(window.__wz.cam, data.cam); if (!S.mission) { ui.diff = data.S.diff; setMapPref(S.map || 'casuale'); setWeatherPref(S.weatherMode || 'clear'); } restored = true; }
  } catch (err) { restored = false; }
  if (restored) { ui.techBefore = Array.isArray(ctx.techBefore) ? ctx.techBefore : []; nicksLoad(ctx.nicks); resetObjectiveHud(); }
  // schermate fuori dalla partita: si torna alla stessa (il briefing riprepara la missione da capo)
  if (!restored || ctx.ov === 'start') { if (!restored) startGame(ui.diff, randomSeed()); showStart(); }
  else if (ctx.ov === 'campaign') showCampaign();
  else if (ctx.ov === 'brief' && missionIndex() >= 0) showBrief(missionIndex());
  else if (S.phase === 'play') {
    ui.overlay = null; ui.paused = true;
    document.getElementById('overlay').hidden = true;
    document.getElementById('btnPause').textContent = 'Riprendi'; document.getElementById('btnPause').classList.add('on');
  } else showEnd(S.phase === 'won');
  // Dentro l'anteprima di claude.ai la partita (anche una missione) sopravvive agli aggiornamenti della pagina.
  window.claude?.hot?.snapshot?.(() => S ? { S: serialize(), cam: { ...window.__wz.cam }, ctx: { ov: ui.overlay, techBefore: ui.techBefore || [], nicks: nicksDump() } } : {});
  requestAnimationFrame(frame);
}

// Aggancio per i test end-to-end (Playwright): permette di avanzare la simulazione senza aspettare; gfx() dice come
// si sta cuocendo il terreno (worker o filo principale) e se la visuale è pronta.
import * as engine from '../engine/index.js';
import { cam } from './state.js';
// Piano 10: gfx() riporta anche il meteo disegnato e le livree in cache; vets() i soprannomi; hero() la Macchina di
// Villo (posizione, grado, bagagliaio, effetti in corso); heroFire({ big, x, y, from }) fa partire un colpo dei «Bassi
// a palla» solo disegnato e suonato (gli stessi eventi fx del motore, senza danni): normale, o grosso con big: true.
function heroFire(o = {}) {
  const u = heroUnit(), from = o.from || (u ? [u.x, u.y] : [cam.x + 200, cam.y + 200]);
  const a = u ? u.ang : 0, x = o.x != null ? o.x : from[0] + Math.cos(a) * 150, y = o.y != null ? o.y : from[1] + Math.sin(a) * 150;
  const extra = o.big ? { hero: true, big: true } : { hero: true };
  for (const e of [{ k: 'flash', x: from[0], y: from[1], s: o.big ? 9 : 6, w: 'VILLO', owner: P, tx: x, ty: y, ...extra }, { k: 'boom', x, y, size: o.big ? 2.4 : 1.5, owner: P, kind: 'shot', ...extra }]) { heroFx(e); fxSound(e); musicFx(e); }
  return { x, y, big: !!o.big };
}
window.__wz = { engine, ui, cam, fxs, get S() { return S; }, step: dt => step(dt), P, audio: audioState, music: musicState, fxq: qualityState, setFx: setPref, gfx: renderState, latina: latinaState, vets: veteransState, hero: heroState, heroFire };

window.claude?.hot?.ready ? window.claude.hot.ready(start) : start(window.claude?.hot?.data ?? {});
