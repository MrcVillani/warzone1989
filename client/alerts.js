// Dove succedono le cose: pulsante «Allarme» (ultimi scontri), frecce ai bordi della mappa per gli scontri fuori
// visuale e posizione degli avvisi toccabili. Nasce tutto dagli eventi del motore («fx», «ping», «built», «toast»).
import { TILE, P, S, ent } from '../engine/index.js';
import { cam, view } from './state.js';
import { centerOn, mark } from './render.js';

const ALARM_MAX = 5, ALARM_AGE = 60;       // «Allarme»: ultimi 5 scontri negli ultimi 60 s di gioco
const MERGE = 7 * TILE;                    // due scontri più vicini di così sono lo stesso scontro
const ARROW_MAX = 3, ARROW_LIFE = 5;       // al massimo 3 frecce, spariscono dopo 5 s senza eventi
const NEAR_MINE = 9 * TILE;                // un nemico che spara così vicino a un tuo mezzo o edificio è uno scontro

let alarms = [];                           // { x, y, t } dal più recente
let arrows = [];                           // { x, y, t, el }
let cycle = { i: -1, at: 0 };              // tocchi ripetuti su «Allarme»
let enemyCheckT = -1;
let layer = null, stage = null, bar = null;
let recent = null;                         // ultima posizione nota in questo istante di gioco (ping, edificio pronto o perso)
let lastToast = null;                      // ultimo avviso con cui associare un «ping» che arriva subito dopo
let goTo = null;                           // funzione che rende toccabile un avviso (da ui.js)

export function initAlerts(makeGo) {
  goTo = makeGo;
  stage = document.getElementById('stage'); bar = document.getElementById('touchbar');
  layer = document.getElementById('arrows');
}
export function resetAlerts() {
  alarms = []; cycle = { i: -1, at: 0 }; enemyCheckT = -1; recent = null; lastToast = null;
  for (const a of arrows) a.el.remove(); arrows = [];
}
const now = () => (S ? S.time : 0);
const inView = (x, y, m = 0) => x > cam.x - m && x < cam.x + view.cw / cam.z + m && y > cam.y - m && y < cam.y + view.ch / cam.z + m;

// Uno scontro che riguarda i tuoi mezzi o edifici: aggiorna la lista dell'allarme e, fuori visuale, le frecce.
function combat(x, y) {
  if (!S || !Number.isFinite(x) || !Number.isFinite(y)) return;
  const t = now();
  const i = alarms.findIndex(a => Math.hypot(a.x - x, a.y - y) < MERGE);
  if (i >= 0) alarms.splice(i, 1);
  alarms.unshift({ x, y, t });
  if (alarms.length > ALARM_MAX) alarms.length = ALARM_MAX;
  if (inView(x, y, -TILE)) return;
  const a = arrows.find(a => Math.hypot(a.x - x, a.y - y) < MERGE * 1.5);
  if (a) { a.x = x; a.y = y; a.t = t; return; }
  if (!layer) return;
  if (arrows.length >= ARROW_MAX) { arrows.sort((p, q) => p.t - q.t); arrows.shift().el.remove(); }
  const el = document.createElement('button');
  el.className = 'edgearrow'; el.type = 'button';
  el.setAttribute('aria-label', 'Scontro fuori visuale: vai lì'); el.title = 'Scontro fuori visuale: tocca per andare lì';
  el.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h12M12 6l6 6-6 6"/></svg>';
  const arrow = { x, y, t, el };
  el.addEventListener('click', () => { centerOn(arrow.x, arrow.y); mark(arrow.x, arrow.y, '#e0564a'); dropArrow(arrow); });
  layer.appendChild(el); arrows.push(arrow);
}
function dropArrow(a) { a.el.remove(); arrows = arrows.filter(x => x !== a); }

// Eventi «fx» (gli stessi che alzano l'intensità della musica): spari dei tuoi mezzi e torri, spari nemici vicino
// alle tue cose, tuoi mezzi o edifici distrutti.
export function alertFx(e) {
  if (!S) return;
  if (e.k === 'flash') {
    if (e.owner === P) { combat(e.x, e.y); return; }
    if (S.time - enemyCheckT < 0.3) return;
    enemyCheckT = S.time;
    for (const o of S.ents) if (!o.dead && o.owner === P && Math.hypot(o.x - e.x, o.y - e.y) < NEAR_MINE) { combat(o.x, o.y); return; }
  } else if (e.k === 'boom' && e.owner === P && (e.kind === 'unit' || e.kind === 'struct')) {
    combat(e.x, e.y);
    if (e.kind === 'struct') recent = { x: e.x, y: e.y, t: S.time };
  }
}
// «ping» del motore: contatto nemico (subito dopo il suo avviso) o reparti che entrano dai bordi (subito prima).
export function alertPing(d) {
  if (!S) return;
  combat(d.x, d.y);
  if (!recent || recent.t !== S.time || !recent.ping) recent = { x: d.x, y: d.y, t: S.time, ping: true };
  if (lastToast && lastToast.t === S.time && lastToast.el.isConnected) goTo(lastToast.el, d.x, d.y);
}
export function alertBuilt(d) {
  const s = S && ent(d.id);
  if (s && s.owner === P) recent = { x: s.x, y: s.y, t: S.time };
}
// Avviso del motore appena mostrato: se c'è una posizione di questo stesso istante diventa toccabile; altrimenti
// si prova con il settore nel testo («nel settore D4»), e un «ping» che arriva subito dopo la corregge.
export function alertToast(el, d) {
  if (!S || !el) return;
  lastToast = null;
  const sector = /settore ([A-H])([1-8])/.exec(d.text || '');
  const relevant = sector || d.kind === 'bad';
  if (!relevant) return;
  if (recent && recent.t === S.time) goTo(el, recent.x, recent.y);
  else if (sector) goTo(el, ('ABCDEFGH'.indexOf(sector[1]) * 8 + 4) * TILE, ((+sector[2] - 1) * 8 + 4) * TILE);
  lastToast = { el, t: S.time };
}

// «Allarme»: porta all'ultimo scontro; toccato di nuovo entro pochi secondi, ai precedenti (e poi da capo).
export function alarmList() { const t = now(); return alarms.filter(a => t - a.t >= 0 && t - a.t <= ALARM_AGE); }
export function nextAlarm() {
  const list = alarmList(), real = performance.now();
  if (!list.length) { cycle = { i: -1, at: 0 }; return null; }
  cycle.i = real - cycle.at < 6000 && cycle.i >= 0 ? (cycle.i + 1) % list.length : 0;
  cycle.at = real;
  const a = list[cycle.i];
  centerOn(a.x, a.y); mark(a.x, a.y, '#e0564a');
  return { n: cycle.i + 1, of: list.length, age: Math.max(0, Math.round(now() - a.t)) };
}

// Frecce: sul bordo della mappa nella direzione dello scontro, sopra la barra degli ordini; via dopo 5 s senza eventi
// o quando lo scontro entra in visuale.
export function updateArrows() {
  if (!arrows.length) return;
  const t = now(), { cw, ch } = view;
  const barTop = bar && stage ? Math.max(0, stage.getBoundingClientRect().bottom - bar.getBoundingClientRect().top) : 0;
  const m = 28, x0 = m, y0 = m, x1 = cw - m, y1 = ch - Math.max(m, barTop + 26);
  for (const a of arrows.slice()) {
    const age = t - a.t;
    if (age > ARROW_LIFE || age < 0 || inView(a.x, a.y, -TILE) || !S) { dropArrow(a); continue; }
    const cx = cw / 2, cy = (y0 + y1) / 2, tx = (a.x - cam.x) * cam.z, ty = (a.y - cam.y) * cam.z;
    const dx = tx - cx, dy = ty - cy, k = Math.min(dx ? Math.abs(((dx > 0 ? x1 : x0) - cx) / dx) : 1e9, dy ? Math.abs(((dy > 0 ? y1 : y0) - cy) / dy) : 1e9);
    const px = cx + dx * k, py = cy + dy * k, ang = Math.atan2(dy, dx);
    a.el.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
    a.el.style.setProperty('--rot', `${ang.toFixed(3)}rad`);
    a.el.style.opacity = age > ARROW_LIFE - 1 ? Math.max(0.15, ARROW_LIFE - age).toFixed(2) : '1';
  }
}
export function arrowCount() { return arrows.length; }
