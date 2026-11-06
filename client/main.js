// Avvio del client: collega gli eventi del motore al disegno e all'interfaccia, poi fa girare il ciclo.
import { P, S, ent, onEvent, step, loadState, serialize } from '../engine/index.js';
import { ui, fxs } from './state.js';
import { initRender, resize, renderTerrain, updateFogImage, spawnFx, updParts, render, renderMini } from './render.js';
import { initInput, camScroll } from './input.js';
import { initUI, renderPanel, updateBar, toast, startGame, showStart, showEnd, randomSeed } from './ui.js';

const cv = document.getElementById('view'), mini = document.getElementById('mini');
initRender(cv, mini);

onEvent((type, d) => {
  if (type === 'world') renderTerrain(S.seed);
  else if (type === 'fog') updateFogImage();
  else if (type === 'fx') spawnFx(d);
  else if (type === 'toast') toast(d.text, d.kind);
  else if (type === 'ping') fxs.pings.push({ x: d.x, y: d.y, t: S.time });
  else if (type === 'end') showEnd(d.won);
});

let last = performance.now(), uiT = 0, mmT = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (S && !ui.paused && !ui.overlay && S.phase === 'play') for (let k = 0; k < ui.speed; k++) step(dt);
  if (S && (!ui.paused || ui.overlay === 'ended')) updParts(dt);
  if (ui.sel.length && ui.sel.some(id => !ent(id))) ui.sel = ui.sel.filter(id => ent(id));
  camScroll(dt);
  render(now);
  if ((mmT -= dt) <= 0) { renderMini(); mmT = 0.1; }
  if ((uiT -= dt) <= 0) { renderPanel(false); updateBar(); uiT = 0.2; }
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
window.__wz = { engine, ui, cam, get S() { return S; }, step: dt => step(dt), P };

window.claude?.hot?.ready ? window.claude.hot.ready(start) : start(window.claude?.hot?.data ?? {});
