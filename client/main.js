// Avvio del client: collega gli eventi del motore al disegno e all'interfaccia, poi fa girare il ciclo.
import { P, S, ent, onEvent, step, loadState, serialize } from '../engine/index.js';
import { ui, fxs } from './state.js';
import { initRender, resize, renderTerrain, updateFogImage, spawnFx, updParts, render, renderMini, resetFx, unitSpawned, structPlaced, structBuilt } from './render.js';
import { initAudio, fxSound, uiSfx, audioState, onAudioReady, heard } from './audio.js';
import { attachMusic, musicMode, musicHit, musicDuck, musicState } from './music.js';
import { frameTick, onQualityChange, qualityState, setPref } from './quality.js';
import { initInput, camScroll } from './input.js';
import { initUI, renderPanel, updateBar, toast, startGame, randomSeed } from './ui.js';
import { initScreens, showStart, showEnd, showCampaign, showBrief, refreshObjective, resetObjectiveHud, limitText, missionIndex } from './screens.js';

const cv = document.getElementById('view'), mini = document.getElementById('mini');
initRender(cv, mini);

initAudio();
onAudioReady((ac, master) => attachMusic(ac, master));
// cambio del livello di qualità: la tela della mappa prende la risoluzione del nuovo livello
onQualityChange(() => resize());

onEvent((type, d) => {
  if (type === 'world') { resetFx(); renderTerrain(S.seed); }
  else if (type === 'fog') updateFogImage();
  else if (type === 'fx') { spawnFx(d); fxSound(d); musicFx(d); }
  else if (type === 'toast') {
    toast(d.text, d.kind);
    if (d.kind === 'bad') musicHit(/^Contatto nemico/.test(d.text) ? 0.3 : 0.1);
    // allarme radio sul contatto nemico; i toast di «pronto» e «ricerca» fanno da riserva agli eventi dedicati
    // (i suoni hanno un intervallo minimo, quindi non si sentono due volte)
    if (d.kind === 'bad' && /^Contatto nemico/.test(d.text)) uiSfx('alarm');
    else if (/^Ricerca completata/.test(d.text)) uiSfx('research');
    else if (/ (pronto|pronta) nel settore/.test(d.text)) uiSfx('built');
  }
  else if (type === 'ping') fxs.pings.push({ x: d.x, y: d.y, t: S.time });
  else if (type === 'unit') { unitSpawned(d); if (d.owner === P) uiSfx('unitReady'); }
  else if (type === 'built') { structBuilt(d); if (d.owner === P) uiSfx('built'); }
  else if (type === 'research') { if (d.owner === P) uiSfx('research'); }
  else if (type === 'placed') structPlaced(d);
  else if (type === 'objective') refreshObjective(d);
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
// Momento musicale secondo la schermata: menu, partita, vittoria o sconfitta. Il manuale e la conferma d'uscita
// lasciano la musica com'è.
function musicFor() {
  const o = ui.overlay;
  if (o === 'start' || o === 'campaign' || o === 'brief' || o === 'final') return 'menu';
  if (o === 'help' || o === 'exit' || !S) return null;
  if (S.phase === 'won') return 'win';
  if (S.phase === 'lost') return 'lose';
  return o ? null : 'game';
}

let last = performance.now(), uiT = 0, mmT = 0;
let cntT = 0;
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
  guard('effetti', () => { if (S && (!ui.paused || ui.overlay === 'ended')) updParts(dt); });
  if (ui.sel.length && ui.sel.some(id => !ent(id))) ui.sel = ui.sel.filter(id => ent(id));
  guard('camera', () => camScroll(dt));
  guard('disegno', () => render(now));
  if ((mmT -= dt) <= 0) { mmT = 0.1; guard('minimappa', renderMini); }
  if ((uiT -= dt) <= 0) { uiT = 0.2; guard('pannello', () => { renderPanel(false); updateBar(); if (S && S.timeLimit) limitText(); }); guard('musica', () => { const m = musicFor(); if (m) musicMode(m); }); }
  // qualità adattiva: conta i mezzi in campo due volte al secondo e misura il fotogramma solo a partita in corso
  const running = !!S && !ui.paused && !ui.overlay && S.phase === 'play';
  let units = null;
  if (running && (cntT -= dt) <= 0) { cntT = 0.5; units = 0; for (const e of S.ents) if (e.kind === 'unit' && !e.dead) units++; }
  if (running) guard('qualità', () => frameTick(iv, performance.now() - t0, units));
}

function start(data) {
  new ResizeObserver(resize).observe(cv);
  new ResizeObserver(resize).observe(mini);
  resize();
  initInput(cv, mini);
  initUI(cv);
  initScreens();
  let restored = false;
  const ctx = (data && data.ctx) || {};
  try {
    if (data && data.S && data.S.ents) { loadState(data.S); if (data.cam) Object.assign(window.__wz.cam, data.cam); if (!S.mission) ui.diff = data.S.diff; restored = true; }
  } catch (err) { restored = false; }
  if (restored) { ui.techBefore = Array.isArray(ctx.techBefore) ? ctx.techBefore : []; resetObjectiveHud(); }
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
  window.claude?.hot?.snapshot?.(() => S ? { S: serialize(), cam: { ...window.__wz.cam }, ctx: { ov: ui.overlay, techBefore: ui.techBefore || [] } } : {});
  requestAnimationFrame(frame);
}

// Aggancio per i test end-to-end (Playwright): permette di avanzare la simulazione senza aspettare.
import * as engine from '../engine/index.js';
import { cam } from './state.js';
window.__wz = { engine, ui, cam, fxs, get S() { return S; }, step: dt => step(dt), P, audio: audioState, music: musicState, fxq: qualityState, setFx: setPref };

window.claude?.hot?.ready ? window.claude.hot.ready(start) : start(window.claude?.hot?.data ?? {});
