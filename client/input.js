// Mouse, touch e tastiera: traduce i gesti del giocatore in ordini del motore.
import {
  TILE, MW, MH, P, E, STRUCTS, S, ent, occ, depIdx, explored, canSee, designName,
  cmdMove, cmdAttack, cmdBuild, cmdStop, canPlace, placeStruct, ftile, clamp,
} from '../engine/index.js';
import { ui, cam, view, hover, fxs } from './state.js';
import { selUnits, selStructs, setSel } from './selection.js';
import { screenToWorld, clampCam, centerOn, mark } from './render.js';
import { toast, togglePause, closeOverlay } from './ui.js';
import { uiSfx } from './audio.js';

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
function clickAt(px, py, touch, shift, dbl) {
  const w = screenToWorld(px, py);
  if (ui.placing) { tryPlace(w.x, w.y); return; }
  if (ui.amove) { commandAt(w.x, w.y, touch); return; }
  const hit = pickAt(w.x, w.y, touch);
  const ownHit = hit && hit.owner === P && !buildTarget(hit);
  if (!ownHit && (selUnits().length || selStructs().some(s => s.type === 'factory' || s.type === 'hq'))) { commandAt(w.x, w.y, touch); return; }
  if (hit) {
    if (hit.owner === P && dbl && hit.kind === 'unit') {
      const key = hit.builder ? 'B' : designName(hit.d);
      const { cw, ch } = view;
      setSel(S.ents.filter(e => e.kind === 'unit' && e.owner === P && !e.dead && (e.builder ? 'B' : designName(e.d)) === key && e.x > cam.x && e.x < cam.x + cw / cam.z && e.y > cam.y && e.y < cam.y + ch / cam.z).map(e => e.id));
      return;
    }
    if (shift && hit.owner === P) { const i = ui.sel.indexOf(hit.id); const ns = ui.sel.slice(); if (i >= 0) ns.splice(i, 1); else ns.push(hit.id); setSel(ns); }
    else setSel([hit.id]);
  } else if (!shift) setSel([]);
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
export function initInput(cv, mini) {
  const ptrs = new Map(); let drag = null, lastClick = { t: 0, id: 0 };
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointerdown', e => {
    if (!S || ui.overlay) return;
    cv.setPointerCapture(e.pointerId);
    const x = e.offsetX, y = e.offsetY;
    ptrs.set(e.pointerId, { x, y });
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      drag = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: cam.z, wx: cam.x + (a.x + b.x) / 2 / cam.z, wy: cam.y + (a.y + b.y) / 2 / cam.z };
      fxs.boxSel = null; return;
    }
    if (e.pointerType === 'mouse') {
      if (e.button === 2) {
        if (ui.placing) { ui.placing = null; ui.key = ''; } else if (ui.amove) ui.amove = false;
        else { const w = screenToWorld(x, y); commandAt(w.x, w.y, false); }
        return;
      }
      if (e.button === 1 || spaceDown) { drag = { type: 'pan', sx: x, sy: y, cx: cam.x, cy: cam.y, moved: false }; cv.classList.add('pan'); e.preventDefault(); return; }
      if (e.button === 0) drag = { type: 'box', sx: x, sy: y, x, y, moved: false, shift: e.shiftKey, touch: false };
    } else {
      drag = { type: ui.mode === 'pan' ? 'pan' : 'box', sx: x, sy: y, x, y, cx: cam.x, cy: cam.y, moved: false, touch: true };
    }
  });
  cv.addEventListener('pointermove', e => {
    const x = e.offsetX, y = e.offsetY;
    hover.x = x; hover.y = y; hover.in = true;
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x, y });
    if (!drag) return;
    if (drag.type === 'pinch') {
      if (ptrs.size < 2) return;
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      cam.z = clamp(drag.z0 * d / drag.d0, 0.55, 1.7);
      cam.x = drag.wx - mx / cam.z; cam.y = drag.wy - my / cam.z; clampCam(); return;
    }
    if (Math.hypot(x - drag.sx, y - drag.sy) > 7) drag.moved = true;
    if (drag.type === 'pan') { cam.x = drag.cx - (x - drag.sx) / cam.z; cam.y = drag.cy - (y - drag.sy) / cam.z; clampCam(); }
    else { drag.x = x; drag.y = y; fxs.boxSel = drag.moved && !ui.placing ? drag : null; }
  });
  const endPtr = e => {
    ptrs.delete(e.pointerId);
    if (!drag) return;
    if (drag.type === 'pinch') { if (ptrs.size === 0) drag = null; return; }
    const d = drag; drag = null; fxs.boxSel = null; if (ui.mode !== 'pan') cv.classList.remove('pan');
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
    cam.z = clamp(cam.z * (e.deltaY < 0 ? 1.12 : 1 / 1.12), 0.55, 1.7);
    cam.x = w.x - e.offsetX / cam.z; cam.y = w.y - e.offsetY / cam.z; clampCam();
  }, { passive: false });

  const miniEvt = e => { const r = mini.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * MW * TILE, y: (e.clientY - r.top) / r.height * MH * TILE }; };
  let miniDrag = false;
  mini.addEventListener('contextmenu', e => e.preventDefault());
  mini.addEventListener('pointerdown', e => {
    if (!S || ui.overlay) return;
    const w = miniEvt(e);
    if (e.button === 2) { const u = selUnits(); if (u.length) { cmdMove(u, w.x, w.y, ui.amove); uiSfx(ui.amove ? 'ordAttack' : 'ordMove'); ui.amove = false; } return; }
    miniDrag = true; mini.setPointerCapture(e.pointerId); centerOn(w.x, w.y);
  });
  mini.addEventListener('pointermove', e => { if (miniDrag) { const w = miniEvt(e); centerOn(w.x, w.y); } });
  mini.addEventListener('pointerup', () => { miniDrag = false; });
  mini.addEventListener('pointercancel', () => { miniDrag = false; });

  window.addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input,textarea')) return;
    if (!S || ui.overlay) { if (e.key === 'Escape' && ui.overlay === 'help') closeOverlay(); return; }
    const k = e.key, lk = k.toLowerCase();
    if (k === ' ') { spaceDown = true; e.preventDefault(); return; }
    if (k.startsWith('Arrow')) { keys.add(k); e.preventDefault(); return; }
    if (k === 'Escape') { deselect(); return; }
    if (lk === 'a' && !e.ctrlKey && !e.metaKey) { if (selUnits().some(u => !u.builder)) ui.amove = true; return; }
    if (lk === 's' && !e.ctrlKey && !e.metaKey) { cmdStop(selUnits()); return; }
    if (lk === 'h') { const hq = S.ents.find(x => x.owner === P && x.type === 'hq' && !x.dead); if (hq) centerOn(hq.x, hq.y); return; }
    if (lk === 'p') { togglePause(); return; }
    if (/^[1-9]$/.test(k)) {
      if (e.ctrlKey || e.metaKey) { ui.groups[k] = selUnits().map(u => u.id); toast(`Gruppo ${k}: ${ui.groups[k].length} mezzi.`); e.preventDefault(); }
      else if (ui.groups[k]) {
        const ids = ui.groups[k].filter(id => ent(id));
        if (ids.length) {
          const now = performance.now();
          if (ui.lastGroup === k && now - ui.lastGroupT < 400) { const u = ent(ids[0]); centerOn(u.x, u.y); }
          ui.lastGroup = k; ui.lastGroupT = now; setSel(ids);
        }
      }
    }
  });
  window.addEventListener('keyup', e => { if (e.key === ' ') spaceDown = false; keys.delete(e.key); });
  window.addEventListener('blur', () => { keys.clear(); spaceDown = false; });
}
export function camScroll(dt) {
  if (!S || ui.overlay) return;
  let vx = 0, vy = 0; const sp = 620 / cam.z;
  if (keys.has('ArrowLeft')) vx -= 1; if (keys.has('ArrowRight')) vx += 1; if (keys.has('ArrowUp')) vy -= 1; if (keys.has('ArrowDown')) vy += 1;
  if (hover.in && matchMedia('(pointer: fine)').matches) {
    const m = 14; if (hover.x < m) vx -= 1; if (hover.x > view.cw - m) vx += 1; if (hover.y < m) vy -= 1; if (hover.y > view.ch - m) vy += 1;
  }
  if (vx || vy) { cam.x += vx * sp * dt; cam.y += vy * sp * dt; clampCam(); }
}
