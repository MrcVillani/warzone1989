// Mouse, touch e tastiera: traduce i gesti del giocatore in ordini del motore.
import {
  TILE, MW, MH, P, E, STRUCTS, S, ent, occ, depIdx, explored, canSee, designName,
  cmdMove, cmdAttack, cmdBuild, cmdStop, canPlace, placeStruct, ftile, clamp,
} from '../engine/index.js';
import { ui, cam, view, hover, fxs } from './state.js';
import { selUnits, selStructs, setSel } from './selection.js';
import { screenToWorld, clampCam, centerOn, mark } from './render.js';
import { toast, togglePause } from './ui.js';
import { overlayEscape } from './screens.js';
import { uiSfx } from './audio.js';

// Gesti touch: soglie di movimento e di tempo per distinguere tocco, trascinamento, tocco lungo e doppio tocco.
export const TAP_MOVE = 10, LONG_MS = 450, DBL_MS = 350;
const SNAP_PX = 32; // raggio di aggancio del tocco ai propri mezzi, in pixel dello schermo
// Zoom: rotella del computer come oggi; con due dita limiti un po' più ampi.
const ZMIN = 0.55, ZMAX = 1.7, ZMIN_T = 0.45, ZMAX_T = 2.0;
// Vibrazione breve, se il dispositivo la permette (su Android serve il permesso VIBRATE); altrimenti niente.
export function buzz(ms = 18) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* niente */ } }
const plural = n => `${n} ${n === 1 ? 'mezzo' : 'mezzi'}`;

// Entità sotto il punto. Su touch l'area dei mezzi è più ampia: almeno 22 px di raggio sullo schermo.
export function pickAt(wx, wy, touch) {
  let best = null, bd = 1e9;
  const minR = touch ? 22 / cam.z : 0;
  for (const e of S.ents) {
    if (e.dead || e.kind !== 'unit' || (e.owner !== P && !canSee(P, e))) continue;
    const d = Math.hypot(e.x - wx, e.y - wy); if (d < Math.max(e.rad + 5, minR) && d < bd) { bd = d; best = e; }
  }
  if (best) return best;
  for (const e of S.ents) {
    if (e.dead || e.kind !== 'struct' || (e.owner !== P && !e.seen)) continue;
    if (wx >= e.tx * TILE && wx < (e.tx + e.w) * TILE && wy >= e.ty * TILE && wy < (e.ty + e.h) * TILE) return e;
  }
  return null;
}
// Ordine "intelligente" sul punto: attacca un nemico, costruisce/ripara, avvia una pompa, oppure muove.
// Con solo una fabbrica o il comando selezionati imposta il punto di raduno.
export function commandAt(wx, wy, touch) {
  const units = selUnits();
  if (!units.length) {
    const prods = selStructs().filter(s => s.type === 'factory' || s.type === 'hq');
    if (prods.length) { prods.forEach(s => { s.rally = [wx, wy]; }); mark(wx, wy, '#f0c27a'); uiSfx('ordMove'); }
    return;
  }
  const hit = pickAt(wx, wy, touch);
  if (hit && hit.owner === E && canSee(P, hit)) {
    const armed = units.filter(u => !u.builder);
    if (armed.length) { cmdAttack(armed, hit); mark(hit.x, hit.y, '#e0564a'); uiSfx('ordAttack'); }
    const b = units.filter(u => u.builder); if (b.length && !armed.length) { cmdMove(b, wx, wy, false); uiSfx('ordMove'); }
    ui.amove = false; return;
  }
  const builders = units.filter(u => u.builder), rest = units.filter(u => !u.builder);
  if (hit && hit.owner === P && hit.kind === 'struct' && (hit.built < 1 || hit.hp < hit.max) && builders.length) {
    cmdBuild(builders, hit); if (rest.length) cmdMove(rest, wx, wy, ui.amove); mark(hit.x, hit.y, '#93c86e'); uiSfx('ordBuild'); ui.amove = false; return;
  }
  const tx = ftile(wx), ty = ftile(wy);
  if (builders.length && tx >= 0 && ty >= 0 && tx < MW && ty < MH && depIdx[tx + ty * MW] >= 0 && !occ[tx + ty * MW] && explored[tx + ty * MW]) {
    const s = placeStruct(P, 'pump', tx, ty);
    if (s) { cmdBuild(builders, s); if (rest.length) cmdMove(rest, wx, wy, ui.amove); mark(s.x, s.y, '#93c86e'); uiSfx('ordBuild'); ui.amove = false; return; }
    if (S.res[P] < STRUCTS.pump.cost) toast('Servono 50 di gasolio per una pompa.', 'warn');
  }
  cmdMove(units, wx, wy, ui.amove);
  mark(wx, wy, ui.amove ? '#e0564a' : '#93c86e');
  uiSfx(ui.amove ? 'ordAttack' : 'ordMove');
  ui.amove = false;
}
// Un clic su un proprio edificio dà l'ordine invece di selezionarlo solo se ci sono genieri selezionati e l'edificio
// è un cantiere o è danneggiato (costruisci o ripara).
const buildTarget = hit => hit && hit.owner === P && hit.kind === 'struct' && (hit.built < 1 || hit.hp < hit.max) && selUnits().some(u => u.builder);
export function stopInertia() { inertia = null; }
export function selectArmy() {
  const ids = S.ents.filter(e => e.kind === 'unit' && e.owner === P && !e.dead && !e.builder).map(e => e.id);
  setSel(ids); ui.placing = null; ui.amove = false;
  if (!ids.length) toast('Non hai mezzi armati.', 'warn');
  return ids.length;
}
function tryPlace(wx, wy) {
  const D = STRUCTS[ui.placing];
  const tx = Math.floor(wx / TILE - D.w / 2 + 0.5), ty = Math.floor(wy / TILE - D.h / 2 + 0.5);
  const builders = selUnits().filter(u => u.builder);
  if (!builders.length) { toast('Seleziona un geniere per costruire.', 'warn'); ui.placing = null; return; }
  if (S.res[P] < D.cost) { toast(`Servono ${D.cost} di gasolio.`, 'warn'); return; }
  if (!canPlace(P, ui.placing, tx, ty)) { toast(ui.placing === 'pump' ? 'La pompa va su un giacimento libero ed esplorato.' : 'Qui non si può costruire: serve terreno libero ed esplorato.', 'warn'); return; }
  const s = placeStruct(P, ui.placing, tx, ty);
  if (s) { cmdBuild(builders, s); mark(s.x, s.y, '#93c86e'); uiSfx('ordBuild'); }
  ui.placing = null; ui.key = '';
}
// Clic sinistro o tocco: su un proprio mezzo o edificio lo seleziona; altrove, con dei mezzi selezionati, dà l'ordine
// (come il clic destro); con solo una fabbrica o il comando selezionati imposta il punto di raduno.
function clickAt(px, py, touch, shift, dbl, picked) {
  const w = screenToWorld(px, py);
  if (ui.placing) { tryPlace(w.x, w.y); return; }
  if (ui.amove) { commandAt(w.x, w.y, touch); return; }
  const hit = picked !== undefined ? picked : pickAt(w.x, w.y, touch);
  const ownHit = hit && hit.owner === P && !buildTarget(hit);
  if (!ownHit && (selUnits().length || selStructs().some(s => s.type === 'factory' || s.type === 'hq'))) { commandAt(w.x, w.y, touch); return; }
  if (hit) {
    if (hit.owner === P && dbl && hit.kind === 'unit') { selectSameType(hit); return; }
    if (shift && hit.owner === P) { const i = ui.sel.indexOf(hit.id); const ns = ui.sel.slice(); if (i >= 0) ns.splice(i, 1); else ns.push(hit.id); setSel(ns); }
    else setSel([hit.id]);
  } else if (!shift) setSel([]);
}
// Tutti i propri mezzi dello stesso progetto (o tutti i genieri) visibili sullo schermo.
function selectSameType(hit) {
  const key = hit.builder ? 'B' : designName(hit.d);
  const { cw, ch } = view;
  setSel(S.ents.filter(e => e.kind === 'unit' && e.owner === P && !e.dead && (e.builder ? 'B' : designName(e.d)) === key && e.x > cam.x && e.x < cam.x + cw / cam.z && e.y > cam.y && e.y < cam.y + ch / cam.z).map(e => e.id));
}
// Tocco: un mezzo o un edificio direttamente sotto il dito vince; altrimenti il tocco si aggancia al proprio mezzo
// più vicino entro SNAP_PX. Con dei mezzi selezionati l'aggancio salta quelli già selezionati, così un ordine
// di movimento poco lontano da loro resta un ordine.
function pickTouch(px, py) {
  const w = screenToWorld(px, py), direct = pickAt(w.x, w.y, true);
  if (direct) return direct;
  const skip = selUnits().length ? new Set(ui.sel) : null;
  let best = null, bd = SNAP_PX / cam.z;
  for (const e of S.ents) {
    if (e.dead || e.kind !== 'unit' || e.owner !== P || (skip && skip.has(e.id))) continue;
    const d = Math.hypot(e.x - w.x, e.y - w.y); if (d < bd) { bd = d; best = e; }
  }
  return best;
}
let lastTap = { t: 0, id: 0, x: 0, y: 0 };
function tapAt(px, py) {
  const hit = ui.placing || ui.amove ? null : pickTouch(px, py), now = performance.now();
  const dbl = !!hit && hit.kind === 'unit' && hit.owner === P && lastTap.id === hit.id && now - lastTap.t < DBL_MS;
  lastTap = { t: dbl ? 0 : now, id: hit ? hit.id : 0, x: px, y: py };
  clickAt(px, py, true, false, dbl, hit);
}
// Tocco lungo senza trascinare: su un proprio mezzo = tutti quelli dello stesso tipo sullo schermo; sul terreno
// (o su un nemico) con dei mezzi armati selezionati = attacca-muovi lì; altrimenti come un tocco.
function longTapAt(px, py) {
  if (ui.placing) { clickAt(px, py, true, false, false); return; }
  const hit = pickTouch(px, py);
  if (hit && hit.owner === P && hit.kind === 'unit') { selectSameType(hit); return; }
  if ((!hit || hit.owner !== P) && selUnits().some(u => !u.builder)) { const w = screenToWorld(px, py); ui.amove = true; commandAt(w.x, w.y, true); return; }
  clickAt(px, py, true, false, false, hit);
}

/* ---------- squadre ----------
   Le squadre 1–4 della barra sono i gruppi 1–4 della tastiera (Ctrl+1–9 / 1–9): stessa memoria. */
export function squadIds(k) { return (ui.groups[k] || []).filter(id => { const e = ent(id); return e && !e.dead; }); }
export function saveSquad(k) {
  const ids = selUnits().map(u => u.id);
  if (!ids.length) { toast(`Seleziona dei mezzi, poi tieni premuto ${k} per salvarli nella squadra.`, 'warn'); return false; }
  ui.groups[k] = ids; buzz(25);
  toast(`Squadra ${k}: ${plural(ids.length)}.`);
  return true;
}
// Seleziona la squadra; con center porta la visuale sul suo mezzo più vicino al centro del gruppo.
export function recallSquad(k, center) {
  const ids = squadIds(k);
  if (!ids.length) { toast(ui.groups[k] && ui.groups[k].length ? `Squadra ${k}: nessun mezzo rimasto.` : `Squadra ${k} vuota: tieni premuto per salvarci la selezione.`, 'warn'); return false; }
  setSel(ids); ui.placing = null; ui.amove = false;
  if (center) {
    const us = ids.map(ent), mx = us.reduce((a, u) => a + u.x, 0) / us.length, my = us.reduce((a, u) => a + u.y, 0) / us.length;
    const u = us.reduce((b, u) => Math.hypot(u.x - mx, u.y - my) < Math.hypot(b.x - mx, b.y - my) ? u : b);
    centerOn(u.x, u.y); inertia = null;
  }
  return true;
}

// Deseleziona (Esc o pulsante «Deseleziona»): prima annulla un piazzamento o un attacca-muovi in corso.
export function deselect() {
  if (ui.placing || ui.amove) { ui.placing = null; ui.amove = false; ui.key = ''; return; }
  setSel([]);
}
function boxSelect(b, shift) {
  const a = screenToWorld(Math.min(b.sx, b.x), Math.min(b.sy, b.y)), c = screenToWorld(Math.max(b.sx, b.x), Math.max(b.sy, b.y));
  const ids = S.ents.filter(e => e.kind === 'unit' && e.owner === P && !e.dead && e.x >= a.x && e.x <= c.x && e.y >= a.y && e.y <= c.y).map(e => e.id);
  setSel(shift ? Array.from(new Set(ui.sel.concat(ids))) : ids);
}

const keys = new Set(); let spaceDown = false;
// Trascinamento in corso (mouse, dito o due dita) e scivolamento della mappa dopo uno scorrimento a un dito.
let drag = null, inertia = null;
// Riquadro disegnato con il dito: l'angolo di partenza resta fermo sul mondo anche se la mappa scorre da sola.
function touchBox(d) {
  const sx = (d.wsx - cam.x) * cam.z, sy = (d.wsy - cam.y) * cam.z;
  fxs.boxSel = { sx, sy, x: d.x, y: d.y, long: d.state === 'long' };
  return fxs.boxSel;
}
// Lo scorrimento con il dito continua con la velocità degli ultimi ~100 ms e rallenta pian piano.
function startInertia(d) {
  const now = performance.now(), h = d.hist.filter(p => now - p.t <= 100);
  if (h.length < 2) return;
  const a = h[0], b = h[h.length - 1], dt = (b.t - a.t) / 1000; if (dt < 0.012) return;
  let vx = (b.x - a.x) / dt, vy = (b.y - a.y) / dt; const v = Math.hypot(vx, vy);
  if (v < 120) return;
  if (v > 4000) { vx *= 4000 / v; vy *= 4000 / v; }
  inertia = { vx, vy };
}
// Due dita: lo zoom si applica una volta per fotogramma con le posizioni di entrambe (meno scatti).
function applyPinch(d) {
  if (ptrsRef.size < 2) return;
  const [a, b] = [...ptrsRef.values()];
  const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  cam.z = clamp(d.z0 * dist / d.d0, ZMIN_T, ZMAX_T);
  cam.x = d.wx - mx / cam.z; cam.y = d.wy - my / cam.z; clampCam();
  d.dirty = false;
}
let ptrsRef = new Map();
export function initInput(cv, mini) {
  const ptrs = ptrsRef; let lastClick = { t: 0, id: 0 };
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointerdown', e => {
    if (!S || ui.overlay) return;
    cv.setPointerCapture(e.pointerId);
    const x = e.offsetX, y = e.offsetY;
    ptrs.set(e.pointerId, { x, y });
    if (e.pointerType !== 'mouse') inertia = null;
    if (ptrs.size === 2) {
      if (drag && drag.timer) clearTimeout(drag.timer);
      const [a, b] = [...ptrs.values()];
      drag = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: cam.z, wx: cam.x + (a.x + b.x) / 2 / cam.z, wy: cam.y + (a.y + b.y) / 2 / cam.z, dirty: false };
      fxs.boxSel = null; return;
    }
    if (ptrs.size > 2) return;
    if (e.pointerType === 'mouse') {
      if (e.button === 2) {
        if (ui.placing) { ui.placing = null; ui.key = ''; } else if (ui.amove) ui.amove = false;
        else { const w = screenToWorld(x, y); commandAt(w.x, w.y, false); }
        return;
      }
      if (e.button === 1 || spaceDown) { drag = { type: 'pan', sx: x, sy: y, cx: cam.x, cy: cam.y, moved: false }; cv.classList.add('pan'); e.preventDefault(); return; }
      if (e.button === 0) drag = { type: 'box', sx: x, sy: y, x, y, moved: false, shift: e.shiftKey, touch: false };
    } else {
      // Dito: scorre la mappa; fermo e veloce = tocco; fermo per LONG_MS = tocco lungo (poi trascinare = riquadro).
      const now = performance.now();
      const d = { type: 'touch', state: 'press', sx: x, sy: y, x, y, cx: cam.x, cy: cam.y, hist: [{ t: now, x, y }], timer: 0 };
      d.timer = setTimeout(() => {
        if (drag !== d || d.state !== 'press') return;
        d.state = 'long'; d.timer = 0; buzz(20);
        const w = screenToWorld(d.sx, d.sy); d.wsx = w.x; d.wsy = w.y;
        touchBox(d);
      }, LONG_MS);
      drag = d;
    }
  });
  cv.addEventListener('pointermove', e => {
    const x = e.offsetX, y = e.offsetY;
    hover.x = x; hover.y = y; hover.in = true;
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x, y });
    if (!drag) return;
    if (drag.type === 'pinch') { drag.dirty = true; return; }
    if (drag.type === 'touch') {
      if (!ptrs.has(e.pointerId)) return;
      const d = drag, now = performance.now();
      d.x = x; d.y = y; d.hist.push({ t: now, x, y });
      while (d.hist.length > 2 && now - d.hist[0].t > 150) d.hist.shift();
      const far = Math.hypot(x - d.sx, y - d.sy) > TAP_MOVE;
      if (d.state === 'press' && far) { clearTimeout(d.timer); d.timer = 0; d.state = 'pan'; }
      else if (d.state === 'long' && far) d.state = 'box';
      if (d.state === 'pan') { cam.x = d.cx - (x - d.sx) / cam.z; cam.y = d.cy - (y - d.sy) / cam.z; clampCam(); }
      else if (d.state === 'box' || d.state === 'long') touchBox(d);
      return;
    }
    if (Math.hypot(x - drag.sx, y - drag.sy) > 7) drag.moved = true;
    if (drag.type === 'pan') { cam.x = drag.cx - (x - drag.sx) / cam.z; cam.y = drag.cy - (y - drag.sy) / cam.z; clampCam(); }
    else { drag.x = x; drag.y = y; fxs.boxSel = drag.moved && !ui.placing ? drag : null; }
  });
  const endPtr = e => {
    const had = ptrs.delete(e.pointerId);
    if (!drag) return;
    if (drag.type === 'pinch') {
      if (drag.dirty) applyPinch(drag);
      // tolto un dito, l'altro continua a scorrere la mappa senza scatti; niente tocco né riquadro
      if (ptrs.size === 1) { const [p] = [...ptrs.values()], now = performance.now(); drag = { type: 'touch', state: 'pan', sx: p.x, sy: p.y, x: p.x, y: p.y, cx: cam.x, cy: cam.y, hist: [{ t: now, x: p.x, y: p.y }], timer: 0 }; }
      else if (ptrs.size === 0) drag = null;
      return;
    }
    if (drag.type === 'touch') {
      if (!had) return;
      const d = drag; drag = null; if (d.timer) clearTimeout(d.timer); fxs.boxSel = null;
      if (e.type === 'pointercancel') return;
      if (d.state === 'pan') startInertia(d);
      else if (d.state === 'box') { if (!ui.placing) boxSelect(touchBox(d), false); fxs.boxSel = null; }
      else if (d.state === 'long') longTapAt(d.sx, d.sy);
      else tapAt(d.sx, d.sy);
      return;
    }
    const d = drag; drag = null; fxs.boxSel = null; cv.classList.remove('pan');
    if (e.type === 'pointercancel') return;
    if (d.type === 'box' && d.moved && !ui.placing) { boxSelect(d, d.shift); return; }
    if (!d.moved) {
      const w = screenToWorld(d.sx, d.sy), hit = pickAt(w.x, w.y, d.touch), now = performance.now();
      const dbl = hit && lastClick.id === hit.id && now - lastClick.t < 350;
      lastClick = { t: now, id: hit ? hit.id : 0 };
      clickAt(d.sx, d.sy, d.touch, d.shift, dbl);
    }
  };
  cv.addEventListener('pointerup', endPtr);
  cv.addEventListener('pointercancel', endPtr);
  cv.addEventListener('pointerleave', () => { hover.in = false; });
  cv.addEventListener('wheel', e => {
    e.preventDefault(); if (!S) return;
    const w = screenToWorld(e.offsetX, e.offsetY);
    cam.z = clamp(cam.z * (e.deltaY < 0 ? 1.12 : 1 / 1.12), ZMIN, ZMAX);
    cam.x = w.x - e.offsetX / cam.z; cam.y = w.y - e.offsetY / cam.z; clampCam();
  }, { passive: false });

  // Minimappa: tocco o clic = visuale lì (anche trascinando); clic destro, oppure tocco lungo con dei mezzi
  // selezionati = mandali lì.
  const miniEvt = e => { const r = mini.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * MW * TILE, y: (e.clientY - r.top) / r.height * MH * TILE }; };
  let miniDrag = false, miniPress = null;
  const miniOrder = w => {
    const u = selUnits(); if (!u.length) return false;
    cmdMove(u, w.x, w.y, ui.amove); mark(w.x, w.y, ui.amove ? '#e0564a' : '#93c86e'); uiSfx(ui.amove ? 'ordAttack' : 'ordMove'); ui.amove = false;
    return true;
  };
  const miniStop = () => { if (miniPress) clearTimeout(miniPress.timer); miniPress = null; };
  mini.addEventListener('contextmenu', e => e.preventDefault());
  mini.addEventListener('pointerdown', e => {
    if (!S || ui.overlay) return;
    const w = miniEvt(e);
    if (e.button === 2) { miniOrder(w); return; }
    miniDrag = true; mini.setPointerCapture(e.pointerId); centerOn(w.x, w.y); inertia = null;
    miniStop();
    if (e.pointerType !== 'mouse') {
      const p = { x: e.clientX, y: e.clientY, w };
      p.timer = setTimeout(() => { if (miniPress === p) { miniPress = null; miniDrag = false; if (miniOrder(p.w)) buzz(20); } }, LONG_MS);
      miniPress = p;
    }
  });
  mini.addEventListener('pointermove', e => {
    if (!miniDrag) return;
    const w = miniEvt(e); centerOn(w.x, w.y);
    if (miniPress) { if (Math.hypot(e.clientX - miniPress.x, e.clientY - miniPress.y) > TAP_MOVE) miniStop(); else miniPress.w = w; }
  });
  mini.addEventListener('pointerup', () => { miniDrag = false; miniStop(); });
  mini.addEventListener('pointercancel', () => { miniDrag = false; miniStop(); });

  window.addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input,textarea')) return;
    if (!S || ui.overlay) { if (e.key === 'Escape') overlayEscape(); return; }
    const k = e.key, lk = k.toLowerCase();
    if (k === ' ') { spaceDown = true; e.preventDefault(); return; }
    if (k.startsWith('Arrow')) { keys.add(k); e.preventDefault(); return; }
    if (k === 'Escape') { deselect(); return; }
    if (lk === 'a' && !e.ctrlKey && !e.metaKey) { if (selUnits().some(u => !u.builder)) ui.amove = true; return; }
    if (lk === 's' && !e.ctrlKey && !e.metaKey) { cmdStop(selUnits()); return; }
    if (lk === 'h') { const hq = S.ents.find(x => x.owner === P && x.type === 'hq' && !x.dead); if (hq) centerOn(hq.x, hq.y); return; }
    if (lk === 'p') { togglePause(); return; }
    if (/^[1-9]$/.test(k)) {
      if (e.ctrlKey || e.metaKey) { saveSquad(k); e.preventDefault(); }
      else if (squadIds(k).length) {
        const now = performance.now(), dbl = ui.lastGroup === k && now - ui.lastGroupT < 400;
        ui.lastGroup = k; ui.lastGroupT = now; recallSquad(k, dbl);
      }
    }
  });
  window.addEventListener('keyup', e => { if (e.key === ' ') spaceDown = false; keys.delete(e.key); });
  window.addEventListener('blur', () => { keys.clear(); spaceDown = false; });
}
export function camScroll(dt) {
  if (!S || ui.overlay) { inertia = null; return; }
  if (drag && drag.type === 'pinch' && drag.dirty) applyPinch(drag);
  // riquadro con il dito vicino ai bordi: la mappa scorre da sola, più veloce quanto più il dito è vicino al bordo
  if (drag && drag.type === 'touch' && (drag.state === 'box' || drag.state === 'long')) {
    const m = 44, ex = drag.x < m ? -(1 - drag.x / m) : drag.x > view.cw - m ? 1 - (view.cw - drag.x) / m : 0;
    const ey = drag.y < m ? -(1 - drag.y / m) : drag.y > view.ch - m ? 1 - (view.ch - drag.y) / m : 0;
    if (drag.state === 'box' && (ex || ey)) { const sp = 700 / cam.z; cam.x += clamp(ex, -1, 1) * sp * dt; cam.y += clamp(ey, -1, 1) * sp * dt; clampCam(); }
    touchBox(drag);
  }
  if (inertia) {
    const ox = cam.x, oy = cam.y;
    cam.x -= inertia.vx * dt / cam.z; cam.y -= inertia.vy * dt / cam.z; clampCam();
    // contro il bordo della mappa quella componente si ferma
    if (Math.abs(cam.x - ox) < 1e-3) inertia.vx = 0; if (Math.abs(cam.y - oy) < 1e-3) inertia.vy = 0;
    const k = Math.exp(-dt * 3.2); inertia.vx *= k; inertia.vy *= k;
    if (Math.hypot(inertia.vx, inertia.vy) < 12) inertia = null;
  }
  let vx = 0, vy = 0; const sp = 620 / cam.z;
  if (keys.has('ArrowLeft')) vx -= 1; if (keys.has('ArrowRight')) vx += 1; if (keys.has('ArrowUp')) vy -= 1; if (keys.has('ArrowDown')) vy += 1;
  if (hover.in && matchMedia('(pointer: fine)').matches) {
    const m = 14; if (hover.x < m) vx -= 1; if (hover.x > view.cw - m) vx += 1; if (hover.y < m) vy -= 1; if (hover.y > view.ch - m) vy += 1;
  }
  if (vx || vy) { cam.x += vx * sp * dt; cam.y += vy * sp * dt; clampCam(); }
}
