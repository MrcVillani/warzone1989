// Disposizione B: barra delle schede, cassetto che si apre sopra la mappa, piazzamento degli edifici con conferma,
// riquadro della selezione e minimappa ingrandibile. Sul computer non fa nulla: lì resta il pannello classico.
import { TILE, MW, MH, P, STRUCTS, S, ent, deposits, occ, explored, depIdx, terr, GROUND, DIRT, canPlace, enqueue, designName, clamp } from '../engine/index.js';
import { ui, cam, view, hover } from './state.js';
import { layout, onLayout } from './layout.js';
import { TAB_ICONS, ICON } from './icons.js';
import { renderPanel, toast } from './ui.js';
import { selUnits, onSelect } from './selection.js';
import { screenToWorld, clampCam } from './render.js';
import { LONG_MS, TAP_MOVE, buzz, tryPlace } from './input.js';
import { uiSfx } from './audio.js';

const $ = id => document.getElementById(id);
const TABS = ['build', 'prod', 'res', 'des'];
const TITLES = { build: 'Costruisci', prod: 'Produci', res: 'Ricerca', des: 'Progetta', sel: 'Selezione', menu: 'Menu' };
// Scheda della disposizione B mostrata nel cassetto (o, se il cassetto ha altro, l'ultima scheda scelta).
export const paneTab = () => (layout.b && TABS.includes(ui.drawer) ? ui.drawer : ui.tab);

/* ---------- cassetto ---------- */
export function openDrawer(pane) {
  if (TABS.includes(pane)) ui.tab = pane;
  if (!layout.b) return;
  if (ui.placing) cancelPlacing();
  ui.drawer = pane; ui.key = '';
  syncDrawer(); renderPanel(true);
  const body = $('drawBody'); if (body) body.scrollTop = 0;
}
export function closeDrawer() {
  if (!ui.drawer) return;
  ui.drawer = null; ui.key = ''; syncDrawer();
}
export function toggleDrawer(pane) { if (layout.b && ui.drawer === pane) closeDrawer(); else openDrawer(pane); }
export function syncDrawer() {
  const dr = $('drawer'); if (!dr) return;
  const open = layout.b && !!ui.drawer;
  document.documentElement.classList.toggle('dopen', open);
  dr.dataset.pane = ui.drawer || '';
  dr.inert = !open; dr.setAttribute('aria-hidden', open ? 'false' : 'true');
  if (ui.drawer) $('drawTitle').textContent = TITLES[ui.drawer] || '';
  for (const b of document.querySelectorAll('#tabs [data-tab]')) {
    const on = layout.b ? open && ui.drawer === b.dataset.tab : b.dataset.tab === ui.tab;
    b.classList.toggle('on', on);
    if (layout.b) b.setAttribute('aria-expanded', on ? 'true' : 'false'); else b.removeAttribute('aria-expanded');
  }
}

// Scorrere il cassetto verso il bordo lo chiude (verso destra; in verticale verso il basso, dalla maniglia).
function initSwipe(dr) {
  let sw = null, until = 0;
  const reset = () => { if (sw && sw.on) { dr.classList.remove('drag'); dr.style.transform = ''; } sw = null; };
  dr.addEventListener('pointerdown', e => {
    if (!layout.b || e.pointerType === 'mouse' || !ui.drawer) return;
    sw = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), on: false, head: !!e.target.closest('.dhead') };
  });
  dr.addEventListener('pointermove', e => {
    if (!sw || e.pointerId !== sw.id) return;
    const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
    const d = layout.v ? dy : dx, o = layout.v ? dx : dy;
    if (!sw.on) {
      if (layout.v && !sw.head) return;
      if (d > 14 && d > 1.4 * Math.abs(o)) { sw.on = true; dr.classList.add('drag'); try { dr.setPointerCapture(e.pointerId); } catch (err) { /* niente */ } }
      else if (Math.abs(o) > 14 || d < -14) { sw = null; return; }
    }
    if (sw.on) { sw.d = Math.max(0, d); dr.style.transform = layout.v ? `translateY(${sw.d}px)` : `translateX(${sw.d}px)`; }
  });
  const end = e => {
    if (!sw || e.pointerId !== sw.id) return;
    const s = sw; reset();
    if (!s.on) return;
    until = performance.now() + 400;
    const size = layout.v ? dr.offsetHeight : dr.offsetWidth, v = (s.d || 0) / Math.max(1, performance.now() - s.t);
    if (e.type === 'pointerup' && ((s.d || 0) > Math.min(90, size * 0.3) || v > 0.6)) closeDrawer();
  };
  dr.addEventListener('pointerup', end);
  dr.addEventListener('pointercancel', end);
  // il tocco che chiude con uno scorrimento non vale come tocco su una tessera
  dr.addEventListener('click', e => { if (performance.now() < until) { until = 0; e.stopPropagation(); e.preventDefault(); } }, true);
}

// Tessere di produzione: tocco = uno in coda (il clic del pannello); tieni premuto = cinque.
function initLongPress(body) {
  // dopo il tocco lungo il clic che segue l'alzata del dito non deve aggiungere un sesto mezzo
  let lp = null, armed = false, until = 0;
  const stop = () => { if (lp) clearTimeout(lp.timer); lp = null; };
  const lift = () => { stop(); if (armed) { armed = false; until = performance.now() + 400; } };
  body.addEventListener('pointerdown', e => {
    stop();
    const b = e.target.closest('[data-act="prod"],[data-act="prodb"]');
    if (!b || b.disabled || !S || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const q = { x: e.clientX, y: e.clientY, i: b.dataset.act === 'prod' ? +b.dataset.i : -1 };
    q.timer = setTimeout(() => { if (lp !== q) return; lp = null; armed = true; addFive(q.i); }, LONG_MS);
    lp = q;
  });
  body.addEventListener('pointermove', e => { if (lp && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > TAP_MOVE) stop(); });
  body.addEventListener('pointerup', lift);
  body.addEventListener('pointercancel', lift);
  body.addEventListener('contextmenu', e => { if (e.target.closest('.tile, .qt')) e.preventDefault(); });
  body.addEventListener('click', e => { if (performance.now() < until) { until = 0; e.stopPropagation(); e.preventDefault(); } }, true);
}
function addFive(i) {
  const s = ent(ui.producer), d = i >= 0 ? S.designs[i] : null;
  if (!s || s.dead || (i >= 0 && !d)) return;
  let n = 0; while (n < 5 && enqueue(s, d, P)) n++;
  const nm = d ? designName(d) : 'Geniere';
  if (n) { buzz(25); uiSfx('click'); toast(`${nm}: ${n} in coda.`); }
  else toast(s.queue.length >= 5 ? 'La coda è piena (5).' : 'Gasolio insufficiente.', 'warn');
  ui.key = ''; renderPanel(true);
}

// In verticale il cassetto copre la metà bassa della mappa: se l'edificio appena toccato finisce sotto, la visuale
// sale quanto basta perché resti in vista sopra il cassetto.
function keepAbove(s) {
  const dr = $('drawer'); if (!layout.v || !dr) return;
  const free = view.ch - dr.offsetHeight, sy = (s.y - cam.y) * cam.z;
  if (free > 80 && sy > free - 60) { cam.y += (sy - free * 0.45) / cam.z; clampCam(); }
}

/* ---------- piazzamento con conferma ---------- */
const tileOf = (type, g) => { const D = STRUCTS[type]; return [Math.floor(g.x / TILE - D.w / 2 + 0.5), Math.floor(g.y / TILE - D.h / 2 + 0.5)]; };
const centerOf = (type, tx, ty) => { const D = STRUCTS[type]; return { x: (tx + D.w / 2) * TILE, y: (ty + D.h / 2) * TILE }; };
// Punto di partenza: il centro della mappa sullo schermo, o il posto valido più vicino (per la pompa il giacimento
// libero più vicino in vista).
function startSpot(type) {
  const c = screenToWorld(view.cw / 2, view.ch / 2);
  if (type === 'pump') {
    let best = null, bd = 1e9;
    const vw = view.cw / cam.z, vh = view.ch / cam.z;
    for (const d of deposits) {
      const x = (d.x + 0.5) * TILE, y = (d.y + 0.5) * TILE;
      if (x < cam.x || x > cam.x + vw || y < cam.y || y > cam.y + vh || !canPlace(P, 'pump', d.x, d.y)) continue;
      const k = Math.hypot(x - c.x, y - c.y); if (k < bd) { bd = k; best = { x, y }; }
    }
    return best || c;
  }
  const [tx0, ty0] = tileOf(type, c);
  for (let r = 0; r <= 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    if (canPlace(P, type, tx0 + dx, ty0 + dy)) return centerOf(type, tx0 + dx, ty0 + dy);
  }
  return c;
}
export function startPlacing(type) {
  closeDrawer();
  ui.placing = type; ui.amove = false; ui.ghost = startSpot(type); ui.key = '';
  updatePlacebar();
}
export function cancelPlacing() { ui.placing = null; ui.ghost = null; ui.key = ''; }
export function moveGhost(wx, wy) {
  if (!ui.ghost) return;
  ui.ghost.x = clamp(wx, 0, MW * TILE); ui.ghost.y = clamp(wy, 0, MH * TILE);
}
// Il dito è sull'edificio da piazzare (con un margine): allora lo trascina invece di scorrere la mappa.
export function nearGhost(px, py) {
  if (!ui.placing || !ui.ghost) return false;
  const D = STRUCTS[ui.placing], [tx, ty] = tileOf(ui.placing, ui.ghost), m = 30;
  const x0 = (tx * TILE - cam.x) * cam.z, y0 = (ty * TILE - cam.y) * cam.z;
  return px >= x0 - m && px <= x0 + D.w * TILE * cam.z + m && py >= y0 - m && py <= y0 + D.h * TILE * cam.z + m;
}
// L'edificio fantasma si disegna dove sarebbe il puntatore: lo si porta sul punto scelto a ogni fotogramma.
export function syncGhost() {
  if (!ui.placing) { ui.ghost = null; return; }
  if (!ui.ghost) return;
  hover.x = (ui.ghost.x - cam.x) * cam.z; hover.y = (ui.ghost.y - cam.y) * cam.z; hover.in = true;
}
// Perché qui non si può costruire: la decisione resta del motore (canPlace); qui si legge il terreno per spiegarla.
function placeWhy(type, tx, ty) {
  const D = STRUCTS[type];
  if (!selUnits().some(u => u.builder)) return 'nessun geniere selezionato';
  if (S.res[P] < D.cost) return `servono ${D.cost} di gasolio`;
  if (canPlace(P, type, tx, ty)) return '';
  if (type === 'pump') return 'la pompa va su un giacimento libero ed esplorato';
  let edge = false, dark = false, busy = false, rough = false, dep = false;
  for (let y = ty; y < ty + D.h; y++) for (let x = tx; x < tx + D.w; x++) {
    if (x < 0 || y < 0 || x >= MW || y >= MH) { edge = true; continue; }
    const i = x + y * MW;
    if (!explored[i]) dark = true; else if (occ[i]) busy = true; else if (terr[i] !== GROUND && terr[i] !== DIRT) rough = true; else if (depIdx[i] >= 0) dep = true;
  }
  return edge ? 'fuori dalla mappa' : dark ? 'zona non ancora esplorata' : busy ? 'c’è già qualcosa' : rough ? 'serve terreno sgombro: niente acqua, roccia o bosco' : dep ? 'c’è un giacimento: lì va una pompa' : 'qui non si può costruire';
}
let pbKey = '', pbShown = false;
let amShown = false;
export function updatePlacebar() {
  fitMini();
  const bar = $('placebar'); if (!bar) return;
  // attacca-muovi in attesa della destinazione: il pulsante resta acceso (nella disposizione B la mappa non mostra la scritta)
  const am = layout.b && !!ui.amove;
  if (am !== amShown) { amShown = am; const b = $('btnAmove'); if (b) { b.classList.toggle('on', am); b.setAttribute('aria-pressed', am ? 'true' : 'false'); } }
  const on = layout.b && !!S && !!ui.placing && !!ui.ghost && !ui.overlay;
  if (on !== pbShown) { pbShown = on; bar.hidden = !on; document.documentElement.classList.toggle('placing', on); pbKey = ''; }
  if (!on) return;
  const D = STRUCTS[ui.placing], [tx, ty] = tileOf(ui.placing, ui.ghost);
  const why = placeWhy(ui.placing, tx, ty), key = `${ui.placing}|${why}`;
  if (key === pbKey) return;
  pbKey = key;
  $('pbInfo').innerHTML = `<b>${D.name}</b><span class="pbm">${D.w}×${D.h} · ${D.cost}</span><span class="pbw">${why ? 'Qui non si può: ' + why : 'Trascina l’edificio, poi ✓'}</span>`;
  bar.classList.toggle('bad', !!why);
  $('btnPlaceOk').setAttribute('aria-disabled', why ? 'true' : 'false');
}
function confirmPlace() {
  if (!ui.placing || !ui.ghost) return;
  const type = ui.placing, [tx, ty] = tileOf(type, ui.ghost), why = placeWhy(type, tx, ty);
  if (why) { toast(`Qui non si può: ${why}.`, 'warn'); buzz(40); return; }
  tryPlace(ui.ghost.x, ui.ghost.y);
  if (!ui.placing) { ui.ghost = null; buzz(20); }
  updatePlacebar();
}

/* ---------- riquadro della selezione e minimappa ---------- */
function initSelBox() {
  const el = $('selCount'); if (!el) return;
  const open = () => { if (layout.b && S && !ui.overlay) toggleDrawer('sel'); };
  el.addEventListener('click', open);
  el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
}
function syncSelBox() {
  const el = $('selCount'); if (!el) return;
  if (layout.b) { el.setAttribute('role', 'button'); el.tabIndex = 0; el.title = 'Dettaglio della selezione'; }
  else { el.setAttribute('role', 'status'); el.removeAttribute('tabindex'); el.removeAttribute('title'); }
}
// Minimappa ingrandita: si apre verso l'alto sopra la fila degli ordini e la barra del piazzamento, con il pulsante
// alla sua sinistra, e prende il lato più grande (fino a 232 px) che sta tra quella fila, la striscia delle risorse,
// l'obiettivo e il bordo sinistro dello schermo. Si ricalcola a ogni fotogramma (da updatePlacebar) solo se cambia.
const MM_MAX = 232, MM_GAP = 6, MM_BTN = 48;
let mmKey = '';
function fitMini() {
  const m = document.querySelector('.mm'); if (!m) return;
  if (!layout.b || !ui.miniBig) { if (mmKey) { mmKey = ''; m.style.removeProperty('--mmb'); m.style.removeProperty('--mms'); } return; }
  const vis = el => el && !el.hidden && el.getClientRects().length ? el.getBoundingClientRect() : null;
  const vh = innerHeight, right = m.getBoundingClientRect().right;
  let low = vh - 8;
  for (const r of [vis($('touchbar')), vis($('placebar'))]) if (r && r.height >= 1) low = Math.min(low, r.top);
  const bottom = low - MM_GAP;
  const fit = top => Math.floor(Math.min(MM_MAX, bottom - top, right - 8 - MM_BTN - MM_GAP));
  const rs = vis(document.querySelector('#bar .readouts'));
  let top = rs ? rs.bottom + MM_GAP : 8, side = fit(top);
  const ob = vis($('objective'));
  if (ob && ob.right > right - side - MM_BTN - MM_GAP && ob.bottom + MM_GAP > top) { top = ob.bottom + MM_GAP; side = fit(top); }
  side = Math.max(106, side);
  const key = `${Math.round(vh - bottom)}|${side}`;
  if (key === mmKey) return;
  mmKey = key;
  m.style.setProperty('--mmb', `${Math.round(vh - bottom)}px`);
  m.style.setProperty('--mms', `${side - 2}px`); // il bordo di 1 px per lato sta fuori dalla misura
}
function initMini() {
  const b = $('btnMiniBig'); if (!b) return;
  b.addEventListener('click', () => {
    ui.miniBig = !ui.miniBig;
    b.closest('.mm').classList.toggle('big', ui.miniBig);
    fitMini();
    b.innerHTML = ui.miniBig ? ICON.shrink : ICON.grow;
    b.setAttribute('aria-pressed', ui.miniBig ? 'true' : 'false');
    b.setAttribute('aria-label', ui.miniBig ? 'Rimpicciolisci la minimappa' : 'Ingrandisci la minimappa');
  });
  b.innerHTML = ICON.grow;
}

export function initDrawer() {
  for (const b of document.querySelectorAll('#tabs [data-tab]')) if (TAB_ICONS[b.dataset.tab]) b.insertAdjacentHTML('afterbegin', TAB_ICONS[b.dataset.tab]);
  $('drawClose').innerHTML = ICON.close;
  $('drawClose').addEventListener('click', closeDrawer);
  $('btnPlaceOk').innerHTML = ICON.ok; $('btnPlaceNo').innerHTML = ICON.no;
  $('btnPlaceOk').addEventListener('click', confirmPlace);
  $('btnPlaceNo').addEventListener('click', () => { cancelPlacing(); updatePlacebar(); });
  initSwipe($('drawer'));
  initLongPress($('drawBody'));
  initSelBox(); initMini();
  // Toccare una propria fabbrica (o il comando) apre Produci su quella; il laboratorio apre Ricerca.
  onSelect(es => {
    if (!layout.b || es.length !== 1) return;
    const s = es[0];
    if (s.kind !== 'struct' || s.owner !== P) return;
    if (s.type === 'factory' || s.type === 'hq') { ui.producer = s.id; openDrawer('prod'); }
    else if (s.type === 'lab') openDrawer('res');
    else return;
    keepAbove(s);
  });
  onLayout(() => {
    if (!layout.b) { ui.drawer = null; ui.ghost = null; ui.miniBig = false; const m = document.querySelector('.mm'); if (m) m.classList.remove('big'); fitMini(); }
    syncSelBox(); syncDrawer(); updatePlacebar(); ui.key = '';
    if (S) renderPanel(true);
  });
  syncSelBox(); syncDrawer();
}
