// Contenuto del cassetto nella disposizione B (telefono e schermi bassi): tessere grandi al posto delle righe del
// pannello del computer. Stessi pulsanti (data-act) e stesse regole del motore: cambia solo come si presentano.
import {
  P, CHASSIS, PROPS, WEAPONS, STRUCTS, BUILD_ORDER, TECH, TECH_BY, BUILDER, TIERS, TIER_GATE, FAMILIES,
  S, dStats, designName, tierAvail, tierDone, tierCap, techBlockReason, towerWeapon,
} from '../engine/index.js';
import { ui, PAL } from './state.js';
import { selUnits } from './selection.js';
import { drawVehicle, vehicleExtent } from './render.js';
import { structArt, BUILDER_ART } from './icons.js';
import { esc, dec, producers, prodLabel, partReady, rangeTxt, tierOpen, curProducer } from './ui.js';

const sameD = (a, b) => a && b && a.c === b.c && a.p === b.p && a.w === b.w;
const veh = d => `<canvas class="vc" width="128" height="80" data-veh="${d.c},${d.p},${d.w}"></canvas>`;
// Genieri senza un cantiere da seguire: sono quelli che «Seleziona i genieri liberi» prende.
export const freeBuilders = () => S.ents.filter(e => !e.dead && e.owner === P && e.builder && e.order.t !== 'build');

/* ---------- Costruisci ---------- */
export function tilesBuild() {
  const has = selUnits().some(u => u.builder);
  let h = '';
  if (!has) {
    const all = S.ents.filter(e => !e.dead && e.owner === P && e.builder), free = freeBuilders();
    const lbl = free.length ? `Seleziona i genieri liberi (${free.length})` : all.length ? 'Seleziona i genieri (tutti al lavoro)' : 'Nessun geniere: addestralo dal comando';
    h += `<div class="nobld"><p class="hint">Per costruire serve un geniere selezionato.</p><button class="primary wide" data-act="selfree" ${all.length ? '' : 'disabled'}>${lbl}</button></div>`;
  }
  h += '<div class="tiles t3">';
  for (const t of BUILD_ORDER) {
    const D = STRUCTS[t], locked = D.req && !S.tech[P][D.req], poor = S.res[P] < D.cost, can = has && !locked && !poor;
    let ds = D.desc;
    if (locked) { const R = TECH_BY[D.req]; ds = R.tier > tierCap(P) ? `Non disponibile in questa missione (livello max ${TIERS[tierCap(P) - 1]}).` : `Richiede la ricerca ${R.name} (livello ${TIERS[R.tier - 1]}).`; }
    else if (t === 'tower') { const W = towerWeapon(P); ds = `Difesa fissa con ${W.name.toLowerCase()}. Gittata ${dec(W.range)} caselle.`; }
    const why = locked ? 'bloccato' : poor ? `servono ${D.cost}` : '';
    h += `<button class="tile bt ${ui.placing === t ? 'on' : ''} ${locked ? 'locked' : ''}" data-act="place" data-type="${t}" ${can ? '' : 'disabled'} aria-label="${esc(D.name)}, ${D.cost} di gasolio, ingombro ${D.w} per ${D.h}${why ? ', ' + why : ''}">
      <span class="art">${structArt(t)}</span><span class="nm">${D.name}</span>
      <span class="row"><span class="cost">${D.cost}</span><span class="fp">${D.w}×${D.h}</span></span><span class="ds">${esc(ds)}</span></button>`;
  }
  return h + '</div><p class="hint small">Tocca un edificio: compare al centro della mappa; trascinalo con un dito e conferma con ✓. Con un geniere selezionato, un tocco su un giacimento libero avvia subito una pompa.</p>';
}

/* ---------- Produci ---------- */
export function tilesProd() {
  const ps = producers();
  if (!ps.length) return '<p class="hint">Non hai né un comando né una fabbrica.</p>';
  const cur = curProducer(ps);
  const state = p => p.built < 1 ? 'cantiere' : p.queue.length ? `${p.queue.length} in coda` : p.type === 'hq' ? 'libero' : 'libera';
  let h = `<div class="chips pchips">${ps.map(p => `<button class="chip ${p === cur ? 'on' : ''}" data-act="producer" data-id="${p.id}">${prodLabel(p)} <small>· ${state(p)}</small></button>`).join('')}</div>`;
  if (cur.built < 1) return h + '<p class="hint">Questa fabbrica è ancora in costruzione. Mandaci un geniere per finirla.</p>';
  const full = cur.queue.length >= 5;
  const badge = n => n ? `<span class="badge" aria-hidden="true">${n}</span>` : '';
  h += '<div class="tiles t3">';
  if (cur.type === 'hq') {
    const n = cur.queue.length;
    h += `<button class="tile pt" data-act="prodb" ${S.res[P] >= BUILDER.cost && !full ? '' : 'disabled'} aria-label="Geniere, ${BUILDER.cost} di gasolio, ${BUILDER.time} secondi${n ? `, ${n} in coda` : ''}">
      <span class="art">${BUILDER_ART}</span><span class="nm">Geniere</span><span class="row"><span class="cost">${BUILDER.cost}</span><span class="tm">${BUILDER.time} s</span></span>${badge(n)}</button>`;
  } else {
    S.designs.forEach((d, i) => {
      const st = dStats(d, P), n = cur.queue.filter(q => sameD(q.d, d)).length;
      h += `<button class="tile pt" data-act="prod" data-i="${i}" ${S.res[P] >= st.cost && !full ? '' : 'disabled'} aria-label="${esc(designName(d))}, ${st.cost} di gasolio, ${st.time} secondi${n ? `, ${n} in coda` : ''}">
        <span class="art">${veh(d)}</span><span class="nm">${esc(designName(d))}</span><span class="row"><span class="cost">${st.cost}</span><span class="tm">${st.time} s</span></span>${badge(n)}</button>`;
    });
  }
  h += `</div><div class="sec">Coda ${cur.queue.length}/5${cur.queue.length ? ' · tocca per togliere (rimborso)' : ''}</div><div class="qtiles">`;
  cur.queue.forEach((q, i) => {
    const nm = q.d ? designName(q.d) : 'Geniere';
    h += `<button class="qt" data-act="cancel" data-id="${cur.id}" data-i="${i}" aria-label="Togli ${esc(nm)} dalla coda e rimborsa ${q.cost}" title="${esc(nm)}: tocca per togliere">
      <span class="art">${q.d ? veh(q.d) : BUILDER_ART}</span><span class="qx" aria-hidden="true">×</span><span class="prog"><i data-q="${cur.id}:${i}"></i></span></button>`;
  });
  for (let i = cur.queue.length; i < 5; i++) h += '<span class="qt empty" aria-hidden="true"></span>';
  h += '</div><p class="hint small">Tocco: uno in coda · tieni premuto: cinque. ';
  h += cur.type === 'factory' ? 'I mezzi nascono dai progetti: nuove varianti nella scheda Progetta.</p>' : 'Il comando addestra i genieri.</p>';
  return h;
}

/* ---------- Ricerca ---------- */
export function tilesRes() {
  const labs = S.ents.filter(e => !e.dead && e.owner === P && e.type === 'lab');
  const ready = labs.filter(l => l.built >= 1), free = ready.filter(l => !l.rs);
  let h = labs.length ? `<p class="hint">${ready.length === 1 ? '1 laboratorio operativo' : `${ready.length} laboratori operativi`}, ${free.length === 1 ? '1 libero' : `${free.length} liberi`}: ognuno porta avanti una ricerca alla volta.</p>` : '<p class="hint">Costruisci un laboratorio per avviare le ricerche.</p>';
  h += `<p class="hint small">Ogni livello si apre con ${TIER_GATE} ricerche completate del livello precedente.</p>`;
  for (let t = 1; t <= TIERS.length; t++) {
    const list = TECH.filter(T => T.tier === t); if (!list.length) continue;
    const avail = tierAvail(P, t), open = tierOpen(t), done = tierDone(P, t), capped = t > tierCap(P);
    const state = capped ? `Non disponibile in questa missione (livello max ${TIERS[tierCap(P) - 1]})${done ? ` · ${done} già completate` : ''}`
      : avail ? `aperto · ${done}/${list.length} completate` : `Servono ${TIER_GATE} ricerche di livello ${TIERS[t - 2]} (${Math.min(tierDone(P, t - 1), TIER_GATE)}/${TIER_GATE})`;
    h += `<button class="tierh ${avail ? '' : 'locked'} ${capped ? 'capped' : ''} ${open ? 'open' : ''}" data-act="tier" data-t="${t}" aria-expanded="${open}" ${capped ? 'aria-disabled="true"' : ''}><span class="tn">Livello ${TIERS[t - 1]}</span><span class="ts">${state}</span><span class="chev" aria-hidden="true"></span></button>`;
    if (!open) continue;
    h += '<div class="tiles t2">';
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
      h += `<button class="tile rt ${cls} ${isDone ? 'done' : ''}" data-act="research" data-id="${T.id}" ${dis ? 'disabled' : ''}>
        <span class="nm">${esc(T.name)}</span><span class="row"><span class="cost">${T.cost}</span><span class="tm">${T.time} s</span></span>
        <span class="stl ${cls}">${st}</span><span class="ds">${esc(T.desc)}</span>${lab ? `<span class="prog"><i data-rb="${lab.id}"></i></span>` : ''}</button>`;
    }
    h += '</div>';
  }
  return h;
}

/* ---------- Progetta ---------- */
export function tilesDes() {
  const d = ui.draft, st = dStats(d, P), W = WEAPONS[d.w];
  const exists = S.designs.some(x => sameD(x, d));
  const fire = st.hps ? `<div><span>Ripara</span><span>${dec(st.hps)}/s</span></div>` : `<div><span>Danno/s</span><span>${st.dps.toFixed(0)}</span></div><div><span>Gittata</span><span>${rangeTxt(W)}</span></div>`;
  let h = `<div class="preview big"><canvas id="dprev" width="240" height="150"></canvas><div class="pinfo"><div class="pn">${esc(designName(d))}</div><div class="pc">${st.cost} gasolio · ${st.time} s</div>
    <button class="primary" data-act="dsave" ${exists || S.designs.length >= 8 ? 'disabled' : ''}>${exists ? 'Progetto già salvato' : S.designs.length >= 8 ? 'Massimo 8 progetti' : 'Salva il progetto'}</button></div></div>`;
  h += `<div class="kv"><div><span>Punti struttura</span><span>${st.hp}</span></div><div><span>Corazza</span><span>${st.armor}</span></div><div><span>Velocità</span><span>${Math.round(st.speed)}</span></div>${fire}<div><span>Acqua</span><span>${PROPS[d.p].water ? 'sì' : 'no'}</span></div><div><span>Tipo</span><span>${FAMILIES[W.family] || '—'}</span></div></div>`;
  const seg = (kind, table, title) => `<div class="sec">${title}</div><div class="tiles t3 parts">${Object.entries(table).sort((a, b) => a[1].tier - b[1].tier).map(([k, v]) => {
    const ok = partReady(kind, k), out = !ok && v.tier > tierCap(P), miss = out ? 'non in missione' : 'da ricercare';
    const info = kind === 'c' ? `${v.hp} PS · ${v.cost}` : kind === 'p' ? `${Math.round(v.speed * 100)}% vel · ${v.cost}` : v.heal ? `ripara ${dec(v.heal)}/s · ${v.cost}` : `gitt. ${rangeTxt(v)} · ${v.cost}`;
    const look = Object.assign({}, d, { [kind]: k });
    return `<button class="tile dt ${d[kind] === k ? 'on' : ''}" data-act="dpart" data-k="${kind}" data-v="${k}" ${ok ? '' : 'disabled'} aria-pressed="${d[kind] === k}" title="${esc(v.name)}${ok ? '' : ' · livello ' + TIERS[v.tier - 1] + ', ' + miss}"><span class="art">${veh(look)}</span><span class="nm">${esc(v.label || v.name)}</span><small><b class="tr">${TIERS[v.tier - 1]}</b> ${ok ? info : miss}</small></button>`;
  }).join('')}</div>`;
  h += seg('c', CHASSIS, 'Telaio') + seg('p', PROPS, 'Propulsione') + seg('w', WEAPONS, 'Arma');
  h += `<div class="sec">Progetti in produzione</div><div class="queue">${S.designs.map((x, i) => `<div class="qrow"><span>${esc(designName(x))} · ${dStats(x, P).cost}</span><button class="x" data-act="ddel" data-i="${i}" aria-label="Elimina progetto" ${S.designs.length <= 1 ? 'disabled' : ''}>×</button></div>`).join('')}</div>`;
  return h;
}

export function tilesFor(tab) { return tab === 'build' ? tilesBuild() : tab === 'prod' ? tilesProd() : tab === 'res' ? tilesRes() : tilesDes(); }

// Disegna i mezzi nelle tessere con la stessa funzione della mappa, inquadrati per intero (canna compresa).
export function paintTiles(root) {
  for (const c of root.querySelectorAll('canvas[data-veh]')) {
    const [cc, p, w] = c.dataset.veh.split(','), d = { c: cc, p, w };
    if (!CHASSIS[cc] || !PROPS[p] || !WEAPONS[w]) continue;
    drawVehIcon(c, d, -0.35);
  }
}
export function drawVehIcon(c, d, A, tang) {
  const g = c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height);
  const ex = vehicleExtent(d), hw = CHASSIS[d.c].size[1] / 2 + 3.5, cs = Math.cos(A), sn = Math.sin(A);
  // riquadro del mezzo ruotato: da dietro (−back) a davanti (front), largo 2·hw
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const [x, y] of [[-ex.back, -hw], [-ex.back, hw], [ex.front, -hw], [ex.front, hw]]) {
    const rx = x * cs - y * sn, ry = x * sn + y * cs; x0 = Math.min(x0, rx); x1 = Math.max(x1, rx); y0 = Math.min(y0, ry); y1 = Math.max(y1, ry);
  }
  const sc = Math.min(c.width * 0.94 / (x1 - x0), c.height * 0.94 / (y1 - y0));
  g.translate(c.width / 2 - (x0 + x1) / 2 * sc, c.height / 2 - (y0 + y1) / 2 * sc); g.scale(sc, sc);
  drawVehicle(g, d, PAL[P], A, tang == null ? A : tang, false, 0);
}
