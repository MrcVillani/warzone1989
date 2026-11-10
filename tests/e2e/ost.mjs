// Prove della colonna sonora della campagna (piano 06) nel gioco costruito (dist/index.html):
//   1. in ogni missione della campagna la musica usa il profilo di quella missione (tonalità e tempo dichiarati, e le
//      note pianificate cadono davvero sulla griglia di quel tempo);
//   2. in «Contrattacco» il passaggio dell'obiettivo alla fase 2 porta il profilo trionfale entro un giro, senza strappi;
//   3. menu, briefing e schermaglia restano sul materiale di base (re minore, 72 battiti);
//   4. la schermata finale della campagna suona «Valle liberata», poi torna il tema del menu;
//   5. missione → menu → schermaglia senza errori in console e senza note rimaste appese;
//   6. con la musica spenta nessuna nota, anche cambiando missione; riaccesa in missione riparte con il suo profilo.
// Fuori dal gioco: profili validi (note, accordi, durate delle frasi), frequenze sane in tutte le sezioni (motore
// musicale fatto girare su un OfflineAudioContext, senza aspettare il tempo reale), passaggio automatico da «Valle
// liberata» al menu, album in dist/ost/ (11 MP3 e scaletta.txt) se è stato generato.
// Le richiama smoke.mjs (npm run e2e); si possono lanciare anche da sole: npm run build && node tests/e2e/ost.mjs
import { createRequire } from 'node:module';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';
import { openMenu } from './layoutb.mjs';
import { musicProfile, MUSIC_PROFILES } from '../../client/music.js';
import { MISSIONS } from '../../engine/index.js';

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ostDir = path.join(root, 'dist/ost');
const KEY = 'wz.campagna';
const sec = v => v.toFixed(1).replace('.', ',');
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

/* ---------- prima che la pagina si carichi: registro delle sorgenti audio pianificate ----------
   Ogni sorgente avviata con un istante esplicito (le note della musica e i suoni del gioco; il vento e il fruscio di
   fondo partono senza istante e restano fuori) finisce in window.__srcs con l'istante d'inizio, la prima fine
   pianificata (stop0) e l'ultima (stop): se la sezione cambia, la musica anticipa la fine delle sue note. */
function tapSources() {
  const S = window.__srcs = [];
  const wrap = proto => {
    if (!proto || !Object.prototype.hasOwnProperty.call(proto, 'start')) return;
    const st = proto.start, sp = proto.stop;
    proto.start = function (when, ...r) {
      if (when !== undefined) { this.__e = { when, stop0: Infinity, stop: Infinity }; S.push(this.__e); window.__ac = this.context; }
      return st.call(this, when, ...r);
    };
    if (Object.prototype.hasOwnProperty.call(proto, 'stop')) proto.stop = function (when, ...r) {
      const e = this.__e, w = when === undefined ? this.context.currentTime : when;
      if (e) { if (e.stop0 === Infinity) e.stop0 = w; e.stop = w; }
      return sp.call(this, when, ...r);
    };
  };
  wrap(AudioScheduledSourceNode.prototype); wrap(OscillatorNode.prototype); wrap(AudioBufferSourceNode.prototype);
  // Strumenti di misura, usati dai test.
  window.__ost = {
    now: () => window.__ac ? window.__ac.currentTime : -1,
    // Attacchi distinti (al millisecondo) delle sorgenti nate da t0 in poi.
    onsets(t0, t1 = Infinity) { return [...new Set(S.filter(e => e.when >= t0 && e.when < t1).map(e => Math.round(e.when * 1000)))].sort((a, b) => a - b).map(x => x / 1000); },
    // Quota degli attacchi distinti in [t0, t1) che cadono sulla griglia dei sedicesimi di ogni tempo in bpms (±6 ms).
    grid(t0, t1, bpms) {
      const ws = window.__ost.onsets(t0, t1), out = {};
      for (const bpm of bpms) {
        const st = 15 / bpm; let best = 0;
        for (const ref of ws.slice(0, 40)) {
          let k = 0; for (const w of ws) { const x = (w - ref) / st; if (Math.abs(x - Math.round(x)) * st < 0.006) k++; }
          best = Math.max(best, k / ws.length);
        }
        out[bpm] = +best.toFixed(3);
      }
      return { n: ws.length, ratio: out };
    },
    // Note lunghe (più di 1,5 s) nate prima del cambio di sezione T: quante sarebbero durate oltre T + 1 s e quante
    // suonano ancora oltre T + 0,6 s dopo il taglio (la musica le ferma a T + 0,5 s).
    hanging(T) {
      const old = S.filter(e => e.when < T && e.stop0 - e.when > 1.5);
      return { old: old.length, wouldRing: old.filter(e => e.stop0 > T + 1).length, ringing: old.filter(e => e.stop > T + 0.6).length };
    },
    // Sorgenti nate da t0 in poi la cui fine è stata anticipata (un taglio della sezione).
    shortened(t0) { return S.filter(e => e.when >= t0 && e.stop < e.stop0 - 1e-6).length; },
    // Istante (tempo del contesto audio) in cui la musica entra nel modo m; −1 se non succede entro maxMs.
    async waitMode(m, maxMs = 4000) {
      const t0 = performance.now();
      while (performance.now() - t0 < maxMs) {
        if (window.__wz && window.__wz.music().mode === m) return window.__ost.now();
        await new Promise(r => setTimeout(r, 10));
      }
      return -1;
    },
  };
}

// Vittoria forzata della missione in corso (obiettivo «distruggi»): comandi, fabbriche e genieri nemici distrutti.
function forceDestroyWin() {
  const E = window.__wz.engine;
  for (const e of E.S.ents.filter(e => !e.dead && e.owner === 1 && ((e.kind === 'struct' && (e.type === 'hq' || e.type === 'factory')) || e.builder))) E.kill(e, 0);
  for (let i = 0; i < 80 && E.S.phase === 'play'; i++) E.step(0.05);
  return E.S.phase;
}

async function press(page, touch, sel) {
  const l = page.locator(sel).first();
  await l.scrollIntoViewIfNeeded();
  if (touch) await l.tap(); else await l.click();
}
const music = page => page.evaluate(() => window.__wz.music());
// Attende che cond(stato della musica) sia vera, controllando ogni 100 ms; restituisce i secondi trascorsi o −1.
async function waitMusic(page, cond, maxS) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxS * 1000) {
    const m = await music(page);
    if (cond(m)) return (Date.now() - t0) / 1000;
    await page.waitForTimeout(100);
  }
  return -1;
}
const acNow = page => page.evaluate(() => window.__ost.now());
// Attende che il contesto audio arrivi all'istante t (il tempo della musica, non quello della pagina).
async function untilAudio(page, t, maxS = 10) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxS * 1000 && (await acNow(page)) < t) await page.waitForTimeout(50);
}

async function newPage(browser, opts, settings) {
  const ctx = await browser.newContext(opts);
  await ctx.addInitScript(tapSources);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return { ctx, page, errors, settings };
}
// Campagna con le prime 7 missioni vinte (tutte giocabili, l'ottava porta alla fine della campagna) e musica come
// richiesto (on: true/false), a volume predefinito.
async function prepare(page, url, on) {
  await page.goto(url);
  await page.evaluate(([k, done, on]) => {
    for (const x of ['wz.musica', 'wz.musica.volume', 'wz.sound', 'wz.volume']) try { localStorage.removeItem(x); } catch (e) { /* niente */ }
    localStorage.setItem(k, JSON.stringify({ unlocked: 8, done, tech: {}, best: {} }));
    if (!on) localStorage.setItem('wz.musica', '0');
  }, [KEY, MISSIONS.slice(0, 7).map(m => m.id), on]);
  await page.reload();
  await page.waitForTimeout(500);
}
// Dal menu principale alla missione i (0–7) come un giocatore: «Missioni», la cartella, «Inizia la missione».
// Restituisce lo stato della musica nel briefing e l'istante in cui la musica entra in partita.
async function playMission(page, touch, i) {
  await press(page, touch, '#ovMissions');
  await press(page, touch, `#overlay [data-mission="${i}"]`);
  await page.waitForFunction(() => window.__wz.ui.overlay === 'brief');
  await page.waitForTimeout(300);   // almeno un giro del controllo della musica (ogni 0,2 s)
  const brief = await page.evaluate(() => ({ ...window.__wz.music(), ov: window.__wz.ui.overlay, mission: window.__wz.S.mission }));
  const w = page.evaluate(() => window.__ost.waitMode('game'));
  await press(page, touch, '#ovGo');
  return { brief, T: await w };
}
// Dalla partita al menu principale: «Menu» (su telefono nel cassetto), «Esci al menu». Restituisce l'istante del cambio.
async function leaveToMenu(page, touch) {
  await openMenu(page);
  await press(page, touch, '#btnExit');
  const w = page.evaluate(() => window.__ost.waitMode('menu'));
  await press(page, touch, '#ovLeave');
  return w;
}
const desc = m => `profilo ${m.profile === null ? 'di base' : m.profile}, ${m.key}, ${m.bpm} battiti`;

/* ---------- prove fuori dal gioco (Node): profili, album ---------- */
const NOTE = { do: 0, re: 2, mi: 4, fa: 5, sol: 7, la: 9, si: 11 };
const QUALITY = { minore: [0, 3, 7], frigio: [0, 3, 7], maggiore: [0, 4, 7], lidio: [0, 4, 7] };
function parseKey(k) {
  const m = /^(do|re|mi|fa|sol|la|si)(?: (diesis|bemolle))? (minore|maggiore|frigio|lidio)$/.exec(k || '');
  if (!m) return null;
  const pc = (NOTE[m[1]] + (m[2] === 'diesis' ? 1 : m[2] === 'bemolle' ? 11 : 0)) % 12;
  return { pc, triad: QUALITY[m[3]].map(x => (pc + x) % 12).sort((a, b) => a - b) };
}
const INSTR = new Set(['horn', 'reed', 'horn2', 'reed2']);

export function checkProfiles(check) {
  // Ogni missione ha il suo profilo, con tonalità e tempo propri; contrattacco/2 e valle-liberata esistono.
  const ids = MISSIONS.map(m => m.id);
  const missing = ids.filter(id => !MUSIC_PROFILES.includes(id) || musicProfile(id).id !== id);
  const extra = MUSIC_PROFILES.filter(id => !ids.includes(id));
  check(MISSIONS.length === 8 && !missing.length && extra.sort().join(',') === 'contrattacco/2,valle-liberata',
    `profili: ognuna delle 8 missioni ha il suo profilo musicale (${missing.length ? 'mancano ' + missing.join(', ') : 'nessuno mancante'}; altri: ${extra.join(', ')})`);
  const base = musicProfile(null), unknown = musicProfile('missione-inesistente');
  check(base.id === null && base.key === 're minore' && base.bpm === 72 && unknown === base,
    `profili: senza missione (o con un id sconosciuto) resta il profilo di base (${base.key}, ${base.bpm} battiti)`);

  // Validità di ogni profilo: tonalità dichiarata coerente con tonica e accordo di tonica, tempo sensato, accordi
  // completi, frasi di 32 battiti, note intere nel registro (anche all'ottava bassa delle variazioni), strumenti noti.
  for (const id of [null, ...MUSIC_PROFILES]) {
    const p = musicProfile(id), K = parseKey(p.key), bad = [];
    if (!K) bad.push(`tonalità «${p.key}» non riconosciuta`);
    if (!(Number.isFinite(p.bpm) && p.bpm >= 50 && p.bpm <= 120)) bad.push(`tempo ${p.bpm}`);
    const tonic = id === null ? p.CH.Dm : p.CH['1'];
    if (K && tonic) {
      if (((p.tonicBass % 12) + 12) % 12 !== K.pc) bad.push(`basso di tonica ${p.tonicBass} fuori tonalità`);
      const pcs = [...new Set(tonic.pad.map(m => m % 12))].sort((a, b) => a - b);
      if (pcs.join() !== K.triad.join()) bad.push(`accordo di tonica ${pcs} invece di ${K.triad}`);
    } else if (!tonic) bad.push('manca l’accordo di tonica');
    for (const [name, c] of Object.entries(p.CH)) {
      const v = c.pad;
      if (!Array.isArray(v) || v.length !== 4 || !v.every(Number.isInteger) || v.some((m, k) => k && m <= v[k - 1]) || v[0] < 40 || v[3] > 72) bad.push(`accordo ${name}: tappeto ${JSON.stringify(v)}`);
      if (!Number.isInteger(c.bass) || c.bass < 28 || c.bass > 48) bad.push(`accordo ${name}: basso ${c.bass}`);
    }
    for (const kind of ['A', 'B']) {
      const prog = p.PROG[kind];
      if (!Array.isArray(prog) || prog.length !== 8) bad.push(`giro ${kind} di ${prog && prog.length} battute`);
      else for (const cell of prog.flat()) if (!p.CH[cell]) bad.push(`giro ${kind}: accordo ${cell} senza voci`);
      if (!INSTR.has(p.lead[kind])) bad.push(`melodia ${kind} sullo strumento ${p.lead[kind]}`);
      if (p.second[kind] && (!INSTR.has(p.second[kind]) || !p.MELS['S' + kind])) bad.push(`seconda voce ${kind} incompleta`);
      if (!p.second[kind] && p.MELS['S' + kind]) bad.push(`seconda voce ${kind} senza strumento`);
      for (const k of [kind, 'H' + kind]) if (!p.MELS[k] || !p.MELS[k].size) bad.push(`melodia ${k} vuota`);
    }
    for (const [k, mel] of Object.entries(p.MELS)) {
      for (const [stepAt, e] of mel) {
        // la variazione dei corni suona anche un'ottava sotto; il tema eroico può avere la linea grave (L) all'ottava
        const lo = e.m - 12, hi = e.m;
        if (!Number.isInteger(e.m) || lo < 28 || hi > 96) bad.push(`${k}: nota ${e.m}`);
        if (!(e.d > 0) || !Number.isInteger(stepAt) || stepAt < 0 || stepAt + Math.round(e.d * 4) > 128) bad.push(`${k}: nota a ${stepAt}/16 lunga ${e.d} fuori dalla frase`);
      }
    }
    for (const [k, mel] of Object.entries(p.raw || {})) {
      const beats = mel.reduce((s, [, d]) => s + d, 0);
      if (Math.abs(beats - 32) > 1e-9) bad.push(`frase ${k} di ${beats} battiti invece di 32`);
    }
    check(!bad.length, `profilo ${id === null ? 'di base' : id} (${p.key}, ${p.bpm} battiti): note, accordi e frasi validi${bad.length ? ': ' + [...new Set(bad)].slice(0, 6).join('; ') : ''}`);
  }
  // Le missioni non condividono la stessa coppia tonalità-tempo (ognuna ha il suo carattere).
  const pairs = MISSIONS.map(m => `${musicProfile(m.id).key}/${musicProfile(m.id).bpm}`);
  check(new Set(pairs).size === pairs.length, `profili: le 8 missioni hanno tonalità e tempo diversi tra loro (${pairs.join(', ')})`);
  const c1 = musicProfile('contrattacco'), c2 = musicProfile('contrattacco/2');
  check(c2.base === 'contrattacco' && c1.bpm === c2.bpm && c1.tonicBass % 12 === c2.tonicBass % 12 && c2.key === 'la maggiore',
    `profili: la fase 2 di «Contrattacco» ha la stessa tonica e lo stesso tempo (${c1.key} → ${c2.key}, ${c1.bpm} → ${c2.bpm} battiti)`);
}

export function checkAlbum(check) {
  if (!existsSync(ostDir)) { console.log('skip album: dist/ost non c’è (si genera con npm run ost)'); return; }
  const files = readdirSync(ostDir), mp3 = files.filter(f => f.endsWith('.mp3')).sort();
  const numbered = mp3.every((f, i) => f.startsWith(String(i + 1).padStart(2, '0') + ' '));
  check(mp3.length === 11 && numbered && files.includes('scaletta.txt'),
    `album: dist/ost contiene 11 MP3 numerati da 01 a 11 e scaletta.txt (${mp3.length} MP3${files.includes('scaletta.txt') ? ', scaletta presente' : ', scaletta assente'})`);
  // File MP3 veri: intestazione ID3 o sincronismo di fotogramma, dimensione coerente con la durata in scaletta.
  const txt = files.includes('scaletta.txt') ? readFileSync(path.join(ostDir, 'scaletta.txt'), 'utf8') : '';
  const rows = [...txt.matchAll(/^(\d\d)\. (.+) \((\d+):(\d\d)\)\n\s+(.+)$/gm)].map(m => ({ n: +m[1], title: m[2], secs: +m[3] * 60 + +m[4], desc: m[5] }));
  const bad = [];
  for (const f of mp3) {
    const b = readFileSync(path.join(ostDir, f)), n = +f.slice(0, 2), r = rows.find(x => x.n === n);
    const head = b.subarray(0, 3).toString('latin1') === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0);
    if (!head) bad.push(`${f}: non sembra un MP3`);
    if (!r || `${String(n).padStart(2, '0')} ${r.title}.mp3` !== f) bad.push(`${f}: manca in scaletta o titolo diverso`);
    else { const est = statSync(path.join(ostDir, f)).size * 8 / 192000; if (Math.abs(est - r.secs) > 8) bad.push(`${f}: circa ${Math.round(est)} s di audio, in scaletta ${r.secs} s`); }
  }
  check(mp3.length && !bad.length, `album: ogni MP3 è un file audio valido, con titolo e durata come in scaletta (192 kbps)${bad.length ? ': ' + bad.slice(0, 4).join('; ') : ''}`);
  // Scaletta e profili raccontano la stessa musica: tracce 2–9 = missioni 1–8 (titolo, tonalità e tempo), 1 = menu,
  // 10 = «Valle liberata»; le tracce di missione durano 2–3 minuti.
  const wrong = [];
  const expect = [{ n: 1, title: 'Valle del Serra', p: musicProfile(null) },
    ...MISSIONS.map((m, i) => ({ n: i + 2, title: m.name, p: musicProfile(m.id), game: true })),
    { n: 10, title: 'Valle liberata', p: musicProfile('valle-liberata') }, { n: 11, title: 'Brigata sconfitta' }];
  for (const e of expect) {
    const r = rows.find(x => x.n === e.n);
    if (!r) { wrong.push(`traccia ${e.n} assente`); continue; }
    if (r.title !== e.title) wrong.push(`traccia ${e.n} «${r.title}» invece di «${e.title}»`);
    const key = e.n === 8 ? `da ${musicProfile('contrattacco').key} a ${musicProfile('contrattacco/2').key}` : e.p && e.p.key;
    if (e.p && !r.desc.startsWith(`${key}, ${e.p.bpm} battiti`)) wrong.push(`traccia ${e.n}: «${r.desc.slice(0, 30)}…» invece di «${key}, ${e.p.bpm} battiti»`);
    if (e.game && (r.secs < 150 || r.secs > 180)) wrong.push(`traccia ${e.n} di ${r.secs} s`);
  }
  check(rows.length === 11 && !wrong.length, `album: la scaletta ha 11 tracce con titoli, tonalità e tempi uguali ai profili del gioco${wrong.length ? ': ' + wrong.slice(0, 4).join('; ') : ''}`);
}

/* ---------- motore musicale su un OfflineAudioContext (tempo virtuale) ---------- */
// Nella pagina: tutte le sezioni di ogni profilo pianificate senza suonarle; si registrano le frequenze date agli
// oscillatori e ai filtri e ogni valore non finito passato ai parametri audio.
async function virtualRun(ids) {
  const M = window.WZM, AP = AudioParam.prototype, bad = [];
  let osc = [], flt = [];
  for (const k of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'setTargetAtTime']) {
    const f = AP[k];
    AP[k] = function (v, t, ...r) {
      if (!Number.isFinite(v) || !Number.isFinite(t) || t < 0) bad.push(`${k}(${v}, ${t})`);
      if (this.__k === 'o') osc.push(v); else if (this.__k === 'f') flt.push(v);
      return f.call(this, v, t, ...r);
    };
  }
  const vd = Object.getOwnPropertyDescriptor(AP, 'value');
  Object.defineProperty(AP, 'value', { ...vd, set(v) { if (!Number.isFinite(v)) bad.push(`value = ${v}`); if (this.__k === 'o') osc.push(v); else if (this.__k === 'f') flt.push(v); vd.set.call(this, v); } });
  const BC = BaseAudioContext.prototype, co = BC.createOscillator, cf = BC.createBiquadFilter;
  BC.createOscillator = function () { const o = co.call(this); o.frequency.__k = 'o'; return o; };
  BC.createBiquadFilter = function () { const f = cf.call(this); f.frequency.__k = 'f'; return f; };
  const summary = (v, hz) => {
    const lfo = v.filter(x => x < 20), notes = v.filter(x => x >= 20);
    return { n: v.length, lfoMin: Math.min(...lfo), lfoMax: Math.max(...lfo), min: Math.min(...notes), max: Math.max(...notes), out: notes.filter(x => x < hz[0] || x > hz[1]).length + lfo.filter(x => x < 0.05).length };
  };
  const res = {};
  const mk = o => { const c = new OfflineAudioContext(2, 2205, 22050); return M.createMusic(c, c.destination, o); };
  // Pianifica da t0 a t1 a passi di 50 ms, come il timer del gioco (anticipo 0,2 s).
  const run = (m, t0, t1, at) => { for (let t = t0; t < t1; t = +(t + 0.05).toFixed(3)) { if (at) at(t); m.update(t); m.schedule(t, t + 0.2); } };
  for (const id of ids) {
    osc = []; flt = []; bad.length = 0;
    const p = M.musicProfile(id), BAR = 240 / p.bpm, m = mk({ seed: 7, manual: true });
    m.setProfile(id, 0); m.setMode('game', 0);
    // 48 battute di calma (tutte le variazioni del tema: corno, corno all'ottava bassa, pausa), 8 di tensione,
    // 16 di battaglia (giro A e B), poi la frase di cambio di fase, vittoria, sconfitta e «Brigata sconfitta».
    const plan = [[48 * BAR, 'tension'], [56 * BAR, 'battle']];
    run(m, 0, 72 * BAR, t => { while (plan.length && plan[0][0] <= t) m.force(plan.shift()[1], t); });
    const T = 72 * BAR; m.sting('phase', T); m.setMode('win', T + 4); m.setMode('lose', T + 16); m.setMode('defeat', T + 30);
    const st = m.state();
    res[id ?? 'base'] = { osc: summary(osc, [27.5, 12000]), flt: summary(flt, [20, 11025]), bad: [...new Set(bad)].slice(0, 4), played: st.played, dropped: st.dropped, key: st.key, bpm: st.bpm, profile: st.profile };
  }
  // Menu (32 battute) e «Valle liberata»: alla fine (28 battute a 80 battiti + coda) la musica torna da sola al menu.
  {
    osc = []; flt = []; bad.length = 0;
    const m = mk({ seed: 7 });
    m.setMode('menu', 0); run(m, 0, 32 * 240 / 72);
    const t0 = 32 * 240 / 72 + 1; m.setMode('finale', t0);
    const seen = []; let tMenu = -1;
    run(m, t0, t0 + 100, t => { const s = m.state(); if (!seen.length || seen[seen.length - 1].mode !== s.mode) seen.push({ t: +(t - t0).toFixed(2), mode: s.mode, profile: s.profile, key: s.key, bpm: s.bpm }); if (tMenu < 0 && s.mode === 'menu') tMenu = t - t0; });
    res.menuFinale = { osc: summary(osc, [27.5, 12000]), flt: summary(flt, [20, 11025]), bad: [...new Set(bad)].slice(0, 4), seen, tMenu, played: m.state().played };
  }
  // «Contrattacco»: la fase 2 chiesta a metà giro entra sul primo battere del giro successivo, senza tagli.
  {
    const m = mk({ seed: 7, manual: true }), BAR = 3;
    m.setProfile('contrattacco', 0); m.setMode('game', 0);
    const ask = 11.3 * BAR; let at = -1;
    run(m, 0, 40 * BAR, t => { if (Math.abs(t - ask) < 1e-6) m.setProfile('contrattacco/2', t); if (at < 0 && m.state().profile === 'contrattacco/2') at = t; });
    res.stage2 = { ask, at, profile: m.state().profile, key: m.state().key, bpm: m.state().bpm, timeline: m.timeline.filter(e => e.mode || e.profile) };
  }
  return res;
}

export async function checkVirtual(browser, check) {
  const js = (await build({ entryPoints: [path.join(root, 'client/music.js')], bundle: true, format: 'iife', globalName: 'WZM', write: false, target: 'es2020' })).outputFiles[0].text;
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setContent('<!doctype html><title>musica</title>');
  await page.addScriptTag({ content: js });
  const ids = [null, ...MUSIC_PROFILES.filter(id => id !== 'valle-liberata')];
  const t0 = Date.now();
  const r = await page.evaluate(virtualRun, ids);
  for (const id of ids) {
    const x = r[id ?? 'base'], p = musicProfile(id);
    const ok = !x.bad.length && !x.osc.out && !x.flt.out && Number.isFinite(x.osc.min) && x.played > 500 && x.profile === p.id && x.key === p.key && x.bpm === p.bpm;
    check(ok, `suono ${id ?? 'di base'}: calma, tensione, battaglia e frasi senza valori non validi, oscillatori tra ${x.osc.min.toFixed(1)} e ${Math.round(x.osc.max)} Hz (vibrato ${x.osc.lfoMin.toFixed(1)}–${x.osc.lfoMax.toFixed(1)} Hz), filtri tra ${Math.round(x.flt.min)} e ${Math.round(x.flt.max)} Hz (${x.played} note, ${x.dropped} scartate per il limite di voci)${x.bad.length ? '; valori non validi: ' + x.bad.join(', ') : ''}${x.osc.out || x.flt.out ? `; fuori dai limiti: ${x.osc.out} oscillatori, ${x.flt.out} filtri` : ''}`);
  }
  const f = r.menuFinale, fin = f.seen.find(s => s.mode === 'finale'), back = f.seen.find(s => s.mode === 'menu');
  check(!f.bad.length && !f.osc.out && !f.flt.out, `suono del menu e di «Valle liberata»: frequenze valide (oscillatori ${f.osc.min.toFixed(1)}–${Math.round(f.osc.max)} Hz)${f.bad.length ? '; ' + f.bad.join(', ') : ''}`);
  check(fin && fin.profile === 'valle-liberata' && fin.key === 're maggiore' && fin.bpm === 80 && back && back.profile === null && back.key === 're minore' && back.bpm === 72 && f.tMenu >= 84 && f.tMenu <= 92,
    `«Valle liberata» (${fin ? `${fin.key}, ${fin.bpm} battiti` : 'non partita'}) finisce e torna da sola il tema del menu dopo ${f.tMenu < 0 ? 'più di 100' : sec(f.tMenu)} s (atteso 28 battute a 80 battiti + coda, 84–92 s)`);
  const s2 = r.stage2, wait = s2.at - s2.ask, cycle = 8 * 3, onCycle = Math.abs(s2.at / cycle - Math.round(s2.at / cycle)) * cycle;
  const cuts = s2.timeline.filter(e => e.mode).length;
  check(s2.at > 0 && s2.profile === 'contrattacco/2' && s2.key === 'la maggiore' && s2.bpm === 80 && wait > 0 && wait <= cycle + 0.25 && onCycle <= 0.25 && cuts === 1,
    `«Contrattacco» (tempo virtuale): la fase 2 chiesta a ${sec(s2.ask)} s entra a ${sec(s2.at)} s, all’inizio del giro (scarto ${onCycle.toFixed(2)} s), senza ripartire da capo (${s2.key}, ${s2.bpm} battiti)`);
  check(!errors.length, `motore musicale in tempo virtuale: nessun errore (${sec((Date.now() - t0) / 1000)} s)${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await page.close();
}

/* ---------- nel gioco costruito ---------- */
export async function runOstChecks({ browser, url, check, profiles }) {
  checkProfiles(check);
  checkAlbum(check);
  await checkVirtual(browser, check);
  const B = musicProfile(null);
  const isBase = m => m.profile === null && m.key === B.key && m.bpm === B.bpm;
  for (const [name, opts] of profiles) {
    const touch = !!opts.hasTouch, full = name === 'desktop';
    const { ctx, page, errors } = await newPage(browser, opts);
    await prepare(page, url, true);

    // Menu: dopo il primo gesto suona il tema del menu sul materiale di base.
    await press(page, touch, '#ovt');
    const tMenu = await waitMusic(page, m => m.mode === 'menu' && m.played > 0, 5);
    const m0 = await music(page);
    check(tMenu >= 0 && isBase(m0), `${name}: nel menu suona il tema del menu sul materiale di base (${desc(m0)}, prime note dopo ${tMenu < 0 ? 'più di 5' : sec(tMenu)} s)`);

    // Le 8 missioni, una dopo l'altra dal menu, ognuna con il suo profilo; tra una e l'altra il menu.
    const hang = [], grids = [];
    for (let i = 0; i < MISSIONS.length; i++) {
      const M = MISSIONS[i], P = musicProfile(M.id);
      const { brief, T } = await playMission(page, touch, i);
      check(brief.ov === 'brief' && brief.mission === M.id && brief.mode === 'menu' && isBase(brief),
        `${name}: nel briefing della missione ${i + 1} resta il tema del menu (modo ${brief.mode}, ${desc(brief)})`);
      const tP = await waitMusic(page, m => m.mode === 'game' && m.profile === M.id, 3);
      const m = await music(page);
      check(T >= 0 && tP >= 0 && m.key === P.key && m.bpm === P.bpm,
        `${name}: missione ${i + 1} «${M.name}»: la musica usa il suo profilo (${desc(m)}; atteso ${P.key}, ${P.bpm} battiti)`);
      // Tempo vero (sul computer): gli attacchi delle note cadono sui sedicesimi di quel tempo, non su quelli del menu.
      // Si aspettano 16 attacchi distinti, al massimo 10 s: la calma è rada (a 60 e 64 battiti, con il tema a frasi
      // spezzate o senza note di passaggio, in 10 s ce ne sono anche solo 5-11); ne bastano 5.
      if (full) {
        const t0g = Date.now();
        while (Date.now() - t0g < 10000 && (await page.evaluate(t => window.__ost.onsets(t).length, T + 0.5)) < 16) await page.waitForTimeout(200);
        const g = await page.evaluate(([t0, b]) => window.__ost.grid(t0, Infinity, b), [T + 0.5, [P.bpm, 72]]);
        grids.push(`${i + 1}: ${Math.round(g.ratio[P.bpm] * 100)}%${P.bpm !== 72 ? `/${Math.round(g.ratio[72] * 100)}%` : ''}`);
        check(g.n >= 5 && g.ratio[P.bpm] >= 0.9 && (P.bpm === 72 || g.ratio[72] <= 0.75),
          `${name}: missione ${i + 1}: i ${g.n} attacchi di nota pianificati seguono ${P.bpm} battiti al minuto (${Math.round(g.ratio[P.bpm] * 100)}% sulla griglia${P.bpm !== 72 ? `, ${Math.round(g.ratio[72] * 100)}% su quella del menu a 72` : ''})`);
      }
      const h = await page.evaluate(t => window.__ost.hanging(t), T);
      hang.push({ where: `menu → missione ${i + 1}`, ...h });

      if (M.id === 'contrattacco' && full) {
        // Fase 2: la resistenza finisce ora (stesso cambio di fase del motore), il profilo trionfale entro un giro.
        const ask = await page.evaluate(() => {
          const S = window.__wz.S; S.objective.secs = Math.ceil(S.time) + 0.5;
          return window.__ost.now();
        });
        const t2 = await waitMusic(page, m => m.profile === 'contrattacco/2', 8 * 3 + 4);
        const st = await page.evaluate(() => ({ ...window.__wz.music(), stage: window.__wz.S.objective.stage }));
        const P2 = musicProfile('contrattacco/2');
        const sh = await page.evaluate(t => window.__ost.shortened(t), T + 0.5);
        check(st.stage === 2 && t2 >= 0 && t2 <= 8 * 3 + 1.5 && st.mode === 'game' && st.key === P2.key && st.bpm === P2.bpm && sh === 0,
          `${name}: «Contrattacco», obiettivo alla fase 2: il profilo diventa contrattacco/2 dopo ${t2 < 0 ? 'più di 28' : sec(t2)} s (al massimo un giro, 24 s), ${desc(st)}, senza tagliare le note (${sh} note accorciate)`);
      }

      const T2 = await leaveToMenu(page, touch);
      await untilAudio(page, T2 + 1.2);
      const mm = await music(page);
      check(T2 >= 0 && mm.mode === 'menu' && isBase(mm), `${name}: lasciata la missione ${i + 1}, nel menu torna il materiale di base (${desc(mm)})`);
      hang.push({ where: `missione ${i + 1} → menu`, ...(await page.evaluate(t => window.__ost.hanging(t), T2)) });
    }
    if (grids.length) console.log(`     ${name}: attacchi sulla griglia del tempo della missione / su quella a 72: ${grids.join(', ')}`);

    // Schermaglia dopo le missioni: materiale di base, come prima del piano 06.
    {
      const w = page.evaluate(() => window.__ost.waitMode('game'));
      await press(page, touch, '#ovStart');
      const T = await w;
      await page.waitForTimeout(300);
      const m = await music(page);
      const t0g = Date.now();
      while (Date.now() - t0g < 8000 && (await page.evaluate(t => window.__ost.onsets(t).length, T + 0.5)) < 10) await page.waitForTimeout(200);
      const g = await page.evaluate(t0 => window.__ost.grid(t0, Infinity, [72]), T + 0.5);
      check(T >= 0 && m.mode === 'game' && isBase(m) && g.n >= 5 && g.ratio[72] >= 0.9,
        `${name}: la schermaglia dopo le missioni usa il materiale di base (${desc(m)}; ${Math.round(g.ratio[72] * 100)}% di ${g.n} attacchi sulla griglia a 72)`);
      hang.push({ where: 'menu → schermaglia', ...(await page.evaluate(t => window.__ost.hanging(t), T)) });
      const T2 = await leaveToMenu(page, touch);
      await untilAudio(page, T2 + 1.2);
      hang.push({ where: 'schermaglia → menu', ...(await page.evaluate(t => window.__ost.hanging(t), T2)) });
    }
    const stuck = hang.filter(h => h.ringing), vacuous = hang.filter(h => !h.wouldRing);
    check(!stuck.length && !vacuous.length,
      `${name}: a ogni cambio tra menu, missioni e schermaglia le note della sezione precedente si fermano entro 0,6 s (${hang.reduce((s, h) => s + h.wouldRing, 0)} note lunghe tagliate in ${hang.length} cambi${stuck.length ? '; ancora accese: ' + stuck.map(h => `${h.where} (${h.ringing})`).join(', ') : ''}${vacuous.length ? '; cambi senza note da tagliare: ' + vacuous.map(h => h.where).join(', ') : ''})`);

    // Fine della campagna: missione 8 vinta → «Fine della campagna» → «Valle liberata»; «Torna al menu» → menu.
    {
      await playMission(page, touch, 7);
      await page.waitForTimeout(300);
      const phase = await page.evaluate(forceDestroyWin);
      await page.waitForFunction(() => !!document.getElementById('ovFinal'), null, { timeout: 5000 }).catch(() => {});
      const tWin = await waitMusic(page, m => m.mode === 'win', 2);
      if (full) await page.waitForTimeout(2500);   // un giocatore legge il rapporto: la frase di vittoria suona ancora
      await press(page, touch, '#ovFinal');
      const tFin = await waitMusic(page, m => m.mode === 'finale', 2);
      const f = await page.evaluate(() => ({ ...window.__wz.music(), ov: window.__wz.ui.overlay }));
      const VL = musicProfile('valle-liberata');
      check(phase === 'won' && tWin >= 0 && tFin >= 0 && f.ov === 'final' && f.profile === 'valle-liberata' && f.key === VL.key && f.bpm === VL.bpm,
        `${name}: la schermata finale della campagna suona «Valle liberata» (schermata ${f.ov}, modo ${f.mode}, ${desc(f)})`);
      if (full) {
        // le prime note arrivano dopo la frase di vittoria; poi seguono gli 80 battiti del finale
        const p0 = f.played;
        const tNotes = await waitMusic(page, m => m.mode === 'finale' && m.played > p0 + 10, 12);
        const t1 = await acNow(page);
        await page.waitForTimeout(3300);
        const g = await page.evaluate(t0 => window.__ost.grid(t0, Infinity, [80, 72]), t1);
        check(tNotes >= 0 && g.n >= 5 && g.ratio[80] >= 0.9 && g.ratio[72] <= 0.75,
          `${name}: «Valle liberata» suona davvero (note nuove dopo ${tNotes < 0 ? 'più di 12' : sec(tNotes)} s, ${Math.round(g.ratio[80] * 100)}% di ${g.n} attacchi sulla griglia a 80, ${Math.round(g.ratio[72] * 100)}% su quella a 72)`);
      }
      const w = page.evaluate(() => window.__ost.waitMode('menu'));
      await press(page, touch, '#ovMenu');
      const T = await w;
      const p1 = (await music(page)).played;
      const tm = await waitMusic(page, m => m.mode === 'menu' && m.played > p1, 4);
      const mm = await page.evaluate(() => ({ ...window.__wz.music(), ov: window.__wz.ui.overlay }));
      await untilAudio(page, T + 1.2);
      const h = await page.evaluate(t => window.__ost.hanging(t), T);
      check(T >= 0 && tm >= 0 && mm.ov === 'start' && isBase(mm) && !h.ringing,
        `${name}: «Torna al menu» dalla fine della campagna riporta il tema del menu (${desc(mm)}, note nuove dopo ${tm < 0 ? 'più di 4' : sec(tm)} s, ${h.ringing} note del finale ancora accese)`);
    }
    check(!errors.length, `${name}: nessun errore in console tra menu, missioni, schermaglia e finale${errors.length ? ': ' + errors.join(' | ') : ''}`);
    await ctx.close();

    // Musica spenta: nessuna nota pianificata nel menu, in due missioni diverse e in schermaglia; riaccesa in
    // missione, riparte con il profilo di quella missione.
    {
      const { ctx, page, errors } = await newPage(browser, opts);
      await prepare(page, url, false);
      await press(page, touch, '#ovt');
      await page.waitForTimeout(800);
      const seen = [];
      const snap = async where => { const m = await music(page); seen.push({ where, played: m.played || 0, notes: m.notes || 0, timer: m.timer, mode: m.mode }); };
      await snap('menu');
      for (const i of [0, 6]) {
        await playMission(page, touch, i);
        await page.waitForTimeout(1500);
        await snap(`missione ${i + 1}`);
        if (i === 0) { await leaveToMenu(page, touch); await page.waitForTimeout(500); await snap('menu'); }
      }
      const loud = seen.filter(s => s.played || s.notes || s.timer || (s.mode && s.mode !== 'off'));
      const m = await music(page);
      check(!m.on && m.ctx === 'running' && !loud.length,
        `${name}: con la musica spenta nessuna nota pianificata, anche cambiando missione (${seen.map(s => `${s.where}: ${s.played}`).join(', ')}; contesto ${m.ctx})`);
      // riaccesa da «Comandi» durante «Contrattacco»
      await openMenu(page);
      await press(page, touch, '#btnHelp');
      await press(page, touch, '#ovMusic');
      const tOn = await waitMusic(page, x => x.on && x.played > 0, 5);
      const on = await music(page);
      const P = musicProfile('contrattacco');
      check(tOn >= 0 && on.mode === 'game' && on.profile === 'contrattacco' && on.key === P.key && on.bpm === P.bpm,
        `${name}: riaccesa la musica in «Contrattacco», riparte con il profilo della missione (${desc(on)}, note dopo ${tOn < 0 ? 'più di 5' : sec(tOn)} s)`);
      await page.keyboard.press('Escape');
      check(!errors.length, `${name}: nessun errore in console con la musica spenta${errors.length ? ': ' + errors.join(' | ') : ''}`);
      await ctx.close();
    }
  }
}

// Lancio da solo: node tests/e2e/ost.mjs (dopo npm run build).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const url = pathToFileURL(path.join(root, 'dist/index.html')).href;
  const failures = [];
  const check = (ok, msg) => { if (!ok) failures.push(msg); console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); };
  const landscape = { ...devices['Pixel 7'], viewport: { width: 851, height: 393 }, screen: { width: 851, height: 393 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
  const profiles = [['desktop', { viewport: { width: 1280, height: 800 } }], ['telefono', devices['Pixel 7']], ['telefono-orizzontale', landscape]];
  const only = process.env.E2E_PROFILE;
  const browser = await chromium.launch();
  const t0 = Date.now();
  await runOstChecks({ browser, url, check, profiles: profiles.filter(([n]) => !only || n === only) });
  await browser.close();
  console.log(`(${sec((Date.now() - t0) / 1000)} s)`);
  if (failures.length) { console.error(`\n${failures.length} controlli falliti.`); process.exit(1); }
  console.log('\nTutti i controlli della colonna sonora della campagna sono passati.');
}
