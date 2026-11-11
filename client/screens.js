// Schermate fuori dalla partita: menu principale, campagna, briefing, rapporto di fine missione, fine della campagna,
// conferma d'uscita; e l'indicatore dell'obiettivo sopra la mappa durante le missioni.
// Le regole della campagna (sblocchi, ricerche portate, miglior tempo) sono nel motore: qui solo le schermate.
import {
  P, DIFF, MISSIONS, MAPS, TECH_BY, TIERS, S, gridRef, homeOf, startMission, finishMission, campaignSummary, canPlayMission,
} from '../engine/index.js';
import { ui } from './state.js';
import { startGame, resetClient, closeOverlay, showHelp, closeHelp, toast, fmtTime, ov, randomSeed, togglePause } from './ui.js';
import { drawMissionMap } from './render.js';
import { getCampaign, setCampaign, resetCampaign, campaignDiff, setCampaignDiff } from './campaign.js';
import { uiSfx } from './audio.js';
import { musicSting } from './music.js';
import { mapPref, setMapPref, mapInfo } from './prefs.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = i => String(i + 1).padStart(2, '0');
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
// Indice della missione in corso (0–7), o -1 in schermaglia.
export const missionIndex = () => S && S.mission ? MISSIONS.findIndex(m => m.id === S.mission) : -1;

function open(kind, html) {
  const o = ov();
  ui.overlay = kind; ui.paused = true; o.hidden = false; o.scrollTop = 0;
  o.innerHTML = html;
  return o;
}
const on = (id, fn) => { const b = $(id); if (b) b.addEventListener('click', fn); };
const diffChips = (attr, cur) => Object.entries(DIFF).map(([k, v]) => `<button class="btn ${cur === k ? 'on' : ''}" data-${attr}="${k}" aria-pressed="${cur === k}">${v.label}</button>`).join('');
const mapChips = cur => MAPS.map(m => `<button class="btn ${cur === m.id ? 'on' : ''}" data-map="${m.id}" aria-pressed="${cur === m.id}">${esc(m.name)}</button>`).join('');
function bindChips(o, attr, fn) {
  o.querySelectorAll(`[data-${attr}]`).forEach(b => b.addEventListener('click', () => {
    o.querySelectorAll(`[data-${attr}]`).forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
    fn(b.dataset[attr]);
  }));
}

/* ---------- menu principale ---------- */
export function showStart() {
  refreshObjective();
  const sum = campaignSummary(getCampaign());
  const next = sum.next != null ? sum.missions[sum.next] : null;
  const campLabel = sum.finished ? 'Rigioca le missioni' : sum.completed === 0 && sum.next === 0 ? 'Inizia la campagna' : `Riprendi: missione ${sum.next + 1} · ${esc(next.name)}`;
  const campInfo = sum.finished ? 'Campagna conclusa: la valle è libera.' : sum.completed ? `${sum.completed}/${sum.total} missioni vinte · ${plural(sum.techCount, 'ricerca', 'ricerche')} · ${plural(sum.designCount, 'progetto', 'progetti')}` : `${sum.total} missioni, dalla testa di ponte all’assalto finale.`;
  const mp = mapInfo(mapPref());
  const o = open('start', `<div class="card menu" role="dialog" aria-labelledby="ovt">
    <p class="eyebrow">Ottobre 1989 · Valle del Serra</p>
    <h1 class="title" id="ovt">WARZONE <span>1989</span></h1>
    <p class="brief">Il Direttorio Ferreo punta ai giacimenti di gasolio della valle. Al comando della Brigata Aurora metti in funzione le pompe, ricerca nuove tecnologie, progetta i tuoi mezzi e respingi il nemico.</p>
    <div class="modes">
      <section class="mode" aria-labelledby="mCamp">
        <p class="mk">Campagna</p>
        <h2 class="mt" id="mCamp">Operazione Valle Grigia</h2>
        <p class="md">Otto missioni in fila, ognuna con il suo obiettivo. Le ricerche e i progetti passano da una missione all’altra.</p>
        <div class="meter" aria-hidden="true"><i style="width:${(sum.completed / sum.total * 100).toFixed(1)}%"></i></div>
        <p class="mp">${campInfo}</p>
        <div class="mact"><button class="primary" id="ovCamp">${campLabel}</button>${sum.completed || sum.unlocked > 1 ? '<button class="btn" id="ovMissions">Missioni</button>' : ''}</div>
      </section>
      <section class="mode" aria-labelledby="mSkirm">
        <p class="mk">Schermaglia</p>
        <h2 class="mt" id="mSkirm">Partita libera</h2>
        <div class="diff mapsel" role="group" aria-label="Mappa"><span class="lbl">Mappa</span>${mapChips(mp.id)}</div>
        <p class="md">${esc(mp.desc)}</p>
        <div class="diff"><span class="lbl">Avversario</span>${diffChips('diff', ui.diff)}</div>
        ${mp.id === 'casuale' ? `<p class="mp">Carta operativa n. ${S.seed % 10000}</p>` : '<p class="mp credit">Ispirata alla geografia della città; disegnata a mano.</p>'}
        <div class="mact"><button class="primary" id="ovStart">Inizia la schermaglia</button>${mp.id === 'casuale' ? '<button class="btn" id="ovMap">Cambia carta</button>' : ''}</div>
      </section>
    </div>
    <div class="mfoot"><button class="btn" id="ovHelp">Comandi</button><p class="hint">Un clic su un tuo mezzo lo seleziona, un clic sulla mappa gli dà l’ordine. Suono e musica partono al primo tocco: «Suono» nella barra spegne tutto, in «Comandi» regoli la musica.</p></div>
  </div>`);
  bindChips(o, 'diff', d => { ui.diff = d; });
  // cambio di mappa: la partita sotto il menu si riprepara sulla mappa nuova (la si vede dietro la copertina)
  bindChips(o, 'map', id => {
    if (id === mapPref()) return;
    setMapPref(id); startGame(ui.diff, randomSeed()); showStart();
    const b = o.querySelector(`[data-map="${id}"]`); if (b) b.focus();
  });
  on('ovMap', () => { startGame(ui.diff, randomSeed()); showStart(); });
  on('ovStart', () => {
    startGame(ui.diff, S.seed); closeOverlay(); refreshObjective();
    const h = homeOf(P);
    toast(`Sei nel settore ${gridRef(h.x, h.y)}. Manda i genieri sui giacimenti vicini.`);
  });
  on('ovCamp', () => { if (sum.finished) showCampaign(); else showBrief(sum.next); });
  on('ovMissions', () => showCampaign());
  on('ovHelp', () => showHelp(showStart));
  $('ovCamp').focus();
}

/* ---------- campagna: le cartelle delle missioni ---------- */
export function showCampaign(confirmReset = false) {
  const camp = getCampaign(), sum = campaignSummary(camp), cd = campaignDiff();
  $('objective').hidden = true; // la missione sotto la schermata non c'entra con l'elenco
  const folders = sum.missions.map(m => {
    const st = m.done ? `Completata${m.best != null ? ` · miglior tempo ${fmtTime(m.best)}` : ''}` : m.unlocked ? 'Disponibile' : 'Bloccata';
    const cls = m.done ? 'done' : m.unlocked ? 'open' : 'locked';
    return `<li><button class="folder ${cls} ${m.index === sum.next ? 'next' : ''}" data-mission="${m.index}" ${m.unlocked ? '' : 'disabled'} aria-label="Missione ${m.index + 1}: ${esc(m.name)}. ${esc(st)}.">
      <span class="fn">${num(m.index)}</span><span class="fname">${esc(m.name)}</span><span class="ftier">Livelli ${m.tiers}</span>
      <span class="fobj">${esc(m.objectiveText)}</span><span class="fst">${esc(st)}</span></button></li>`;
  }).join('');
  const foot = confirmReset
    ? `<div class="confirm" role="alert"><p>Ricominciare da capo? Perdi ${plural(sum.completed, 'missione vinta', 'missioni vinte')}, ${plural(sum.techCount, 'ricerca', 'ricerche')} e ${plural(sum.designCount, 'progetto', 'progetti')}.</p>
        <div class="mact"><button class="primary danger" id="ovResetYes">Sì, ricomincia</button><button class="btn" id="ovResetNo">Annulla</button></div></div>`
    : `<div class="actions"><button class="btn" id="ovBack">Menu</button><button class="btn ghost" id="ovReset" ${sum.unlocked > 1 || sum.completed ? '' : 'disabled'}>Ricomincia la campagna</button></div>`;
  const o = open('campaign', `<div class="card wide" role="dialog" aria-labelledby="ovt">
    <p class="eyebrow">Campagna · Brigata Aurora · ottobre 1989</p>
    <h2 class="title t2" id="ovt">Operazione <span>Valle Grigia</span></h2>
    <div class="cstat"><div><b>${sum.completed}/${sum.total}</b><span>Missioni vinte</span></div><div><b>${sum.techCount}</b><span>Ricerche portate</span></div><div><b>${sum.designCount}</b><span>Progetti salvati</span></div></div>
    <div class="diff"><span class="lbl">Avversario</span>${diffChips('cdiff', cd)}</div>
    <ol class="folders">${folders}</ol>
    ${foot}
  </div>`);
  bindChips(o, 'cdiff', d => setCampaignDiff(d));
  o.querySelectorAll('[data-mission]').forEach(b => b.addEventListener('click', () => showBrief(+b.dataset.mission)));
  on('ovBack', () => { startGame(ui.diff, randomSeed()); showStart(); });
  on('ovReset', () => showCampaign(true));
  on('ovResetNo', () => showCampaign(false));
  on('ovResetYes', () => { resetCampaign(); toast('Campagna ricominciata dalla missione 1.'); showCampaign(false); });
  const f = confirmReset ? $('ovResetNo') : o.querySelector('.folder.next') || $('ovBack');
  if (f) f.focus();
}

/* ---------- briefing ---------- */
// Avvia la missione i come la vedrà il giocatore (mappa, basi, obiettivo), in pausa sotto la schermata.
export function beginMission(i) {
  const camp = getCampaign();
  if (!canPlayMission(camp, i)) return false;
  startMission(camp, i, campaignDiff());
  resetClient();
  ui.techBefore = Object.keys(camp.tech);
  resetObjectiveHud();
  return true;
}
export function showBrief(i) {
  const camp = getCampaign(), sum = campaignSummary(camp), m = sum.missions[i];
  if (!m || !m.unlocked) { showCampaign(); return; }
  beginMission(i);
  const cd = campaignDiff(), M = MISSIONS[i];
  const carry = sum.techCount || sum.designCount > 1 ? `${plural(sum.techCount, 'ricerca', 'ricerche')} e ${plural(sum.designCount, 'progetto', 'progetti')} dalle missioni precedenti` : 'nessuna: si parte dal livello I';
  const limit = S.timeLimit ? `<div><dt>Tempo massimo</dt><dd>${fmtTime(S.timeLimit)}</dd></div>` : '';
  const o = open('brief', `<div class="card wide" role="dialog" aria-labelledby="ovt">
    <p class="eyebrow">Missione ${i + 1} di ${sum.total} · Operazione Valle Grigia${m.done ? ` · già vinta${m.best != null ? `, miglior tempo ${fmtTime(m.best)}` : ''}` : ''}</p>
    <h2 class="title t2" id="ovt"><span>${num(i)}</span> ${esc(m.name)}</h2>
    <div class="bgrid">
      <figure class="bmap"><canvas id="briefMap" width="256" height="256" aria-label="Carta della missione"></canvas>
        <figcaption><i class="lg p"></i>Brigata Aurora <i class="lg e"></i>Direttorio Ferreo <i class="lg d"></i>giacimenti</figcaption></figure>
      <div class="btext">
        <p class="brief">${esc(M.brief)}</p>
        <dl class="bfacts">
          <div class="obj"><dt>Obiettivo</dt><dd>${esc(m.objectiveText)}</dd></div>
          <div><dt>Livelli tecnologici</dt><dd>${m.tiers}${m.maxTier < TIERS.length ? ` · oltre il ${TIERS[m.maxTier - 1]} non si ricerca` : ''}</dd></div>
          <div><dt>Dalla campagna</dt><dd>${carry}</dd></div>
          ${limit}
        </dl>
        <div class="diff"><span class="lbl">Avversario</span>${diffChips('bdiff', cd)}</div>
      </div>
    </div>
    <div class="actions"><button class="primary" id="ovGo">Inizia la missione</button><button class="btn" id="ovBack">Torna alla campagna</button></div>
  </div>`);
  drawMissionMap($('briefMap'));
  // la difficoltà cambia il nemico della missione: si riprepara la partita (stessa carta)
  bindChips(o, 'bdiff', d => { setCampaignDiff(d); beginMission(i); drawMissionMap($('briefMap')); });
  on('ovGo', () => { closeOverlay(); refreshObjective(); toast(`Obiettivo: ${m.objectiveText}.`); });
  on('ovBack', () => showCampaign());
  $('ovGo').focus();
}

/* ---------- fine partita ---------- */
const REASON = {
  objective: 'Obiettivo raggiunto.',
  destroyed: 'Hai perso il comando, le fabbriche e tutti i genieri.',
  time: 'Il tempo della missione è scaduto prima di raggiungere l’obiettivo.',
};
// reason manca dopo un ripristino dell'anteprima: si ricava dallo stato.
function guessReason(won) {
  if (won) return S.mission ? 'objective' : 'destroyed';
  return S.timeLimit && S.time >= S.timeLimit ? 'time' : 'destroyed';
}
export function showEnd(won, reason) {
  reason = reason || guessReason(won);
  const i = missionIndex();
  if (i < 0) return showSkirmishEnd(won);
  const M = MISSIONS[i], st = S.stats, last = i === MISSIONS.length - 1;
  const before = getCampaign();
  const gained = Object.keys(S.tech[P]).filter(id => S.tech[P][id] && TECH_BY[id] && !(ui.techBefore || []).includes(id) && !before.tech[id]);
  let best = false, unlockedNext = false;
  if (won) {
    best = !(before.best[M.id] < Math.round(S.time));
    unlockedNext = !last && before.unlocked < i + 2;
    setCampaign(finishMission(before, i, S));
  }
  const techList = gained.length ? `<ul class="techl">${gained.map(id => `<li><b>${TIERS[TECH_BY[id].tier - 1]}</b>${esc(TECH_BY[id].name)}</li>`).join('')}</ul>` : '';
  const techBox = won
    ? `<div class="gain"><p class="sec">Ricerche nuove portate in campagna: ${gained.length}</p>${techList || '<p class="hint small">Nessuna ricerca nuova in questa missione.</p>'}</div>`
    : gained.length ? `<div class="gain"><p class="sec">Ricerche di questa missione: ${gained.length}</p>${techList}<p class="hint small">Passano alla campagna solo vincendo la missione.</p></div>` : '';
  const nextLine = won && !last ? `<p class="hint">${unlockedNext ? 'Sbloccata' : 'Prossima'}: missione ${i + 2} · ${esc(MISSIONS[i + 1].name)}. Progressi salvati.</p>` : won ? '<p class="hint">Progressi salvati.</p>' : '';
  const acts = won
    ? (last ? '<button class="primary" id="ovFinal">Fine della campagna</button>' : '<button class="primary" id="ovNext">Missione successiva</button>')
      + '<button class="btn" id="ovCampBack">Torna alla campagna</button><button class="btn" id="ovLook">Guarda la mappa</button>'
    : '<button class="primary" id="ovRetry">Riprova</button><button class="btn" id="ovCampBack">Torna alla campagna</button><button class="btn" id="ovLook">Guarda la mappa</button>';
  open('end', `<div class="card" role="dialog" aria-labelledby="ovt" style="border-top-color:${won ? 'var(--olive)' : 'var(--brick)'}">
    <p class="eyebrow">Rapporto · missione ${i + 1} · ${esc(M.name)} · ${DIFF[S.diff].label}</p>
    <h2 class="title" id="ovt">${won ? 'Missione <span>compiuta</span>' : 'Missione <span>fallita</span>'}</h2>
    <p class="brief">${won && reason === 'objective' ? `Obiettivo raggiunto: «${esc(campaignSummary(before).missions[i].objectiveText)}».` : REASON[reason] || ''}</p>
    <div class="stats"><div><b>${fmtTime(S.time)}</b><span>Tempo${won && best ? ' · record' : ''}</span></div><div><b>${st.kills[P]}</b><span>Nemici distrutti</span></div><div><b>${st.made[P]}</b><span>Mezzi prodotti</span></div><div><b>${st.lost[P]}</b><span>Perdite</span></div></div>
    ${techBox}${nextLine}
    <div class="actions">${acts}</div>
  </div>`);
  on('ovNext', () => showBrief(i + 1));
  on('ovFinal', () => showFinal());
  on('ovRetry', () => { if (!beginMission(i)) { showCampaign(); return; } closeOverlay(); refreshObjective(); toast(`Obiettivo: ${campaignSummary(getCampaign()).missions[i].objectiveText}.`); });
  on('ovCampBack', () => showCampaign());
  on('ovLook', lookAtMap);
  const f = $('ovNext') || $('ovFinal') || $('ovRetry'); if (f) f.focus();
}
function showSkirmishEnd(won) {
  const st = S.stats;
  open('end', `<div class="card" role="dialog" aria-labelledby="ovt" style="border-top-color:${won ? 'var(--olive)' : 'var(--brick)'}">
    <p class="eyebrow">Rapporto finale · schermaglia${S.map ? ` · ${esc(mapInfo(S.map).name)}` : ''} · ${fmtTime(S.time)} · ${DIFF[S.diff].label}</p>
    <h2 class="title" id="ovt">${won ? 'Valle <span>liberata</span>' : 'Brigata <span>sconfitta</span>'}</h2>
    <p class="brief">${won ? 'Il comando e le fabbriche del Direttorio Ferreo sono fuori uso. I giacimenti della valle sono tuoi.' : 'Hai perso il comando, le fabbriche e tutti i genieri. Il Direttorio Ferreo controlla la valle.'}</p>
    <div class="stats"><div><b>${st.made[P]}</b><span>Mezzi prodotti</span></div><div><b>${st.kills[P]}</b><span>Nemici distrutti</span></div><div><b>${st.lost[P]}</b><span>Perdite</span></div><div><b>${st.built[P]}</b><span>Edifici costruiti</span></div></div>
    <div class="actions"><button class="primary" id="ovAgain">Nuova operazione</button><button class="btn" id="ovLook">Guarda la mappa</button></div>
  </div>`);
  on('ovAgain', () => { startGame(ui.diff, randomSeed()); showStart(); });
  on('ovLook', lookAtMap);
}
function lookAtMap() { const o = ov(); o.hidden = true; o.innerHTML = ''; ui.overlay = 'ended'; }

/* ---------- fine della campagna ---------- */
export function showFinal() {
  const sum = campaignSummary(getCampaign());
  const tot = sum.missions.reduce((a, m) => a + (m.best || 0), 0);
  const o = open('final', `<div class="card wide final" role="dialog" aria-labelledby="ovt">
    <p class="eyebrow">31 ottobre 1989 · Fine dell’operazione Valle Grigia</p>
    <h1 class="title" id="ovt">Valle del Serra <span>libera</span></h1>
    <p class="brief">Il comando del Direttorio Ferreo è caduto e le sue colonne ripiegano oltre il passo. Dalla testa di ponte sul fiume all’ultimo bunker, la Brigata Aurora ha riportato il gasolio della valle alla sua gente.</p>
    <div class="stats"><div><b>${sum.completed}/${sum.total}</b><span>Missioni vinte</span></div>${sum.missions.every(m => m.best) ? `<div><b>${fmtTime(tot)}</b><span>Somma dei migliori tempi</span></div>` : `<div><b>${DIFF[campaignDiff()].label}</b><span>Avversario</span></div>`}<div><b>${sum.techCount}</b><span>Ricerche</span></div><div><b>${sum.designCount}</b><span>Progetti</span></div></div>
    <ol class="roll">${sum.missions.map(m => `<li><span class="fn">${num(m.index)}</span><span>${esc(m.name)}</span><b>${m.best != null ? fmtTime(m.best) : '—'}</b></li>`).join('')}</ol>
    <div class="actions"><button class="primary" id="ovMenu">Torna al menu</button><button class="btn" id="ovCampBack">Rigioca le missioni</button></div>
  </div>`);
  on('ovMenu', () => { startGame(ui.diff, randomSeed()); showStart(); });
  on('ovCampBack', () => showCampaign());
  $('ovMenu').focus();
  uiSfx('objDone');
  return o;
}

/* ---------- uscita dalla partita ---------- */
let wasPaused = false;
export function showExitConfirm() {
  if (!S) return;
  if (ui.overlay === 'ended') { leaveToMenu(); return; }
  if (ui.overlay) return;
  wasPaused = ui.paused;
  const i = missionIndex();
  open('exit', `<div class="card narrow" role="alertdialog" aria-labelledby="ovt" aria-describedby="ovd">
    <p class="eyebrow">${i >= 0 ? `Missione ${i + 1} · ${esc(MISSIONS[i].name)}` : 'Schermaglia'} · ${fmtTime(S.time)}</p>
    <h2 class="title t3" id="ovt">${i >= 0 ? 'Lasciare la missione?' : 'Lasciare la partita?'}</h2>
    <p class="brief" id="ovd">La partita in corso si perde.${i >= 0 ? ' Le ricerche fatte in questa missione non passano alla campagna; i progressi già salvati restano.' : ''}</p>
    <div class="actions"><button class="primary" id="ovStay">Continua a giocare</button><button class="btn danger" id="ovLeave">Esci al menu</button></div>
  </div>`);
  on('ovStay', cancelExit);
  on('ovLeave', leaveToMenu);
  $('ovStay').focus();
}
function cancelExit() { closeOverlay(); if (wasPaused) togglePause(); }
function leaveToMenu() { startGame(ui.diff, randomSeed()); showStart(); }
// Esc nelle schermate: chiude il manuale e la conferma d'uscita.
export function overlayEscape() {
  if (ui.overlay === 'help') closeHelp();
  else if (ui.overlay === 'exit') cancelExit();
}

/* ---------- obiettivo sopra la mappa ---------- */
let lastPhase = null, lastProg = null, pulseT = 0;
const COUNTED = { outpost: 1, destroy: 1, destroy_all_bases: 1 };
// Fase dell'obiettivo: cambia quando si apre un nuovo tratto (pompe avviate, inizio o perdita della tenuta, seconda
// fase, una base caduta, obiettivo raggiunto). Letta dallo stato, senza ricalcolare nulla.
const phaseOf = o => [o.stage ?? '', o.pumpsOk ? 1 : 0, o.type === 'hold' ? (o.since == null ? 0 : 1) : '', o.bases ? o.bases.filter(b => b.down).length : '', o.done ? 1 : 0].join('|');
export function resetObjectiveHud() { lastPhase = null; lastProg = null; refreshObjective(); }
function pulse(cls) {
  const box = $('objective'); if (!box) return;
  box.classList.remove('pulse', 'tick', 'warn'); void box.offsetWidth; box.classList.add(cls);
  clearTimeout(pulseT); pulseT = setTimeout(() => box.classList.remove(cls), 1000);
}
// Aggiorna l'indicatore; ev: dati dell'evento objective del motore (per effetto e suono del cambiamento).
export function refreshObjective(ev) {
  const box = $('objective'), stage = $('stage'); if (!box) return;
  const o = S && S.objective;
  if (!o) { box.hidden = true; stage.classList.remove('has-obj'); return; }
  box.hidden = false; stage.classList.add('has-obj');
  const text = ev && ev.text || o.text, prog = ev ? ev.progress : o.progress, target = ev ? ev.target : o.target;
  $('objText').textContent = text;
  $('objKind').textContent = o.done ? 'Obiettivo raggiunto' : o.failed ? 'Obiettivo fallito'
    : o.type === 'survive_then_destroy' ? `Obiettivo · fase ${o.stage}/2` : 'Obiettivo';
  limitText();
  $('objBar').style.width = (target > 0 ? Math.min(1, prog / target) * 100 : 0).toFixed(1) + '%';
  box.classList.toggle('done', !!o.done); box.classList.toggle('failed', !!o.failed);
  const ph = phaseOf(o);
  if (ev && lastPhase != null && ph !== lastPhase) {
    const lostHold = o.type === 'hold' && o.since == null && !o.done;
    pulse(lostHold ? 'warn' : 'pulse');
    if (!lostHold) uiSfx(o.done ? 'objDone' : 'objStep');
    if (!lostHold && !o.done) musicSting('phase');
  } else if (ev && lastProg != null && prog > lastProg && (COUNTED[o.type] || o.stage === 2)) pulse('tick');
  lastPhase = ph; lastProg = prog;
  stage.style.setProperty('--objh', box.offsetHeight + 'px');
}
// Tempo massimo della missione (se c'è): si aggiorna con la barra, non solo con gli eventi.
export function limitText() {
  const el = $('objLimit'), o = S && S.objective;
  if (!S || !S.timeLimit || !o || o.done) { if (el) el.remove(); return; }
  let t = el;
  if (!t) { t = document.createElement('span'); t.id = 'objLimit'; t.className = 'ol'; $('objective').querySelector('.oh').appendChild(t); }
  t.textContent = `Tempo: ${fmtTime(Math.max(0, S.timeLimit - S.time))}`;
}

export function initScreens() {
  $('btnExit').addEventListener('click', showExitConfirm);
}
