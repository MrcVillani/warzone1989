// Pannello comandi, barra superiore, avvisi, copertina e rapporto finale.
import {
  TILE, P, CHASSIS, PROPS, WEAPONS, STRUCTS, BUILD_ORDER, TECH, TECH_BY, DIFF, BUILDER, TIERS, TIER_GATE, FAMILIES, BUNKER_W,
  S, ent, newGame, dStats, designName, armorOf, enqueue, cancelQueued, startResearch, pumpRate,
  cmdStop, ftile, gridRef, homeOf, tierAvail, tierDone, tierCap, techBlockReason, towerWeapon, speedMul,
} from '../engine/index.js';
import { ui, cam, view, fxs, FACTION, PAL, reducedMotion } from './state.js';
import { selEnts, selUnits, setSel } from './selection.js';
import { centerOn, screenToWorld, drawVehicle, vehicleExtent, hpColor } from './render.js';
import { soundOn, setSound, getVolume, setVolume, onAudioChange, uiSfx } from './audio.js';
import { fxq, setPref } from './quality.js';
import { musicOn, setMusic, getMusicVolume, setMusicVolume, onMusicChange } from './music.js';
import { selectArmy, saveSquad, recallSquad, squadIds, LONG_MS, DBL_MS, TAP_MOVE, stopInertia, evTime } from './input.js';
import { nextAlarm, alarmList, initAlerts, resetAlerts } from './alerts.js';
import { layout } from './layout.js';
import { paneTab, toggleDrawer, openDrawer, syncDrawer, startPlacing, updatePlacebar } from './drawer.js';
import { tilesFor, paintTiles, freeBuilders } from './tiles.js';
import { mapOpts, placesOf, placesOn, setPlaces, shakeOn, setShake } from './prefs.js';
import { rankSvg } from './livery.js';
import { rankName, nickOf } from './veterans.js';
import { heroUnit } from './hero.js';

const $ = id => document.getElementById(id);
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const coarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const fmtN = n => Math.floor(n).toLocaleString('it-IT');
export const dec = n => String(n).replace('.', ',');
export const fmtTime = s => { s = Math.floor(s); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };

export function toast(text, kind) {
  const box = $('toasts'); if (!box) return null;
  const d = document.createElement('div'); d.className = 'toast' + (kind ? ' ' + kind : ''); d.textContent = text;
  box.appendChild(d); while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => d.remove(), 4200);
  return d;
}
// Avviso toccabile: un tocco (o clic, o Invio) porta la visuale sul punto dell'avviso.
export function toastGo(d, x, y) {
  d.dataset.x = Math.round(x); d.dataset.y = Math.round(y);
  if (d.classList.contains('go')) return;
  d.classList.add('go'); d.setAttribute('role', 'button'); d.tabIndex = 0; d.title = 'Tocca per andare lì';
  const go = () => { centerOn(+d.dataset.x, +d.dataset.y); stopInertia(); d.remove(); };
  d.addEventListener('click', go);
  d.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
}

/* ---------- partita ---------- */
// Schermaglia sulla mappa scelta nel menu (ricordata sul dispositivo): casuale dal seme o disegnata.
export function startGame(diff, seed) {
  newGame(diff, seed, mapOpts());
  resetClient();
}
// Dopo una partita nuova (schermaglia o missione): selezione, schede, effetti e camera da capo.
export function resetClient() {
  ui.sel = []; ui.groups = {}; ui.placing = null; ui.amove = false; ui.producer = 0; ui.tab = 'build';
  ui.draft = { c: 'L', p: 'W', w: 'MG' }; ui.key = ''; ui.resFold = {}; ui.drawer = null; ui.ghost = null;
  syncDrawer(); updatePlacebar();
  fxs.parts = []; fxs.fx = []; fxs.pings = []; fxs.boxSel = null;
  resetAlerts(); stopInertia();
  cam.z = view.cw < 520 ? 0.8 : 1;
  centerOnBase();
}
// Centra la camera sul comando e sui genieri nella parte di mappa libera sopra la barra degli ordini rapidi.
function centerOnBase() {
  const own = S.ents.filter(e => !e.dead && e.owner === P);
  const h = homeOf(P);
  let x0 = h.x * TILE + 16, x1 = x0, y0 = h.y * TILE + 16, y1 = y0;
  for (const e of own) { x0 = Math.min(x0, e.x); x1 = Math.max(x1, e.x); y0 = Math.min(y0, e.y); y1 = Math.max(y1, e.y); }
  const tb = $('touchbar'), st = $('stage');
  const barH = tb && st ? Math.max(0, st.getBoundingClientRect().bottom - tb.getBoundingClientRect().top) : 0;
  centerOn((x0 + x1) / 2, (y0 + y1) / 2 + barH / 2 / cam.z);
}
export function togglePause() {
  if (ui.overlay) return;
  ui.paused = !ui.paused;
  $('btnPause').textContent = ui.paused ? 'Riprendi' : 'Pausa'; $('btnPause').classList.toggle('on', ui.paused);
}

/* ---------- pannello ---------- */
export function producers() { return S.ents.filter(e => !e.dead && e.owner === P && e.kind === 'struct' && (e.type === 'factory' || e.type === 'hq')); }
export function prodLabel(s) {
  if (s.type === 'hq') return 'Comando';
  const fs = S.ents.filter(e => !e.dead && e.owner === P && e.type === 'factory');
  return `Fabbrica ${fs.indexOf(s) + 1}`;
}
export function partReady(kind, key) { const r = (kind === 'c' ? CHASSIS : kind === 'p' ? PROPS : WEAPONS)[key].req; return !r || S.tech[P][r]; }
// Il pannello si ricostruisce solo quando cambia questa chiave; le barre di avanzamento si aggiornano a parte.
function panelKey() {
  const r = Math.floor(S.res[P]), tab = paneTab();
  const k = [tab, layout.b ? `B${layout.v ? 'v' : ''}:${ui.drawer}` : '', ui.placing, ui.sel.join(','), selEnts().map(e => `${e.id}:${e.built}:${e.kind === 'unit' ? e.order.t + (e.d && WEAPONS[e.d.w].heal && e.tgt ? 1 : 0) + ':' + (e.rank || 0) + ':' + Math.floor(e.xp || 0) : ''}`).join(','), Object.keys(S.tech[P]).length];
  if (tab === 'build') k.push(selUnits().some(u => u.builder), layout.b ? freeBuilders().length : '', Object.keys(S.tech[P]).join(','), BUILD_ORDER.map(t => r >= STRUCTS[t].cost).join(''));
  if (tab === 'prod') { const ps = producers(); k.push(ui.producer, ps.map(p => `${p.id}:${p.built >= 1}:${p.queue.length}`).join(','), JSON.stringify(S.designs), S.designs.map(d => r >= dStats(d, P).cost).join(''), r >= BUILDER.cost); }
  if (tab === 'res') k.push(JSON.stringify(ui.resFold), Object.keys(S.tech[P]).join(','), S.ents.filter(e => e.owner === P && e.type === 'lab' && !e.dead).map(l => `${l.id}:${l.built >= 1}:${l.rs ? l.rs.id : ''}`).join(','), TECH.map(t => r >= t.cost).join(''));
  if (tab === 'des') k.push(JSON.stringify(ui.draft), JSON.stringify(S.designs), Object.keys(S.tech[P]).join(','));
  return k.join('|');
}
function htmlSel() {
  const es = selEnts();
  if (!es.length) return `<div class="selhead"><span class="nm">Nessuna selezione</span></div><p class="hint small" style="margin-top:6px">${coarse() ? 'Tocca un tuo mezzo o edificio (doppio tocco: tutti quelli uguali; tieni premuto e trascina: riquadro). Poi tocca la mappa per dare l’ordine; con un dito scorri la mappa.' : 'Clicca un tuo mezzo o edificio, oppure trascina un riquadro. Poi clicca sulla mappa per dare l’ordine.'}</p>`;
  if (es.length === 1) {
    const e = es[0], own = e.owner === P;
    const tag = `<span class="tag ${own ? 'p' : 'e'}">${FACTION[e.owner]}</span>`;
    const sector = `<div><span>Settore</span><span>${e.kind === 'unit' ? gridRef(ftile(e.x), ftile(e.y)) : gridRef(e.tx, e.ty)}</span></div>`;
    if (e.kind === 'unit') {
      const nm = e.builder ? 'Geniere' : designName(e.d);
      // corazza, velocità e danno includono le ricerche del lato (dStats con owner)
      const st = e.builder ? null : dStats(e.d, e.owner);
      let kv = `<div><span>Corazza</span><span>${armorOf(e)}</span></div><div><span>Velocità</span><span>${Math.round(st ? st.speed : e.speed * speedMul(e.owner))}</span></div>`;
      if (e.builder) kv += `<div><span>Compito</span><span>${e.order.t === 'build' ? 'cantiere' : e.order.t === 'move' ? 'in marcia' : 'fermo'}</span></div>`;
      else if (st.hps) kv += `<div><span>Ripara</span><span>${dec(st.hps)}/s</span></div><div><span>Compito</span><span>${e.tgt ? 'ripara' : 'in attesa'}</span></div>`;
      else { const W = WEAPONS[e.d.w]; kv += `<div><span>Arma</span><span>${W.short}</span></div><div><span>Gittata</span><span>${rangeTxt(W)}</span></div><div><span>Danno/s</span><span>${st.dps.toFixed(0)}</span></div>`; }
      // grado e distruzioni (i genieri non fanno carriera); per gli assi del giocatore il soprannome
      const rk = e.rank || 0, nick = nickOf(e);
      const vet = e.builder ? '' : `<div class="rkrow"><span>Grado</span><span>${rankSvg(rk, e.owner)}${esc(rankName(rk))}</span></div><div><span>Distruzioni</span><span>${Math.floor(e.xp || 0)}</span></div>`;
      const nk = nick ? `<p class="nick">«${esc(nick)}»</p>` : '';
      return `<div class="selhead"><span class="nm">${esc(nm)}</span>${tag}</div>${nk}<div class="hpbar"><i data-hp="${e.id}"></i></div><div class="kv">${vet}${kv}${sector}</div>`;
    }
    const D = STRUCTS[e.type];
    let extra = '';
    if (e.built < 1) extra = `<div><span>Cantiere</span><span data-built="${e.id}">${Math.floor(e.built * 100)}%</span></div>`;
    else if (e.type === 'pump') extra = `<div><span>Resa</span><span>${dec(pumpRate(e.owner).toFixed(1))}/s</span></div>`;
    else if (e.type === 'tower' || e.type === 'bunker') { const W = e.type === 'bunker' ? BUNKER_W : towerWeapon(e.owner); extra = `<div><span>Arma</span><span>${W.short}</span></div><div><span>Gittata</span><span>${dec(W.range)}</span></div>`; }
    else if (e.type === 'factory' || e.type === 'hq') extra = `<div><span>Coda</span><span>${e.queue.length}/5</span></div>`;
    else if (e.type === 'lab') extra = `<div><span>Ricerca</span><span>${e.rs ? esc(TECH_BY[e.rs.id].name.split(' ')[0]) : 'libero'}</span></div>`;
    const hint = own && (e.type === 'factory' || e.type === 'hq') ? '<p class="hint small" style="margin-top:6px">Clicca sulla mappa per il punto di raduno.</p>' : '';
    return `<div class="selhead"><span class="nm">${D.name}</span>${tag}</div><div class="hpbar"><i data-hp="${e.id}"></i></div><div class="kv"><div><span>Corazza</span><span>${D.armor}</span></div>${sector}${extra}</div>${hint}`;
  }
  const groups = new Map();
  // i mezzi con un grado fanno riga a sé, con il loro gallone accanto al nome
  for (const e of es) {
    const nm = e.kind === 'struct' ? STRUCTS[e.type].name : e.builder ? 'Geniere' : designName(e.d), rk = e.kind === 'unit' ? e.rank || 0 : 0, k = `${rk}|${nm}`;
    const gr = groups.get(k) || { nm, rk, o: e.owner, n: 0 }; gr.n++; groups.set(k, gr);
  }
  const tip = coarse() && es.some(e => e.kind === 'unit') ? '<p class="hint small" style="margin-top:6px">Tieni premuto 1–4 sulla mappa per salvarli in una squadra.</p>' : '';
  return `<div class="selhead"><span class="nm">${es.length} selezionati</span><span class="tag p">${FACTION[P]}</span></div><div class="hpbar"><i data-hp="all"></i></div><ul class="comp">${[...groups.values()].map(gr => `<li><span>${rankSvg(gr.rk, gr.o)}${esc(gr.nm)}</span><b>× ${gr.n}</b></li>`).join('')}</ul>${tip}`;
}
function htmlBuild() {
  const has = selUnits().some(u => u.builder);
  let h = has ? '' : `<p class="hint">Seleziona un geniere per costruire. <button class="link" data-act="selb">Seleziona tutti i genieri</button></p>`;
  h += '<div class="list">';
  for (const t of BUILD_ORDER) {
    const D = STRUCTS[t], locked = D.req && !S.tech[P][D.req], can = has && !locked && S.res[P] >= D.cost;
    let ds = D.desc;
    if (locked) { const R = TECH_BY[D.req]; ds = R.tier > tierCap(P) ? `Non disponibile in questa missione (livello max ${TIERS[tierCap(P) - 1]}).` : `Richiede la ricerca ${R.name} (livello ${TIERS[R.tier - 1]}).`; }
    else if (t === 'tower') { const W = towerWeapon(P); ds = `Difesa fissa con ${W.name.toLowerCase()}. Gittata ${dec(W.range)} caselle.`; }
    h += `<button class="item ${ui.placing === t ? 'on' : ''}" data-act="place" data-type="${t}" ${can ? '' : 'disabled'}>
      <span class="fp">${D.w}×${D.h}</span><span class="nm">${D.name}</span><span class="cost">${D.cost}</span>
      <span class="ds">${esc(ds)}</span></button>`;
  }
  return h + '</div><p class="hint small">Scorciatoia: con un geniere selezionato, clicca (o tocca) un giacimento libero per avviare subito una pompa, o un tuo edificio danneggiato per ripararlo.</p>';
}
// Fabbrica (o comando) mostrata in Produzione: quella scelta, altrimenti la prima fabbrica, altrimenti il comando.
export function curProducer(ps = producers()) {
  let cur = ent(ui.producer);
  if (!cur || cur.dead || cur.owner !== P || !(cur.type === 'factory' || cur.type === 'hq')) cur = ps.find(p => p.type === 'factory') || ps[0];
  ui.producer = cur.id;
  return cur;
}
function htmlProd() {
  const ps = producers();
  if (!ps.length) return '<p class="hint">Non hai né un comando né una fabbrica.</p>';
  const cur = curProducer(ps);
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
// Gittata come testo; per le armi a tiro indiretto anche la distanza minima («2,5–9»).
export const rangeTxt = W => (W.minRange ? dec(W.minRange) + '–' : '') + dec(W.range);
// Un livello è aperto per default se è sbloccato e non tutto completato; il giocatore può aprirlo o chiuderlo.
export function tierOpen(t) {
  if (t > tierCap(P)) return false; // oltre il livello massimo della missione: sempre chiuso
  if (ui.resFold && ui.resFold[t] != null) return ui.resFold[t];
  return tierAvail(P, t) && TECH.some(T => T.tier === t && !S.tech[P][T.id]);
}
function htmlRes() {
  const labs = S.ents.filter(e => !e.dead && e.owner === P && e.type === 'lab');
  const ready = labs.filter(l => l.built >= 1), free = ready.filter(l => !l.rs);
  let h = labs.length ? `<p class="hint">${ready.length} laboratori operativi, ${free.length} liberi. Ogni laboratorio porta avanti una ricerca alla volta.</p>` : '<p class="hint">Costruisci un laboratorio per avviare le ricerche.</p>';
  h += `<p class="hint small">Ogni livello si apre con ${TIER_GATE} ricerche completate del livello precedente.</p>`;
  for (let t = 1; t <= TIERS.length; t++) {
    const list = TECH.filter(T => T.tier === t); if (!list.length) continue;
    const avail = tierAvail(P, t), open = tierOpen(t), done = tierDone(P, t), capped = t > tierCap(P);
    const state = capped ? `Non disponibile in questa missione (livello max ${TIERS[tierCap(P) - 1]})${done ? ` · ${done} già completate` : ''}`
      : avail ? `aperto · ${done}/${list.length} completate` : `Servono ${TIER_GATE} ricerche di livello ${TIERS[t - 2]} (${Math.min(tierDone(P, t - 1), TIER_GATE)}/${TIER_GATE})`;
    h += `<button class="tierh ${avail ? '' : 'locked'} ${capped ? 'capped' : ''} ${open ? 'open' : ''}" data-act="tier" data-t="${t}" aria-expanded="${open}" ${capped ? 'aria-disabled="true"' : ''}><span class="tn">Livello ${TIERS[t - 1]}</span><span class="ts">${state}</span><span class="chev" aria-hidden="true"></span></button>`;
    if (!open) continue;
    h += '<div class="list">';
    for (const T of list) {
      const isDone = S.tech[P][T.id], lab = labs.find(l => l.rs && l.rs.id === T.id);
      let st, cls = '', dis = true;
      if (isDone) { st = 'Completata'; cls = 'go'; }
      else if (lab) { st = `In corso · <span data-rp="${lab.id}">0%</span>`; cls = 'run'; }
      else {
        const why = techBlockReason(P, T.id);
        if (why) { st = esc(avail ? why : T.req.filter(r => !S.tech[P][r]).length ? `Bloccata · serve ${T.req.filter(r => !S.tech[P][r]).map(r => TECH_BY[r].name).join(', ')}` : 'Bloccata · livello chiuso'); cls = 'no'; }
        else {
          dis = !(free.length && S.res[P] >= T.cost); cls = dis ? 'wait' : 'ok';
          st = !ready.length ? 'Disponibile · serve un laboratorio' : !free.length ? 'Disponibile · laboratori occupati' : S.res[P] < T.cost ? 'Disponibile · gasolio insufficiente' : 'Disponibile';
        }
      }
      h += `<button class="item rsch ${isDone ? 'done' : ''}" data-act="research" data-id="${T.id}" ${dis ? 'disabled' : ''}><span class="fp">${T.time}s</span><span class="nm">${esc(T.name)}</span><span class="cost">${T.cost}</span><span class="ds">${esc(T.desc)}</span><span class="stl ${cls}">${st}</span>${lab ? `<div class="prog"><i data-rb="${lab.id}"></i></div>` : ''}</button>`;
    }
    h += '</div>';
  }
  return h;
}
function htmlDes() {
  const d = ui.draft, st = dStats(d, P), W = WEAPONS[d.w];
  // parti ordinate per livello; quelle da ricercare sono spente e mostrano il livello
  const seg = (kind, table, title) => `<div class="sec">${title}</div><div class="seg">${Object.entries(table).sort((a, b) => a[1].tier - b[1].tier).map(([k, v]) => {
    const ok = partReady(kind, k), out = !ok && v.tier > tierCap(P), miss = out ? 'non in missione' : 'da ricercare';
    const info = kind === 'c' ? `${v.hp} PS · ${v.cost}` : kind === 'p' ? `${Math.round(v.speed * 100)}% vel · ${v.cost}` : v.heal ? `ripara ${dec(v.heal)}/s · ${v.cost}` : `gitt. ${rangeTxt(v)} · ${v.cost}`;
    return `<button data-act="dpart" data-k="${kind}" data-v="${k}" class="${d[kind] === k ? 'on' : ''}" ${ok ? '' : 'disabled'} title="${esc(v.name)}${ok ? '' : ' · livello ' + TIERS[v.tier - 1] + ', ' + miss}"><span>${esc(v.label || v.name)}</span><small><b class="tr">${TIERS[v.tier - 1]}</b> ${ok ? info : miss}</small></button>`;
  }).join('')}</div>`;
  const exists = S.designs.some(x => x.c === d.c && x.p === d.p && x.w === d.w);
  let h = `<div class="preview"><canvas id="dprev" width="192" height="144"></canvas><div><div class="pn">${esc(designName(d))}</div><div class="pc">${st.cost} gasolio · ${st.time} s</div></div></div>`;
  const fire = st.hps ? `<div><span>Ripara</span><span>${dec(st.hps)}/s</span></div>` : `<div><span>Danno/s</span><span>${st.dps.toFixed(0)}</span></div><div><span>Gittata</span><span>${rangeTxt(W)}</span></div>`;
  h += `<div class="kv"><div><span>Punti struttura</span><span>${st.hp}</span></div><div><span>Corazza</span><span>${st.armor}</span></div><div><span>Velocità</span><span>${Math.round(st.speed)}</span></div>${fire}<div><span>Acqua</span><span>${PROPS[d.p].water ? 'sì' : 'no'}</span></div><div><span>Tipo</span><span>${FAMILIES[W.family] || '—'}</span></div></div>`;
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
  // il mezzo si inquadra con la canna: i telai grandi e le canne lunghe si rimpiccioliscono e si spostano indietro
  const ex = vehicleExtent(ui.draft), half = (ex.back + ex.front) / 2 + 2, sc = Math.min(3.2 * c.width / 192, 74 * c.width / 192 / half), A = -0.5, mid = (ex.front - ex.back) / 2;
  g.translate(c.width / 2 - Math.cos(A) * mid * sc, c.height / 2 - Math.sin(A) * mid * sc); g.scale(sc, sc);
  drawVehicle(g, ui.draft, PAL[P], A, A + Math.sin(performance.now() / 900) * 0.3, false, 0);
}
// Disposizione B: dal dettaglio della selezione si va dritti alla scheda che serve.
function selActions() {
  const es = selEnts(), own = es.filter(e => e.owner === P);
  const go = (t, l) => `<button class="btn" data-act="go" data-tab="${t}">${l}</button>`;
  let h = '';
  if (own.length === 1 && own[0].kind === 'struct' && (own[0].type === 'factory' || own[0].type === 'hq')) h = go('prod', 'Produci qui');
  else if (own.length === 1 && own[0].type === 'lab') h = go('res', 'Ricerca');
  else if (own.some(e => e.builder)) h = go('build', 'Costruisci');
  return h ? `<div class="sacts">${h}</div>` : '';
}
export function renderPanel(force) {
  if (!S) return;
  const k = panelKey();
  if (force || k !== ui.key) {
    ui.key = k;
    $('sel').innerHTML = htmlSel() + (layout.b ? selActions() : '');
    if (layout.b) { syncDrawer(); $('tabbody').innerHTML = tilesFor(paneTab()); paintTiles($('tabbody')); }
    else {
      for (const b of document.querySelectorAll('#tabs button')) b.classList.toggle('on', b.dataset.tab === ui.tab);
      $('tabbody').innerHTML = ui.tab === 'build' ? htmlBuild() : ui.tab === 'prod' ? htmlProd() : ui.tab === 'res' ? htmlRes() : htmlDes();
    }
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
  if (layout.b) $('drawRes').textContent = fmtN(S.res[P]);
  $('roPumps').textContent = S.ents.filter(e => !e.dead && e.owner === P && e.type === 'pump' && e.built >= 1).length;
  $('roUnits').textContent = S.ents.filter(e => !e.dead && e.owner === P && e.kind === 'unit').length;
  $('roTime').textContent = fmtTime(S.time);
  const c = screenToWorld(view.cw / 2, view.ch / 2); $('mmRef').textContent = 'Settore ' + gridRef(ftile(c.x), ftile(c.y));
  for (const b of document.querySelectorAll('[data-squad]')) {
    const k = b.dataset.squad, n = squadIds(k).length, el = b.querySelector('small');
    const txt = n ? String(n) : '–'; if (el.textContent !== txt) el.textContent = txt;
    b.classList.toggle('has', n > 0);
    b.setAttribute('aria-label', `Squadra ${k}: ${n ? n + (n === 1 ? ' mezzo' : ' mezzi') : 'vuota'}`);
  }
  syncHero();
  const al = alarmList(), ab = $('btnAlarm');
  if (ab) {
    const fresh = al.length && S.time - al[0].t < 6;
    ab.classList.toggle('hot', !!fresh);
    const bd = ab.querySelector('.bdg'); const txt = al.length ? String(al.length) : '';
    if (bd.textContent !== txt) bd.textContent = txt;
  }
}
// Pulsante della Macchina di Villo sulla striscia degli ordini (solo in missione): un tocco la seleziona e porta lì la
// visuale (su computer anche il tasto V). Quando è dal carrozziere il pulsante mostra il conto alla rovescia.
function syncHero() {
  const b = $('btnHero'); if (!b) return;
  const h = S.hero;
  if (!h) { if (!b.hidden) b.hidden = true; return; }
  if (b.hidden) b.hidden = false;
  const left = h.down && h.backAt != null ? Math.max(0, Math.ceil(h.backAt - S.time)) : 0, down = !!h.down;
  const txt = down ? fmtTime(left).replace(/^0/, '') : 'Villo', el = b.querySelector('span');
  if (el.textContent !== txt) el.textContent = txt;
  b.classList.toggle('down', down);
  const lab = down ? `Macchina di Villo: dal carrozziere, torna tra ${left} secondi` : 'Macchina di Villo: seleziona e porta lì la visuale';
  if (b.getAttribute('aria-label') !== lab) b.setAttribute('aria-label', lab);
}
export function selectHero() {
  if (!S || !S.hero) return;
  const u = heroUnit();
  if (!u) { toast('La Macchina di Villo è dal carrozziere.', 'warn'); return; }
  setSel([u.id]); ui.placing = null; ui.amove = false; centerOn(u.x, u.y); stopInertia();
}
// Contatore dei mezzi selezionati sulla barra della mappa (a ogni fotogramma: costa poco e risponde subito).
// Nella disposizione B è il riquadro della selezione: numero, salute media (barra) e, per un edificio, il nome.
let selShown = '';
export function updateSelCount() {
  if (!S) return;
  const es = layout.b ? selEnts() : null, n = selUnits().length, key = layout.b ? `B${n}:${es.length}:${es.length === 1 ? es[0].id : ''}` : String(n);
  if (key === selShown) return;
  selShown = key; const el = $('selCount'); if (!el) return;
  if (!layout.b) {
    el.querySelector('b').textContent = n; el.querySelector('small').textContent = 'sel.'; el.classList.toggle('zero', !n);
    el.setAttribute('aria-label', n === 1 ? '1 mezzo selezionato' : `${n} mezzi selezionati`);
    return;
  }
  const one = !n && es.length === 1 ? es[0] : null;
  const what = n ? (n === 1 ? 'mezzo' : 'mezzi') : one ? (one.kind === 'struct' ? STRUCTS[one.type].name : one.builder ? 'Geniere' : designName(one.d)) : es.length ? 'selezionati' : 'mezzi';
  el.querySelector('b').textContent = n || es.length; el.querySelector('small').textContent = what; el.classList.toggle('zero', !n && !es.length);
  el.setAttribute('aria-label', `${n || es.length} ${what}${one && one.owner !== P ? ' (nemico)' : ''}: tocca per il dettaglio`);
}
// Sfumatura sul lato da cui la barra degli ordini continua (quando non ci sta tutta).
function syncBarFade() {
  const tb = $('touchbar'); if (!tb) return;
  const l = tb.scrollLeft > 2, r = tb.scrollLeft + tb.clientWidth < tb.scrollWidth - 2;
  tb.classList.toggle('more-l', l); tb.classList.toggle('more-r', r);
}
// Pulsanti delle squadre: tocco (o clic) = selezionala; doppio tocco = selezionala e porta lì la visuale;
// tocco lungo = salva la selezione. Un trascinamento (per scorrere la barra) annulla.
function initSquads() {
  let lastK = null, lastT = 0;
  for (const b of document.querySelectorAll('[data-squad]')) {
    const k = b.dataset.squad; let p = null;
    const cancel = () => { if (p) clearTimeout(p.timer); p = null; };
    b.addEventListener('contextmenu', e => e.preventDefault());
    b.addEventListener('pointerdown', e => {
      if (!S || ui.overlay || (e.pointerType === 'mouse' && e.button !== 0)) return;
      cancel();
      const q = { x: e.clientX, y: e.clientY, long: false };
      q.timer = setTimeout(() => { if (p !== q) return; q.long = true; saveSquad(k); updateBar(); }, LONG_MS);
      p = q;
    });
    b.addEventListener('pointermove', e => { if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > TAP_MOVE) cancel(); });
    b.addEventListener('pointerup', e => {
      if (!p) return;
      const q = p; cancel(); if (q.long) return;
      // istante dell'evento (non della gestione): con i fotogrammi lenti il doppio tocco non si perde
      const now = evTime(e), dbl = lastK === k && now - lastT < DBL_MS;
      lastK = dbl ? null : k; lastT = now;
      recallSquad(k, dbl); ui.key = ''; renderPanel(true); updateSelCount();
    });
    b.addEventListener('pointercancel', cancel);
    b.addEventListener('pointerleave', cancel);
    // da tastiera (Invio o spazio sul pulsante): seleziona
    b.addEventListener('click', e => { if (e.detail === 0 && S) { recallSquad(k, false); updateSelCount(); } });
  }
}
export function initUI(cv) {
  $('panel').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled || !S) return;
    const a = b.dataset.act;
    if (a === 'tab' && layout.b) { ui.placing = null; toggleDrawer(b.dataset.tab); return; }
    if (a === 'go') { openDrawer(b.dataset.tab); return; }
    if (a === 'place' && layout.b) { startPlacing(b.dataset.type); return; }
    if (a === 'tab') { ui.tab = b.dataset.tab; ui.placing = null; }
    else if (a === 'place') { ui.placing = ui.placing === b.dataset.type ? null : b.dataset.type; ui.amove = false; }
    else if (a === 'selfree') { const f = freeBuilders(); setSel((f.length ? f : S.ents.filter(x => x.owner === P && x.builder && !x.dead)).map(x => x.id)); }
    else if (a === 'selb') setSel(S.ents.filter(x => x.owner === P && x.builder && !x.dead).map(x => x.id));
    else if (a === 'producer') ui.producer = +b.dataset.id;
    else if (a === 'prodb') { const s = ent(ui.producer); if (s) enqueue(s, null, P); }
    else if (a === 'prod') { const s = ent(ui.producer), d = S.designs[+b.dataset.i]; if (s && d) enqueue(s, d, P); }
    else if (a === 'cancel') cancelQueued(ent(+b.dataset.id), +b.dataset.i);
    else if (a === 'research') {
      const free = S.ents.find(l => !l.dead && l.owner === P && l.type === 'lab' && l.built >= 1 && !l.rs);
      if (!free) toast('Nessun laboratorio libero.', 'warn'); else if (!startResearch(P, free, b.dataset.id)) toast('Gasolio insufficiente per questa ricerca.', 'warn');
    }
    else if (a === 'tier') { const t = +b.dataset.t; if (t > tierCap(P)) { toast(`Livello ${TIERS[t - 1]} non disponibile in questa missione.`, 'warn'); return; } ui.resFold = Object.assign({}, ui.resFold, { [t]: !tierOpen(t) }); }
    else if (a === 'dpart') ui.draft = Object.assign({}, ui.draft, { [b.dataset.k]: b.dataset.v });
    else if (a === 'dsave') { if (!S.designs.some(x => x.c === ui.draft.c && x.p === ui.draft.p && x.w === ui.draft.w) && S.designs.length < 8) { S.designs.push(Object.assign({}, ui.draft)); toast(`Progetto salvato: ${designName(ui.draft)}.`); } }
    else if (a === 'ddel') { if (S.designs.length > 1) S.designs.splice(+b.dataset.i, 1); }
    ui.key = ''; renderPanel(true);
  });
  $('btnPause').addEventListener('click', togglePause);
  $('btnSpeed').addEventListener('click', () => { ui.speed = ui.speed === 1 ? 2 : ui.speed === 2 ? 3 : 1; $('btnSpeed').textContent = ui.speed + '×'; });
  $('btnHelp').addEventListener('click', () => showHelp());
  $('btnAlarm').addEventListener('click', () => {
    if (!S) return;
    const r = nextAlarm(); stopInertia();
    if (!r) toast('Nessuno scontro negli ultimi 60 secondi.');
    else $('btnAlarm').title = `Scontro ${r.n} di ${r.of} (${r.age} s fa): tocca di nuovo per il precedente`;
  });
  initSquads();
  initAlerts(toastGo);
  $('touchbar').addEventListener('scroll', syncBarFade, { passive: true });
  new ResizeObserver(syncBarFade).observe($('touchbar')); syncBarFade();
  $('btnAmove').addEventListener('click', () => { if (selUnits().some(u => !u.builder)) ui.amove = !ui.amove; else toast('Seleziona dei mezzi armati.', 'warn'); });
  $('btnStop').addEventListener('click', () => cmdStop(selUnits()));
  $('btnDesel').addEventListener('click', () => { setSel([]); ui.placing = null; ui.amove = false; });
  $('btnArmy').addEventListener('click', () => { if (S) selectArmy(); });
  $('btnHero').addEventListener('click', selectHero);
  $('btnSound').addEventListener('click', () => setSound(!soundOn()));
  onAudioChange(syncSound); syncSound();
  onAudioChange(syncMusic); onMusicChange(syncMusic);
  // clic dell'interfaccia su ogni pulsante
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('button'); if (b && !b.disabled) uiSfx('click'); });
}
function syncSound() {
  const b = $('btnSound'), on = soundOn();
  b.classList.toggle('off', !on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
  b.title = on ? 'Suono acceso: tocca per spegnere' : 'Suono spento: tocca per accendere';
  const sw = $('ovSound'); if (sw) { sw.textContent = on ? 'Acceso' : 'Spento'; sw.classList.toggle('on', on); sw.setAttribute('aria-pressed', on ? 'true' : 'false'); }
  const v = $('ovVol'); if (v) { v.value = Math.round(getVolume() * 100); v.disabled = !on; }
  const vv = $('ovVolV'); if (vv) vv.textContent = Math.round(getVolume() * 100) + '%';
}

// Musica: accesa o spenta e volume proprio, sotto il volume principale (con il suono spento non si sente).
function syncMusic() {
  const on = musicOn(), sw = $('ovMusic'); if (!sw) return;
  sw.textContent = on ? 'Accesa' : 'Spenta'; sw.classList.toggle('on', on); sw.setAttribute('aria-pressed', on ? 'true' : 'false');
  const v = $('ovMVol'); if (v) { v.value = Math.round(getMusicVolume() * 100); v.disabled = !on || !soundOn(); }
  const vv = $('ovMVolV'); if (vv) vv.textContent = Math.round(getMusicVolume() * 100) + '%';
}

// Qualità della grafica: automatica (si adatta al dispositivo) o fissa su uno dei quattro livelli.
const FX_OPTS = [['auto', 'Automatici'], ['alta', 'Alti'], ['media', 'Medi'], ['bassa', 'Bassi'], ['minima', 'Minimi']];
function syncFx() {
  document.querySelectorAll('[data-fx]').forEach(b => { const on = b.dataset.fx === fxq.pref; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
  const v = $('ovFxV'); if (v) v.textContent = fxq.pref === 'auto' ? `ora ${fxq.q.name}` : '';
}

/* ---------- aiuto e schermate ----------
   Menu, campagna, briefing e rapporti sono in screens.js; qui i comandi e la chiusura delle schermate. */
export const CONTROLS = `<p class="sec ctlh">Mouse e tastiera</p><dl class="controls">
  <div><dt>Clic su un tuo mezzo</dt><dd>lo seleziona (anche un edificio); trascina per un riquadro</dd></div>
  <div><dt>Clic sulla mappa</dt><dd>con mezzi selezionati: muovi, attacca, costruisci, ripara (anche clic destro)</dd></div>
  <div><dt>Fabbrica + clic</dt><dd>con una fabbrica o il comando selezionati: punto di raduno</dd></div>
  <div><dt>Esc</dt><dd>deseleziona (anche il pulsante «Nessuno» sulla mappa)</dd></div>
  <div><dt>«Esercito»</dt><dd>il pulsante sulla mappa seleziona tutti i tuoi mezzi armati</dd></div>
  <div><dt>Doppio clic</dt><dd>tutti i mezzi uguali sullo schermo</dd></div>
  <div><dt>A, poi clic</dt><dd>attacca-muovi verso un punto</dd></div>
  <div><dt>S · H · P</dt><dd>ferma · torna al comando · pausa</dd></div>
  <div><dt>V</dt><dd>in missione: seleziona la Macchina di Villo e porta lì la visuale (anche il pulsante «Villo» sulla mappa)</dd></div>
  <div><dt>Ctrl+1–9 · 1–9</dt><dd>salva e richiama una squadra (le 1–4 anche dai pulsanti sulla mappa)</dd></div>
  <div><dt>Frecce · bordi</dt><dd>scorri la mappa (anche spazio o rotella premuta + trascina)</dd></div>
  <div><dt>Rotella</dt><dd>zoom</dd></div>
  <div><dt>Minimappa</dt><dd>clic: visuale lì · clic destro: manda lì i mezzi selezionati</dd></div>
</dl>
<p class="sec ctlh">Touch</p><dl class="controls">
  <div><dt>Un dito</dt><dd>scorre la mappa, che continua a scivolare e rallenta; un tocco la ferma</dd></div>
  <div><dt>Due dita</dt><dd>zoom</dd></div>
  <div><dt>Tocco</dt><dd>su un tuo mezzo (anche un po’ fuori) o edificio lo seleziona; sulla mappa dà l’ordine ai mezzi selezionati</dd></div>
  <div><dt>Doppio tocco</dt><dd>su un mezzo: tutti quelli dello stesso tipo sullo schermo</dd></div>
  <div><dt>Tieni premuto</dt><dd>e trascina: riquadro di selezione (vicino ai bordi la mappa scorre). Senza trascinare: su un mezzo tutti quelli uguali; sul terreno, con mezzi selezionati, attacca-muovi lì</dd></div>
  <div><dt>Squadre 1–4</dt><dd>tieni premuto: salva la selezione · tocco: selezionala · doppio tocco: vai lì</dd></div>
  <div><dt>Avvisi · «Allarme»</dt><dd>tocca un avviso per andare lì; «Allarme» porta all’ultimo scontro, toccato di nuovo ai precedenti; le frecce ai bordi indicano scontri fuori visuale</dd></div>
  <div><dt>Minimappa</dt><dd>tocco: visuale lì · tieni premuto con mezzi selezionati: mandali lì</dd></div>
</dl>`;
// Disposizione B (telefono): barra delle schede, cassetto e piazzamento con conferma.
const CONTROLS_B = `<p class="sec ctlh">Barra e cassetto</p><dl class="controls">
  <div><dt>Schede</dt><dd>Costruisci, Produci, Ricerca, Progetta e Menu aprono il cassetto; toccale di nuovo, tocca ✕ o scorri il cassetto verso il bordo per chiuderlo. La mappa resta giocabile</dd></div>
  <div><dt>Edifici</dt><dd>tocca una tessera di Costruisci, trascina l’edificio con un dito (o tocca il punto), poi ✓; ✕ annulla</dd></div>
  <div><dt>Produci</dt><dd>tocco: un mezzo in coda · tieni premuto: cinque · tocco sulla coda: toglilo e riprendi il gasolio</dd></div>
  <div><dt>Selezione</dt><dd>il riquadro in basso a sinistra apre il dettaglio; toccare una tua fabbrica apre Produci, il laboratorio Ricerca</dd></div>
</dl>`;
// Crediti delle mappe disegnate, in fondo al manuale.
const CREDITS = `<p class="sec ctlh">Mappe</p><dl class="controls">
  <div><dt>Latina</dt><dd>ispirata alla geografia della città; disegnata a mano</dd></div>
</dl>`;
// Scossa dello schermo sulle esplosioni grandi: accesa o spenta (ricordata sul dispositivo). Con «riduci movimento» del
// sistema e con la grafica minima non c'è comunque: lo dice la nota accanto.
function syncShake() {
  const b = $('ovShake'), on = shakeOn(); if (!b) return;
  b.textContent = on ? 'Accesa' : 'Spenta'; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
  const n = $('ovShakeN'); if (n) n.textContent = reducedMotion() ? 'spenta da «riduci movimento»' : on && fxq.q.name === 'minima' ? 'spenta con la grafica minima' : '';
}
// Nomi dei luoghi sulla mappa disegnata: acceso o spento (ricordato sul dispositivo).
function syncPlaces() {
  const b = $('ovPlaces'), on = placesOn(); if (!b) return;
  b.textContent = on ? 'Visibili' : 'Nascosti'; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
}
export const ov = () => $('overlay');
export const randomSeed = () => (Math.random() * 1e9) | 0;
// Manuale da campo con le impostazioni di suono, musica ed effetti. back: cosa fare alla chiusura (dal menu si torna al menu;
// in partita si torna alla partita).
let helpBack = null;
export function showHelp(back) {
  if (ui.overlay && !back) return;
  const o = ov();
  helpBack = back || null;
  ui.overlay = 'help'; ui.paused = true; o.hidden = false;
  const goal = S && S.objective ? `In questa missione: ${esc(S.objective.text)}.` : 'Vinci quando il nemico non ha più comando, fabbriche né genieri.';
  o.innerHTML = `<div class="card" role="dialog" aria-labelledby="ovt"><p class="eyebrow">Manuale da campo</p><h2 class="title" id="ovt" style="font-size:40px">Comandi</h2>
  <p class="brief">Le pompe sui giacimenti producono il gasolio. Il laboratorio sblocca telai, propulsioni e armi; nella scheda Progetta li combini in un nuovo mezzo e la fabbrica lo produce. ${back ? 'In schermaglia vinci quando il nemico non ha più comando, fabbriche né genieri; in campagna ogni missione ha il suo obiettivo.' : goal}</p>
  <div class="audioset"><span class="lbl">Suono</span><button class="btn" id="ovSound" aria-pressed="true">Acceso</button>
    <label for="ovVol">Volume</label><input type="range" id="ovVol" min="0" max="100" step="5"><output id="ovVolV">60%</output></div>
  <div class="audioset"><span class="lbl">Musica</span><button class="btn" id="ovMusic" aria-pressed="true">Accesa</button>
    <label for="ovMVol">Volume</label><input type="range" id="ovMVol" min="0" max="100" step="5" aria-label="Volume della musica"><output id="ovMVolV">50%</output></div>
  <div class="audioset" role="group" aria-label="Qualità degli effetti"><span class="lbl">Effetti</span>${FX_OPTS.map(([k, l]) => `<button class="btn" data-fx="${k}">${l}</button>`).join('')}<output id="ovFxV"></output></div>
  <div class="audioset"><span class="lbl">Scossa</span><button class="btn" id="ovShake" aria-pressed="true">Accesa</button><span id="ovShakeN"></span></div>
  ${placesOf(S && S.map) ? '<div class="audioset"><span class="lbl">Luoghi</span><button class="btn" id="ovPlaces" aria-pressed="true">Visibili</button><span>nomi sulla mappa, da vicino</span></div>' : ''}
  ${CONTROLS}${layout.b ? CONTROLS_B : ''}${CREDITS}<div class="actions"><button class="primary" id="ovClose">${back ? 'Torna al menu' : 'Torna alla partita'}</button></div></div>`;
  $('ovSound').addEventListener('click', () => setSound(!soundOn()));
  $('ovVol').addEventListener('input', e => setVolume(e.target.value / 100));
  syncSound();
  $('ovMusic').addEventListener('click', () => setMusic(!musicOn()));
  $('ovMVol').addEventListener('input', e => setMusicVolume(e.target.value / 100));
  syncMusic();
  o.querySelectorAll('[data-fx]').forEach(b => b.addEventListener('click', () => { setPref(b.dataset.fx); syncFx(); syncShake(); }));
  syncFx();
  $('ovShake').addEventListener('click', () => { setShake(!shakeOn()); syncShake(); });
  syncShake();
  const pl = $('ovPlaces');
  if (pl) { pl.addEventListener('click', () => { setPlaces(!placesOn()); syncPlaces(); }); syncPlaces(); }
  $('ovClose').addEventListener('click', closeHelp); $('ovClose').focus();
}
export function closeHelp() { const b = helpBack; helpBack = null; if (b) b(); else closeOverlay(); }
export function closeOverlay() {
  const o = ov(); o.hidden = true; o.innerHTML = ''; ui.overlay = null; ui.paused = false;
  $('btnPause').textContent = 'Pausa'; $('btnPause').classList.remove('on'); ui.key = '';
}
