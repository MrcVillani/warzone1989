// Avvio del client: collega gli eventi del motore al disegno e all'interfaccia, poi fa girare il ciclo.
import { P, S, ent, onEvent, step, loadState, serialize } from '../engine/index.js';
import { ui, fxs } from './state.js';
import { initRender, resize, renderTerrain, updateFogImage, spawnFx, updParts, render, renderMini, resetFx, unitSpawned, structPlaced, structBuilt } from './render.js';
import { initAudio, fxSound, uiSfx, audioState } from './audio.js';
import { frameTick, onQualityChange, qualityState, setPref } from './quality.js';
import { initInput, camScroll } from './input.js';
import { initUI, renderPanel, updateBar, toast, startGame, showStart, showEnd, randomSeed } from './ui.js';

const cv = document.getElementById('view'), mini = document.getElementById('mini');
initRender(cv, mini);

initAudio();
// cambio del livello di qualità: la tela della mappa prende la risoluzione del nuovo livello
onQualityChange(() => resize());

onEvent((type, d) => {
  if (type === 'world') { resetFx(); renderTerrain(S.seed); }
  else if (type === 'fog') updateFogImage();
  else if (type === 'fx') { spawnFx(d); fxSound(d); }
  else if (type === 'toast') {
    toast(d.text, d.kind);
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
  else if (type === 'end') showEnd(d.won);
});

let last = performance.now(), uiT = 0, mmT = 0;
let cntT = 0;
function frame(now) {
  const iv = now - last, dt = Math.min(0.05, iv / 1000), t0 = performance.now(); last = now;
  if (S && !ui.paused && !ui.overlay && S.phase === 'play') for (let k = 0; k < ui.speed; k++) step(dt);
  if (S && (!ui.paused || ui.overlay === 'ended')) updParts(dt);
  if (ui.sel.length && ui.sel.some(id => !ent(id))) ui.sel = ui.sel.filter(id => ent(id));
  camScroll(dt);
  render(now);
  if ((mmT -= dt) <= 0) { renderMini(); mmT = 0.1; }
  if ((uiT -= dt) <= 0) { renderPanel(false); updateBar(); uiT = 0.2; }
  // qualità adattiva: conta i mezzi in campo due volte al secondo e misura il fotogramma solo a partita in corso
  const running = !!S && !ui.paused && !ui.overlay && S.phase === 'play';
  let units = null;
  if (running && (cntT -= dt) <= 0) { cntT = 0.5; units = 0; for (const e of S.ents) if (e.kind === 'unit' && !e.dead) units++; }
  if (running) frameTick(iv, performance.now() - t0, units);
  requestAnimationFrame(frame);
}

function start(data) {
  new ResizeObserver(resize).observe(cv);
  new ResizeObserver(resize).observe(mini);
  resize();
  initInput(cv, mini);
  initUI(cv);
  let restored = false;
  try {
    if (data && data.S && data.S.ents) { loadState(data.S); if (data.cam) Object.assign(window.__wz.cam, data.cam); ui.diff = data.S.diff; restored = true; }
  } catch (err) { restored = false; }
  if (!restored) { startGame(ui.diff, randomSeed()); showStart(); }
  else if (S.phase === 'play') {
    ui.overlay = null; ui.paused = true;
    document.getElementById('overlay').hidden = true;
    document.getElementById('btnPause').textContent = 'Riprendi'; document.getElementById('btnPause').classList.add('on');
  } else showEnd(S.phase === 'won');
  // Dentro l'anteprima di claude.ai la partita sopravvive agli aggiornamenti della pagina.
  window.claude?.hot?.snapshot?.(() => S ? { S: serialize(), cam: { ...window.__wz.cam } } : {});
  requestAnimationFrame(frame);
}

// Aggancio per i test end-to-end (Playwright): permette di avanzare la simulazione senza aspettare.
import * as engine from '../engine/index.js';
import { cam } from './state.js';
window.__wz = { engine, ui, cam, fxs, get S() { return S; }, step: dt => step(dt), P, audio: audioState, fxq: qualityState, setFx: setPref };

window.claude?.hot?.ready ? window.claude.hot.ready(start) : start(window.claude?.hot?.data ?? {});
