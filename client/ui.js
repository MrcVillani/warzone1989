// Pannello comandi, barra superiore, avvisi, copertina e rapporto finale.
import {
  TILE, P, B0, CHASSIS, PROPS, WEAPONS, STRUCTS, BUILD_ORDER, TECH, TECH_BY, DIFF, BUILDER,
  S, ent, newGame, dStats, designName, armorOf, enqueue, cancelQueued, startResearch, pumpRate,
  cmdStop, ftile, gridRef,
} from '../engine/index.js';
import { ui, cam, view, fxs, FACTION, PAL } from './state.js';
import { selEnts, selUnits, setSel } from './selection.js';
import { centerOn, screenToWorld, drawVehicle, hpColor } from './render.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtN = n => Math.floor(n).toLocaleString('it-IT');
const dec = n => String(n).replace('.', ',');
export const fmtTime = s => { s = Math.floor(s); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };

export function toast(text, kind) {
  const box = $('toasts'); if (!box) return;
  const d = document.createElement('div'); d.className = 'toast' + (kind ? ' ' + kind : ''); d.textContent = text;
  box.appendChild(d); while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => d.remove(), 4200);
}

/* ---------- partita ---------- */
export function startGame(diff, seed) {
  newGame(diff, seed);
  ui.sel = []; ui.groups = {}; ui.placing = null; ui.amove = false; ui.producer = 0; ui.tab = 'build';
  ui.draft = { c: 'L', p: 'W', w: 'MG' }; ui.key = '';
  fxs.parts = []; fxs.fx = []; fxs.pings = []; fxs.boxSel = null;
  cam.z = view.cw < 520 ? 0.8 : 1;
  centerOn(B0.x * TILE + 16, B0.y * TILE + 16);
}
export function togglePause() {
  if (ui.overlay) return;
  ui.paused = !ui.paused;
  $('btnPause').textContent = ui.paused ? 'Riprendi' : 'Pausa'; $('btnPause').classList.toggle('on', ui.paused);
}

/* ---------- pannello ---------- */
function producers() { return S.ents.filter(e => !e.dead && e.owner === P && e.kind === 'struct' && (e.type === 'factory' || e.type === 'hq')); }
function prodLabel(s) {
  if (s.type === 'hq') return 'Comando';
  const fs = S.ents.filter(e => !e.dead && e.owner === P && e.type === 'factory');
  return `Fabbrica ${fs.indexOf(s) + 1}`;
}
function partReady(kind, key) { const r = (kind === 'c' ? CHASSIS : kind === 'p' ? PROPS : WEAPONS)[key].req; return !r || S.tech[P][r]; }
// Il pannello si ricostruisce solo quando cambia questa chiave; le barre di avanzamento si aggiornano a parte.
function panelKey() {
  const r = Math.floor(S.res[P]);
  const k = [ui.tab, ui.placing, ui.sel.join(','), selEnts().map(e => `${e.id}:${e.built}:${e.kind === 'unit' ? e.order.t : ''}`).join(',')];
  if (ui.tab === 'build') k.push(selUnits().some(u => u.builder), S.tech[P].stRP, BUILD_ORDER.map(t => r >= STRUCTS[t].cost).join(''));
  if (ui.tab === 'prod') { const ps = producers(); k.push(ui.producer, ps.map(p => `${p.id}:${p.built >= 1}:${p.queue.length}`).join(','), JSON.stringify(S.designs), S.designs.map(d => r >= dStats(d, P).cost).join(''), r >= BUILDER.cost); }
  if (ui.tab === 'res') k.push(Object.keys(S.tech[P]).join(','), S.ents.filter(e => e.owner === P && e.type === 'lab' && !e.dead).map(l => `${l.id}:${l.built >= 1}:${l.rs ? l.rs.id : ''}`).join(','), TECH.map(t => r >= t.cost).join(''));
  if (ui.tab === 'des') k.push(JSON.stringify(ui.draft), JSON.stringify(S.designs), Object.keys(S.tech[P]).join(','));
  return k.join('|');
}
function htmlSel() {
  const es = selEnts();
  if (!es.length) return `<div class="selhead"><span class="nm">Nessuna selezione</span></div><p class="hint small" style="margin-top:6px">Trascina sulla mappa per selezionare i mezzi, oppure tocca un mezzo o un edificio.</p>`;
  if (es.length === 1) {
    const e = es[0], own = e.owner === P;
    const tag = `<span class="tag ${own ? 'p' : 'e'}">${FACTION[e.owner]}</span>`;
    const sector = `<div><span>Settore</span><span>${e.kind === 'unit' ? gridRef(ftile(e.x), ftile(e.y)) : gridRef(e.tx, e.ty)}</span></div>`;
    if (e.kind === 'unit') {
      const nm = e.builder ? 'Geniere' : designName(e.d);
      let kv = `<div><span>Corazza</span><span>${armorOf(e)}</span></div><div><span>Velocità</span><span>${Math.round(e.speed)}</span></div>`;
      if (e.builder) kv += `<div><span>Compito</span><span>${e.order.t === 'build' ? 'cantiere' : e.order.t === 'move' ? 'in marcia' : 'fermo'}</span></div>`;
      else { const W = WEAPONS[e.d.w]; kv += `<div><span>Arma</span><span>${W.short}</span></div><div><span>Gittata</span><span>${dec(W.range)}</span></div><div><span>Danno/s</span><span>${(W.dmg / W.rof).toFixed(0)}</span></div>`; }
      return `<div class="selhead"><span class="nm">${esc(nm)}</span>${tag}</div><div class="hpbar"><i data-hp="${e.id}"></i></div><div class="kv">${kv}${sector}</div>`;
    }
    const D = STRUCTS[e.type];
    let extra = '';
    if (e.built < 1) extra = `<div><span>Cantiere</span><span data-built="${e.id}">${Math.floor(e.built * 100)}%</span></div>`;
    else if (e.type === 'pump') extra = `<div><span>Resa</span><span>${dec(pumpRate(e.owner).toFixed(1))}/s</span></div>`;
    else if (e.type === 'tower') extra = `<div><span>Arma</span><span>${S.tech[e.owner].twCN ? 'Cannone' : 'MG'}</span></div>`;
    else if (e.type === 'factory' || e.type === 'hq') extra = `<div><span>Coda</span><span>${e.queue.length}/5</span></div>`;
    else if (e.type === 'lab') extra = `<div><span>Ricerca</span><span>${e.rs ? esc(TECH_BY[e.rs.id].name.split(' ')[0]) : 'libero'}</span></div>`;
    const hint = own && (e.type === 'factory' || e.type === 'hq') ? '<p class="hint small" style="margin-top:6px">Clic destro sulla mappa per il punto di raduno.</p>' : '';
    return `<div class="selhead"><span class="nm">${D.name}</span>${tag}</div><div class="hpbar"><i data-hp="${e.id}"></i></div><div class="kv"><div><span>Corazza</span><span>${D.armor}</span></div>${sector}${extra}</div>${hint}`;
  }
  const groups = new Map();
  for (const e of es) { const k = e.kind === 'struct' ? STRUCTS[e.type].name : e.builder ? 'Geniere' : designName(e.d); groups.set(k, (groups.get(k) || 0) + 1); }
  return `<div class="selhead"><span class="nm">${es.length} selezionati</span><span class="tag p">${FACTION[P]}</span></div><div class="hpbar"><i data-hp="all"></i></div><ul class="comp">${[...groups].map(([k, n]) => `<li><span>${esc(k)}</span><b>× ${n}</b></li>`).join('')}</ul>`;
}
function htmlBuild() {
  const has = selUnits().some(u => u.builder);
  let h = has ? '' : `<p class="hint">Seleziona un geniere per costruire. <button class="link" data-act="selb">Seleziona tutti i genieri</button></p>`;
  h += '<div class="list">';
  for (const t of BUILD_ORDER) {
    const D = STRUCTS[t], locked = D.req && !S.tech[P][D.req], can = has && !locked && S.res[P] >= D.cost;
    h += `<button class="item ${ui.placing === t ? 'on' : ''}" data-act="place" data-type="${t}" ${can ? '' : 'disabled'}>
      <span class="fp">${D.w}×${D.h}</span><span class="nm">${D.name}</span><span class="cost">${D.cost}</span>
      <span class="ds">${locked ? 'Richiede la ricerca ' + TECH_BY[D.req].name + '.' : D.desc}</span></button>`;
  }
  return h + '</div><p class="hint small">Scorciatoia: con un geniere selezionato, clic destro (o tocco) su un giacimento libero per avviare subito una pompa. Clic destro su un tuo edificio danneggiato per ripararlo.</p>';
}
function htmlProd() {
  const ps = producers();
  if (!ps.length) return '<p class="hint">Non hai né un comando né una fabbrica.</p>';
  let cur = ent(ui.producer);
  if (!cur || cur.dead || cur.owner !== P || !(cur.type === 'factory' || cur.type === 'hq')) cur = ps.find(p => p.type === 'factory') || ps[0];
  ui.producer = cur.id;
  let h = `<div class="chips">${ps.map(p => `<button class="chip ${p === cur ? 'on' : ''}" data-act="producer" data-id="${p.id}">${prodLabel(p)}${p.built < 1 ? ' · cantiere' : ''}</button>`).join('')}</div>`;
  if (cur.built < 1) return h + '<p class="hint">Questa fabbrica è ancora in costruzione. Mandaci un geniere per finirla.</p>';
  h += '<div class="list">';
  if (cur.type === 'hq') {
    h += `<button class="item" data-act="prodb" ${S.res[P] >= BUILDER.cost && cur.queue.length < 5 ? '' : 'disabled'}><span class="fp">G</span><span class="nm">Geniere</span><span class="cost">${BUILDER.cost}</span><span class="ds">Costruisce, ripara e mette in funzione le pompe. ${BUILDER.time} s.</span></button>`;
  } else {
    S.designs.forEach((d, i) => {
      const st = dStats(d, P);
      h += `<button class="item" data-act="prod" data-i="${i}" ${S.res[P] >= st.cost && cur.queue.length < 5 ? '' : 'disabled'}><span class="fp">${d.c}</span><span class="nm">${esc(designName(d))}</span><span class="cost">${st.cost}</span><span class="ds">${st.hp} PS · corazza ${st.armor} · ${st.time} s</span></button>`;
    });
  }
  h += `</div><div class="sec">Coda ${cur.queue.length}/5</div><div class="queue">`;
  if (!cur.queue.length) h += '<p class="hint small">Coda vuota.</p>';
  cur.queue.forEach((q, i) => {
    h += `<div class="qrow"><span>${esc(q.d ? designName(q.d) : 'Geniere')}</span><button class="x" data-act="cancel" data-id="${cur.id}" data-i="${i}" aria-label="Annulla e rimborsa">×</button><div class="prog"><i data-q="${cur.id}:${i}"></i></div></div>`;
  });
  h += '</div>';
  if (cur.type === 'factory') h += '<p class="hint small">I mezzi nascono dai progetti. Crea varianti nella scheda Progetta.</p>';
  return h;
}
function htmlRes() {
  const labs = S.ents.filter(e => !e.dead && e.owner === P && e.type === 'lab');
  const ready = labs.filter(l => l.built >= 1), free = ready.filter(l => !l.rs);
  let h = labs.length ? `<p class="hint">${ready.length} laboratori operativi, ${free.length} liberi. Ogni laboratorio porta avanti una ricerca alla volta.</p>` : '<p class="hint">Costruisci un laboratorio per avviare le ricerche.</p>';
  h += '<div class="list">';
  for (const T of TECH) {
    const done = S.tech[P][T.id], lab = labs.find(l => l.rs && l.rs.id === T.id);
    const reqOk = T.req.every(r => S.tech[P][r]);
    let st, dis = true;
    if (done) st = '<span class="st go">completata</span>';
    else if (lab) st = `<span class="st" data-rp="${lab.id}">0%</span>`;
    else if (!reqOk) st = `<span class="st">serve ${esc(T.req.map(r => TECH_BY[r].name.split(' ')[0]).join(', '))}</span>`;
    else { st = `<span class="cost">${T.cost}</span>`; dis = !(free.length && S.res[P] >= T.cost); }
    h += `<button class="item ${done ? 'done' : ''}" data-act="research" data-id="${T.id}" ${dis ? 'disabled' : ''}><span class="fp">${T.time}s</span><span class="nm">${esc(T.name)}</span>${st}<span class="ds">${esc(T.desc)}</span>${lab ? `<div class="prog"><i data-rb="${lab.id}"></i></div>` : ''}</button>`;
  }
  return h + '</div>';
}
function htmlDes() {
  const d = ui.draft, st = dStats(d, P);
  const seg = (kind, table, title) => `<div class="sec">${title}</div><div class="seg">${Object.entries(table).map(([k, v]) => {
    const ok = partReady(kind, k);
    const info = kind === 'c' ? `${v.hp} PS · ${v.cost}` : kind === 'p' ? `${Math.round(v.speed * 100)}% vel · ${v.cost}` : `gitt. ${dec(v.range)} · ${v.cost}`;
    return `<button data-act="dpart" data-k="${kind}" data-v="${k}" class="${d[kind] === k ? 'on' : ''}" ${ok ? '' : 'disabled'}><span>${v.label || v.name}</span><small>${ok ? info : 'da ricercare'}</small></button>`;
  }).join('')}</div>`;
  const exists = S.designs.some(x => x.c === d.c && x.p === d.p && x.w === d.w);
  let h = `<div class="preview"><canvas id="dprev" width="192" height="144"></canvas><div><div class="pn">${esc(designName(d))}</div><div class="pc">${st.cost} gasolio · ${st.time} s</div></div></div>`;
  h += `<div class="kv"><div><span>Punti struttura</span><span>${st.hp}</span></div><div><span>Corazza</span><span>${st.armor}</span></div><div><span>Velocità</span><span>${Math.round(st.speed)}</span></div><div><span>Danno/s</span><span>${st.dps.toFixed(0)}</span></div><div><span>Gittata</span><span>${dec(st.range)}</span></div><div><span>Acqua</span><span>${PROPS[d.p].water ? 'sì' : 'no'}</span></div></div>`;
  h += seg('c', CHASSIS, 'Telaio') + seg('p', PROPS, 'Propulsione') + seg('w', WEAPONS, 'Arma');
  h += `<button class="primary" data-act="dsave" ${exists || S.designs.length >= 8 ? 'disabled' : ''}>${exists ? 'Progetto già salvato' : S.designs.length >= 8 ? 'Massimo 8 progetti' : 'Salva il progetto'}</button>`;
  h += `<div class="sec">Progetti in produzione</div><div class="queue">${S.designs.map((x, i) => `<div class="qrow"><span>${esc(designName(x))} · ${dStats(x, P).cost}</span><button class="x" data-act="ddel" data-i="${i}" aria-label="Elimina progetto" ${S.designs.length <= 1 ? 'disabled' : ''}>×</button></div>`).join('')}</div>`;
  return h;
}
function drawPreview() {
  const c = $('dprev'); if (!c) return;
  const g = c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#4f5a37'; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(235,228,200,0.12)'; g.lineWidth = 1;
  for (let x = 0; x < c.width; x += 24) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, c.height); g.stroke(); }
  for (let y = 0; y < c.height; y += 24) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(c.width, y + 0.5); g.stroke(); }
  g.translate(c.width / 2, c.height / 2); g.scale(3.2, 3.2);
  drawVehicle(g, ui.draft, PAL[P], -0.5, -0.5 + Math.sin(performance.now() / 900) * 0.4, false, 0);
}
export function renderPanel(force) {
  if (!S) return;
  const k = panelKey();
  if (force || k !== ui.key) {
    ui.key = k;
    $('sel').innerHTML = htmlSel();
    for (const b of document.querySelectorAll('#tabs button')) b.classList.toggle('on', b.dataset.tab === ui.tab);
    $('tabbody').innerHTML = ui.tab === 'build' ? htmlBuild() : ui.tab === 'prod' ? htmlProd() : ui.tab === 'res' ? htmlRes() : htmlDes();
  }
  for (const el of document.querySelectorAll('[data-hp]')) {
    const v = el.dataset.hp; let f;
    if (v === 'all') { const es = selEnts(); f = es.reduce((a, e) => a + e.hp, 0) / Math.max(1, es.reduce((a, e) => a + e.max, 0)); }
    else { const e = ent(+v); f = e ? e.hp / e.max : 0; }
    el.style.width = (f * 100).toFixed(1) + '%'; el.style.background = hpColor(f);
  }
  for (const el of document.querySelectorAll('[data-built]')) { const e = ent(+el.dataset.built); if (e) el.textContent = Math.floor(e.built * 100) + '%'; }
  for (const el of document.querySelectorAll('[data-q]')) { const [sid, i] = el.dataset.q.split(':').map(Number); const s = ent(sid); const q = s && s.queue[i]; el.style.width = q ? (q.t / q.total * 100).toFixed(1) + '%' : '0'; }
  for (const el of document.querySelectorAll('[data-rb],[data-rp]')) { const l = ent(+(el.dataset.rb || el.dataset.rp)); const f = l && l.rs ? l.rs.t / l.rs.total : 0; if (el.dataset.rb) el.style.width = (f * 100).toFixed(1) + '%'; else el.textContent = Math.floor(f * 100) + '%'; }
  drawPreview();
}
export function updateBar() {
  if (!S) return;
  $('roRes').textContent = fmtN(S.res[P]);
  $('roPumps').textContent = S.ents.filter(e => !e.dead && e.owner === P && e.type === 'pump' && e.built >= 1).length;
  $('roUnits').textContent = S.ents.filter(e => !e.dead && e.owner === P && e.kind === 'unit').length;
  $('roTime').textContent = fmtTime(S.time);
  const c = screenToWorld(view.cw / 2, view.ch / 2); $('mmRef').textContent = 'Settore ' + gridRef(ftile(c.x), ftile(c.y));
}
export function initUI(cv) {
  $('panel').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled || !S) return;
    const a = b.dataset.act;
    if (a === 'tab') { ui.tab = b.dataset.tab; ui.placing = null; }
    else if (a === 'place') { ui.placing = ui.placing === b.dataset.type ? null : b.dataset.type; ui.amove = false; }
    else if (a === 'selb') setSel(S.ents.filter(x => x.owner === P && x.builder && !x.dead).map(x => x.id));
    else if (a === 'producer') ui.producer = +b.dataset.id;
    else if (a === 'prodb') { const s = ent(ui.producer); if (s) enqueue(s, null, P); }
    else if (a === 'prod') { const s = ent(ui.producer), d = S.designs[+b.dataset.i]; if (s && d) enqueue(s, d, P); }
    else if (a === 'cancel') cancelQueued(ent(+b.dataset.id), +b.dataset.i);
    else if (a === 'research') {
      const free = S.ents.find(l => !l.dead && l.owner === P && l.type === 'lab' && l.built >= 1 && !l.rs);
      if (!free) toast('Nessun laboratorio libero.', 'warn'); else if (!startResearch(P, free, b.dataset.id)) toast('Gasolio insufficiente per questa ricerca.', 'warn');
    }
    else if (a === 'dpart') ui.draft = Object.assign({}, ui.draft, { [b.dataset.k]: b.dataset.v });
    else if (a === 'dsave') { if (!S.designs.some(x => x.c === ui.draft.c && x.p === ui.draft.p && x.w === ui.draft.w) && S.designs.length < 8) { S.designs.push(Object.assign({}, ui.draft)); toast(`Progetto salvato: ${designName(ui.draft)}.`); } }
    else if (a === 'ddel') { if (S.designs.length > 1) S.designs.splice(+b.dataset.i, 1); }
    ui.key = ''; renderPanel(true);
  });
  $('btnPause').addEventListener('click', togglePause);
  $('btnSpeed').addEventListener('click', () => { ui.speed = ui.speed === 1 ? 2 : ui.speed === 2 ? 3 : 1; $('btnSpeed').textContent = ui.speed + '×'; });
  $('btnHelp').addEventListener('click', () => showHelp());
  $('btnMode').addEventListener('click', () => { ui.mode = ui.mode === 'pan' ? 'select' : 'pan'; $('btnMode').classList.toggle('on', ui.mode === 'pan'); cv.classList.toggle('pan', ui.mode === 'pan'); });
  $('btnAmove').addEventListener('click', () => { if (selUnits().some(u => !u.builder)) ui.amove = !ui.amove; else toast('Seleziona dei mezzi armati.', 'warn'); });
  $('btnStop').addEventListener('click', () => cmdStop(selUnits()));
  $('btnDesel').addEventListener('click', () => { setSel([]); ui.placing = null; ui.amove = false; });
}

/* ---------- copertina, aiuto, fine ---------- */
const CONTROLS = `<dl class="controls">
  <div><dt>Clic / trascina</dt><dd>seleziona mezzi ed edifici</dd></div>
  <div><dt>Clic destro</dt><dd>muovi, attacca, costruisci, ripara</dd></div>
  <div><dt>Doppio clic</dt><dd>tutti i mezzi uguali sullo schermo</dd></div>
  <div><dt>A, poi clic</dt><dd>attacca-muovi verso un punto</dd></div>
  <div><dt>S · H · P</dt><dd>ferma · torna al comando · pausa</dd></div>
  <div><dt>Ctrl+1–9 · 1–9</dt><dd>crea e richiama un gruppo</dd></div>
  <div><dt>Frecce · bordi</dt><dd>scorri la mappa (anche spazio o rotella premuta + trascina)</dd></div>
  <div><dt>Rotella</dt><dd>zoom</dd></div>
  <div><dt>Touch</dt><dd>tocca un mezzo, poi tocca la mappa per dargli un ordine. «Sposta mappa» per scorrere, due dita per lo zoom.</dd></div>
</dl>`;
const ov = () => $('overlay');
const randomSeed = () => (Math.random() * 1e9) | 0;
export function showStart() {
  const o = ov();
  ui.overlay = 'start'; ui.paused = true; o.hidden = false;
  o.innerHTML = `<div class="card" role="dialog" aria-labelledby="ovt">
    <p class="eyebrow">Ottobre 1989 · Valle del Serra · Carta operativa n. ${S.seed % 10000}</p>
    <h1 class="title" id="ovt">WARZONE <span>1989</span></h1>
    <p class="brief">Il Direttorio Ferreo si è trincerato all’altro capo della valle e punta ai giacimenti di gasolio. Al comando della Brigata Aurora metti in funzione le pompe, ricerca nuove tecnologie, progetta i tuoi mezzi e distruggi il comando e le fabbriche nemiche.</p>
    <div class="diff"><span class="lbl">Avversario</span>${Object.entries(DIFF).map(([k, v]) => `<button class="btn ${ui.diff === k ? 'on' : ''}" data-diff="${k}">${v.label}</button>`).join('')}</div>
    <div class="actions"><button class="primary" id="ovStart">Inizia l’operazione</button><button class="btn" id="ovMap">Cambia carta</button></div>
    ${CONTROLS}
  </div>`;
  o.querySelectorAll('[data-diff]').forEach(b => b.addEventListener('click', () => { ui.diff = b.dataset.diff; o.querySelectorAll('[data-diff]').forEach(x => x.classList.toggle('on', x === b)); }));
  $('ovMap').addEventListener('click', () => { startGame(ui.diff, randomSeed()); showStart(); });
  $('ovStart').addEventListener('click', () => {
    startGame(ui.diff, S.seed); closeOverlay();
    toast('Sei nel settore B2. Manda i genieri sui giacimenti vicini.');
  });
  $('ovStart').focus();
}
export function showHelp() {
  if (ui.overlay) return;
  const o = ov();
  ui.overlay = 'help'; o.hidden = false;
  o.innerHTML = `<div class="card" role="dialog" aria-labelledby="ovt"><p class="eyebrow">Manuale da campo</p><h2 class="title" id="ovt" style="font-size:40px">Comandi</h2>
  <p class="brief">Le pompe sui giacimenti producono il gasolio. Il laboratorio sblocca telai, propulsioni e armi; nella scheda Progetta li combini in un nuovo mezzo e la fabbrica lo produce. Vinci quando il nemico non ha più comando, fabbriche né genieri.</p>
  ${CONTROLS}<div class="actions"><button class="primary" id="ovClose">Torna alla partita</button></div></div>`;
  $('ovClose').addEventListener('click', closeOverlay); $('ovClose').focus();
}
export function showEnd(won) {
  const o = ov();
  ui.overlay = 'end'; o.hidden = false;
  const st = S.stats;
  o.innerHTML = `<div class="card" role="dialog" aria-labelledby="ovt" style="border-top-color:${won ? 'var(--olive)' : 'var(--brick)'}">
    <p class="eyebrow">Rapporto finale · ${fmtTime(S.time)} · ${DIFF[S.diff].label}</p>
    <h2 class="title" id="ovt">${won ? 'Valle <span>liberata</span>' : 'Brigata <span>sconfitta</span>'}</h2>
    <p class="brief">${won ? 'Il comando e le fabbriche del Direttorio Ferreo sono fuori uso. I giacimenti della valle sono tuoi.' : 'Hai perso il comando, le fabbriche e tutti i genieri. Il Direttorio Ferreo controlla la valle.'}</p>
    <div class="stats"><div><b>${st.made[P]}</b><span>Mezzi prodotti</span></div><div><b>${st.kills[P]}</b><span>Nemici distrutti</span></div><div><b>${st.lost[P]}</b><span>Perdite</span></div><div><b>${st.built[P]}</b><span>Edifici costruiti</span></div></div>
    <div class="actions"><button class="primary" id="ovAgain">Nuova operazione</button><button class="btn" id="ovLook">Guarda la mappa</button></div>
  </div>`;
  $('ovAgain').addEventListener('click', () => { startGame(ui.diff, randomSeed()); showStart(); });
  $('ovLook').addEventListener('click', () => { o.hidden = true; o.innerHTML = ''; ui.overlay = 'ended'; });
}
export function closeOverlay() {
  const o = ov(); o.hidden = true; o.innerHTML = ''; ui.overlay = null; ui.paused = false;
  $('btnPause').textContent = 'Pausa'; $('btnPause').classList.remove('on'); ui.key = '';
}
export { randomSeed };
