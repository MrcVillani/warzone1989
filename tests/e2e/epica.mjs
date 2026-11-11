// Prove della scala di epicità della colonna sonora (piano 07):
//   1. le 8 missioni hanno i gradini 1–8 in ordine; «Contrattacco» fase 2 e «Valle liberata» almeno 7; menu e
//      schermaglia restano fuori scala (epic 0), come prima;
//   2. monotonia: gli strati (layers, strata.calma, strata.battaglia) di ogni gradino contengono quelli del gradino
//      precedente e ne aggiungono; il culmine c'è solo dal gradino 6;
//   3. motivo della Brigata (gradi 1–4–3–5): assente al gradino 1, 2 note ai gradini 2–3, 3 ai 4–5, completo dal 6;
//      in «Contrattacco» fase 2 è il tema trionfale; nella calma i corni lo suonano davvero dove il profilo dice;
//   4. culmine: mai sotto il gradino 6 (né con force('climax') né con scontri durissimi); dal 6 entra con
//      force('climax') e da solo con intensità sopra 0,9 dopo 4 s di battaglia, ed esce sotto 0,6;
//   5. su OfflineAudioContext (44,1 kHz, volume al massimo): picco sotto −1 dBFS in battaglia e nel culmine a ogni
//      gradino, RMS della battaglia entro 3 dB dal gradino 1 all'8, culmine da −1 a +3 dB sulla battaglia, voci
//      contemporanee ≤ 56, densità che cresce (strati attivi a ogni gradino; note per battuta come tendenza);
//      le rese girano su 4 pagine in parallelo (circa 90 s in tutto);
//   6. dist/ost/scaletta.txt riporta «Epicità N su 8.» uguale ai profili (salta se l'album non c'è);
//   7. nel gioco costruito: aprendo le missioni 1, 6 e 8 musicState().epic è 1, 6 e 8; nel menu e in schermaglia 0;
//      nessun errore in console.
// Le richiama smoke.mjs (npm run e2e); si possono lanciare anche da sole: npm run build && node tests/e2e/epica.mjs
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';
import { musicProfile, MUSIC_PROFILES, BRIGATA, MUSIC_LIMITS } from '../../client/music.js';
import { MISSIONS } from '../../engine/index.js';
import { newPage, prepare, playMission, leaveToMenu, press, waitMusic, music } from './ost.mjs';

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sec = v => v.toFixed(1).replace('.', ',');
const db = v => (20 * Math.log10(Math.max(v, 1e-9))).toFixed(1).replace('.', ',');
const MOTIF_STEP = [0, 6, 8, 12];   // sedicesimo d'attacco di ogni nota del motivo nella battuta (client/music.js)
const ids = () => MISSIONS.map(m => m.id);

/* ---------- 1–3: profili (Node) ---------- */
export function checkEpicProfiles(check) {
  const ep = ids().map(id => musicProfile(id).epic);
  check(ep.join() === '1,2,3,4,5,6,7,8', `epicità: le 8 missioni hanno i gradini 1–8 in ordine (${ep.join(', ')})`);
  const c2 = musicProfile('contrattacco/2').epic, vl = musicProfile('valle-liberata').epic;
  check(c2 >= 7 && vl >= 7, `epicità: «Contrattacco» fase 2 (${c2}) e «Valle liberata» (${vl}) almeno al gradino 7`);
  const base = musicProfile(null), unk = musicProfile('missione-inesistente');
  check(!base.epic && !base.layers.length && !base.motif && base.trim === 1 && base.hall === 1 && unk === base,
    `epicità: menu e schermaglia (profilo di base) restano fuori scala (epic ${base.epic}, ${base.layers.length} strati, motivo ${base.motif ? 'presente' : 'assente'}, guadagno ${base.trim}, sala ${base.hall})`);
  // ogni profilo ha il gradino tra 1 e 8 e strati coerenti con il suo gradino
  const bad = MUSIC_PROFILES.filter(id => { const p = musicProfile(id); return !(Number.isInteger(p.epic) && p.epic >= 1 && p.epic <= 8 && Array.isArray(p.layers) && p.strata && p.trim > 0 && p.trim <= 1); });
  check(!bad.length, `epicità: ogni profilo della campagna ha un gradino 1–8, strati e guadagno d'insieme validi${bad.length ? ' (non validi: ' + bad.join(', ') + ')' : ''}`);

  // Monotonia: gradino k contiene tutto il k−1 e aggiunge qualcosa (strati in generale e nella battaglia).
  const byEp = ids().map(id => musicProfile(id)).sort((a, b) => a.epic - b.epic), lost = [], flat = [];
  for (let k = 1; k < byEp.length; k++) {
    const a = byEp[k - 1], b = byEp[k];
    for (const [what, A, B] of [['strati', a.layers, b.layers], ['calma', a.strata.calma, b.strata.calma], ['battaglia', a.strata.battaglia, b.strata.battaglia], ['culmine', a.strata.culmine, b.strata.culmine]]) {
      const miss = A.filter(x => !B.includes(x));
      if (miss.length) lost.push(`${b.epic} senza ${what} ${miss.join('/')}`);
    }
    if (b.layers.length <= a.layers.length) flat.push(`strati ${a.epic}→${b.epic}`);
    if (b.strata.battaglia.length <= a.strata.battaglia.length) flat.push(`battaglia ${a.epic}→${b.epic}`);
  }
  check(!lost.length && !flat.length,
    `epicità: ogni gradino contiene gli strati del precedente e ne aggiunge (strati ${byEp.map(p => p.layers.length).join(' < ')}; battaglia ${byEp.map(p => p.strata.battaglia.length).join(' < ')})${lost.length ? '; persi: ' + lost.join('; ') : ''}${flat.length ? '; senza aggiunte: ' + flat.join(', ') : ''}`);
  // gli strati della fase 2 e del finale sono quelli del loro gradino
  const same = (a, b) => a.layers.join() === b.layers.join() && a.strata.battaglia.join() === b.strata.battaglia.join();
  check(same(musicProfile('contrattacco/2'), byEp[c2 - 1]) && same(musicProfile('valle-liberata'), byEp[vl - 1]),
    'epicità: «Contrattacco» fase 2 e «Valle liberata» hanno gli strati del loro gradino');
  const cul = byEp.map(p => `${p.epic}:${p.strata.culmine.length}`);
  check(byEp.every(p => (p.epic >= 6) === (p.strata.culmine.length > 0)), `epicità: strati del culmine solo dal gradino 6 (${cul.join(', ')})`);

  // Motivo della Brigata: 2 note ai gradini 2–3, 3 ai 4–5, 4 dal 6; nella tonalità del profilo con i gradi 1–4–3–5
  // (la quarta può essere aumentata nel lidio, la terza maggiore nei modi maggiori), in una battuta (4 battiti).
  const wantLen = e => e >= 6 ? 4 : e >= 4 ? 3 : e >= 2 ? 2 : 0;
  const DEG = [[0], [5, 6], [3, 4], [7]];
  const mbad = [];
  for (const id of MUSIC_PROFILES) {
    const p = musicProfile(id), mo = p.motif, L = wantLen(p.epic);
    if (!L) { if (mo) mbad.push(`${id}: motivo al gradino ${p.epic}`); continue; }
    if (!mo) { mbad.push(`${id}: senza motivo`); continue; }
    if (mo.length !== L || mo.notes.length !== L || mo.beats.length !== L) mbad.push(`${id}: ${mo.length} note invece di ${L}`);
    if ((L === 4) !== (mo.form === 'completo' || mo.form === 'trionfale')) mbad.push(`${id}: forma ${mo.form} con ${L} note`);
    if (Math.abs(mo.beats.reduce((a, x) => a + x, 0) - 4) > 1e-9) mbad.push(`${id}: motivo di ${mo.beats.reduce((a, x) => a + x, 0)} battiti`);
    if (((mo.notes[0] - p.tonicBass) % 12 + 12) % 12) mbad.push(`${id}: il motivo non parte dalla tonica`);
    mo.notes.forEach((m, i) => { const iv = ((m - mo.notes[0]) % 12 + 12) % 12; if (!DEG[i].includes(iv)) mbad.push(`${id}: nota ${i + 1} a ${iv} semitoni dalla tonica`); });
    if (mo.notes.some(m => m < 48 || m > 72)) mbad.push(`${id}: motivo fuori dal registro dei corni (${mo.notes})`);
    const where = [...mo.where.A, ...mo.where.B];
    if (!where.length) mbad.push(`${id}: il motivo non ha battute`);
  }
  check(!mbad.length && BRIGATA.length === 4,
    `motivo della Brigata: assente al gradino 1, 2 note ai gradini 2–3, 3 ai 4–5, completo dal 6, gradi 1–4–3–5 in una battuta (${ids().map(id => musicProfile(id).motif ? musicProfile(id).motif.length : 0).join(', ')})${mbad.length ? ': ' + mbad.slice(0, 5).join('; ') : ''}`);
  // «Contrattacco» fase 2: il motivo diventa il tema trionfale (frase A), agli ottoni in battaglia e ai corni nella calma.
  const P2 = musicProfile('contrattacco/2'), mo2 = P2.motif;
  const head = mel => { const o = []; for (const [m] of mel) if (m != null && o[o.length - 1] !== m) o.push(m); return o.slice(0, 4); };
  const asIv = v => v.map(m => m - v[0]).join();
  const hero = head(P2.raw.HA), calm = head(P2.raw.A), want = asIv(mo2 ? mo2.notes : []);
  check(!!mo2 && mo2.form === 'trionfale' && musicProfile('contrattacco').motif.form === 'completo' && asIv(hero) === want,
    `motivo della Brigata: in «Contrattacco» fase 2 è il tema trionfale (forma ${mo2 && mo2.form}; il tema eroico degli ottoni comincia con ${hero.join('-')}, il motivo è ${mo2 && mo2.notes.join('-')})`);
  check(!!mo2 && asIv(calm) === want,
    `motivo della Brigata: in «Contrattacco» fase 2 anche il tema dei corni nella calma comincia con il motivo (comincia con ${calm.join('-')}, intervalli ${asIv(calm)}; atteso ${want})`);
}

/* ---------- 3–5: motore musicale su OfflineAudioContext (tempo virtuale e resa) ---------- */
// Nella pagina. Le note del motivo nella calma si riconoscono dalla funzione che crea l'oscillatore (hornS: il corno
// di sezione, che nella calma suona solo il motivo).
async function epicVirtual({ all }) {
  const M = window.WZM, res = { motif: {}, force: {}, auto: {}, mid: {}, ms: {} };
  let tp = performance.now();
  const lap = k => { const x = performance.now(); res.ms[k] = Math.round(x - tp); tp = x; };
  const mk = (o, sr = 22050, len = 2205) => { const c = new OfflineAudioContext(2, len, sr); return [c, M.createMusic(c, c.destination, o)]; };
  const run = (m, t0, t1, at) => { for (let t = t0; t < t1; t = +(t + 0.05).toFixed(3)) { if (at) at(t); m.update(t); m.schedule(t, t + 0.2); } };

  // motivo: 16 battute di calma (frase A e frase B), attacchi del corno di sezione
  {
    const BC = BaseAudioContext.prototype, co = BC.createOscillator, AP = AudioParam.prototype, sv = AP.setValueAtTime;
    let rec = null;
    BC.createOscillator = function () {
      const o = co.call(this);
      if (rec) {
        const fr = new Error().stack.split('\n').map(l => (/at (?:\w+\.)?([\w$]+) \(/.exec(l) || [])[1]);
        const k = fr.indexOf('osc'); const r = { by: k >= 0 ? fr[k + 1] : null, o }; o.frequency.__r = r; rec.push(r);
      }
      return o;
    };
    AP.setValueAtTime = function (v, t) { const r = this.__r; if (r && r.f == null) { r.f = v; r.t = t; } return sv.call(this, v, t); };
    for (const id of all) {
      rec = [];
      const p = M.musicProfile(id), STEP = 15 / p.bpm, [, m] = mk({ seed: 7, manual: true });
      m.setProfile(id, 0); m.setMode('game', 0);
      run(m, 0, 16 * 16 * STEP + 0.3);
      const T0 = 0.05, hs = rec.filter(r => r.by === 'hornS' && r.o.type === 'sawtooth' && r.t != null);
      res.motif[id] = hs.map(r => [Math.round((r.t - T0) / STEP), Math.round(69 + 12 * Math.log2(r.f / 440))]).filter(([s]) => s < 256).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      // quanti oscillatori sono stati attribuiti a una funzione (se è 0 la pagina non ha i nomi delle funzioni)
      res.motif.named = (res.motif.named || 0) + rec.filter(r => r.by).length;
    }
    rec = null; BC.createOscillator = co; AP.setValueAtTime = sv;
  }
  lap('motivo');

  for (const id of all) {
    const ep = M.musicProfile(id).epic;
    // culmine forzato (come l'album): entra solo dal gradino 6; 'battle' lo chiude e resta in battaglia
    {
      const [, m] = mk({ seed: 7, manual: true });
      m.setProfile(id, 0); m.setMode('game', 0);
      run(m, 0, 3); m.force('climax', 3); run(m, 3, 9);
      const on = m.state().climax, st = m.state().state;
      m.force('battle', 9); run(m, 9, 16);
      res.force[id] = { ep, on, st, after: m.state().climax, afterState: m.state().state, tl: m.timeline.filter(e => e.climax != null).map(e => ({ t: e.t, on: e.climax })) };
    }
    // culmine da solo: scontri durissimi per 24 s (intensità al massimo), poi niente
    {
      const [, m] = mk({ seed: 7 });
      m.setProfile(id, 0); m.setMode('game', 0);
      let maxI = 0;
      run(m, 0, 60, t => { if (t >= 1 && t < 25) m.hit(0.1, t); maxI = Math.max(maxI, m.state().intensity); });
      res.auto[id] = { ep, maxI, tl: m.timeline.filter(e => e.state || e.climax != null).map(e => ({ t: e.t, state: e.state, climax: e.climax, i: e.intensity })) };
    }
    // battaglia sostenuta ma sotto 0,9 (circa 0,75 per 40 s): niente culmine
    {
      const [, m] = mk({ seed: 7 });
      m.setProfile(id, 0); m.setMode('game', 0);
      let maxI = 0, bat = 0;
      run(m, 0, 45, t => { if (t >= 1) m.hit(0.0062, t); const s = m.state(); maxI = Math.max(maxI, s.intensity); if (s.state === 'battle') bat += 0.05; });
      res.mid[id] = { ep, maxI, bat, climaxes: m.timeline.filter(e => e.climax).length };
    }
  }

  lap('culmine');
  return res;
}

// Nella pagina: resa di un profilo a 44,1 kHz con il volume della musica al massimo (1; nel gioco al più 0,9).
// 2 battute di calma, 8 di battaglia misurate (dalla battuta 3: metà frase A con il motivo e la fanfara, metà frase B),
// dal gradino 6 altre 4 di culmine misurate. Il tempo di resa cresce con la durata: le finestre sono corte apposta.
async function epicRender({ id, sr: SR }) {
  const M = window.WZM, p = M.musicProfile(id), BAR = 240 / p.bpm, cl = p.epic >= 6;
  const marks = { b0: 3 * BAR, b1: 11 * BAR, c0: 12 * BAR, c1: 16 * BAR };
  const dur = (cl ? marks.c1 : marks.b1) + 0.3, n = Math.ceil(dur * SR);
  const ctx = new OfflineAudioContext(2, n, SR), m = M.createMusic(ctx, ctx.destination, { seed: 1989, manual: true, volume: 1 });
  m.setProfile(id, 0); m.setMode('game', 0);
  const plan = [[2 * BAR - 1.2, 'battle']]; if (cl) plan.push([11 * BAR - 1.2, 'climax']);
  const played = {};
  for (let t = 0; t < dur; t = +(t + 0.05).toFixed(3)) {
    while (plan.length && plan[0][0] <= t) m.force(plan.shift()[1], t);
    for (const [k, v] of Object.entries(marks)) if (played[k] == null && t >= v) played[k] = m.state().played;
    m.update(t); m.schedule(t, t + 0.2);
  }
  const st = m.state(), t0 = performance.now();
  const buf = await ctx.startRendering();
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  const span = (a, b) => {
    const s0 = Math.floor(a * SR), s1 = Math.min(n, Math.floor(b * SR)); let pk = 0, q = 0, bad = 0;
    for (let i = s0; i < s1; i++) { const l = L[i], r = R[i]; if (!Number.isFinite(l) || !Number.isFinite(r)) { bad++; continue; } pk = Math.max(pk, Math.abs(l), Math.abs(r)); q += l * l + r * r; }
    return { peak: pk, rms: Math.sqrt(q / (2 * Math.max(1, s1 - s0))), bad };
  };
  return {
    ep: p.epic, bpm: p.bpm, battle: span(marks.b0, marks.b1), climax: cl ? span(marks.c0 + 1, marks.c1) : null, all: span(0, dur),
    nBattle: (played.b1 - played.b0) / 8, nClimax: cl ? (played.c1 - played.c0) / 4 : null,
    voices: st.peak, dropped: st.dropped, played: st.played, ms: Math.round(performance.now() - t0), secs: dur,
    climaxOn: m.timeline.some(e => e.climax),
  };
}

export async function checkEpicVirtual(browser, check) {
  const js = (await build({ entryPoints: [path.join(root, 'client/music.js')], bundle: true, format: 'iife', globalName: 'WZM', write: false, target: 'es2020' })).outputFiles[0].text;
  const errors = [];
  const open = async () => {
    const ctx = await browser.newContext(), page = await ctx.newPage();   // un contesto per pagina: processi separati
    page.on('pageerror', e => errors.push(e.message));
    await page.setContent('<!doctype html><title>epicità</title>');
    await page.addScriptTag({ content: js });
    return { ctx, page };
  };
  const mids = ids(), all = [...mids, 'contrattacco/2'], t0 = Date.now(), sr = +process.env.EPICA_SR || 44100;
  // rese in parallelo (4 pagine, dalle più lunghe) mentre una quinta pagina fa le prove in tempo virtuale
  const queue = [...all].sort((a, b) => musicProfile(b).epic - musicProfile(a).epic), render = {};
  const worker = async () => { const { ctx, page } = await open(); for (let id; (id = queue.shift());) render[id] = await page.evaluate(epicRender, { id, sr }); await ctx.close(); };
  const logic = (async () => { const { ctx, page } = await open(); const x = await page.evaluate(epicVirtual, { all }); await ctx.close(); return x; })();
  await Promise.all([1, 2, 3, 4].map(worker));
  const r = await logic; r.render = render;
  const tSec = (Date.now() - t0) / 1000;
  console.log(`     tempi: prove in tempo virtuale ${Object.entries(r.ms).map(([k, v]) => `${k} ${sec(v / 1000)} s`).join(', ')}; rese (${sr} Hz, secondi di musica / secondi di resa) ${all.map(id => `${render[id].ep} ${Math.round(render[id].secs)}/${Math.round(render[id].ms / 1000)}`).join(', ')}`);

  // 3. il motivo suona nella calma esattamente dove e come dice il profilo
  {
    const bad = [];
    for (const id of all) {
      const p = musicProfile(id), mo = p.motif, want = [];
      if (mo) for (const [kind, off] of [['A', 0], ['B', 8]]) for (const bar of mo.where[kind])
        for (let i = 0; i < mo.length; i++) { const s = (bar + off) * 16 + MOTIF_STEP[i]; want.push([s, mo.notes[i]]); if (p.epic >= 6) want.push([s, mo.notes[i] + 12]); }
      want.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const got = r.motif[id];
      if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(`${id}: ${got.length} note del corno di sezione (${got.slice(0, 4).map(x => x.join('/')).join(' ')}…) invece di ${want.length}`);
    }
    check(r.motif.named > 0 && !bad.length,
      `motivo della Brigata (tempo virtuale): nella calma i corni lo suonano solo dove previsto, con le note del profilo (note per missione: ${mids.map(id => r.motif[id].length).join(', ')})${bad.length ? ': ' + bad.slice(0, 4).join('; ') : ''}${r.motif.named ? '' : '; funzioni degli oscillatori non riconosciute'}`);
  }

  // 4. culmine
  {
    const lowF = mids.filter(id => r.force[id].ep < 6 && (r.force[id].on || r.force[id].tl.length));
    const hiF = mids.filter(id => r.force[id].ep >= 6 && !(r.force[id].on && r.force[id].st === 'battle' && !r.force[id].after && r.force[id].afterState === 'battle'));
    check(!lowF.length && !hiF.length,
      `culmine forzato: sotto il gradino 6 force('climax') non fa nulla, dal 6 porta battaglia e culmine e force('battle') lo chiude restando in battaglia${lowF.length ? '; entra in ' + lowF.join(', ') : ''}${hiF.length ? '; non funziona in ' + hiF.join(', ') : ''}`);
    const lowA = mids.filter(id => r.auto[id].ep < 6 && r.auto[id].tl.some(e => e.climax != null));
    check(!lowA.length && mids.every(id => r.auto[id].maxI > 0.9 && r.auto[id].tl.some(e => e.state === 'battle')),
      `culmine da solo: sotto il gradino 6 non entra nemmeno con 24 s di scontri al massimo (intensità fino a ${Math.max(...mids.map(id => r.auto[id].maxI)).toFixed(2).replace('.', ',')})${lowA.length ? '; entra in ' + lowA.join(', ') : ''}`);
    const desc = [], bad = [];
    for (const id of mids.filter(id => r.auto[id].ep >= 6)) {
      const tl = r.auto[id].tl, bat = tl.find(e => e.state === 'battle'), on = tl.find(e => e.climax === true), off = tl.find(e => e.climax === false);
      if (!bat || !on || !off) { bad.push(`${id}: ${on ? 'non esce' : 'non entra'}`); continue; }
      const after = on.t - bat.t;
      desc.push(`${r.auto[id].ep}: entra dopo ${sec(after)} s di battaglia a ${on.i.toFixed(2)}, esce a ${off.i.toFixed(2)} (${sec(off.t)} s)`);
      if (!(after > 4 && after < 6 && on.i > 0.9)) bad.push(`${id}: entra dopo ${sec(after)} s a ${on.i}`);
      if (!(off.i < 0.6 && off.t > 25 && off.t - on.t > 6)) bad.push(`${id}: esce a ${off.i} (${sec(off.t)} s)`);
      if (tl.filter(e => e.climax === true).length !== 1) bad.push(`${id}: ${tl.filter(e => e.climax === true).length} culmini`);
      const back = tl.filter(e => e.state && e.t >= off.t);
      if (!back.length || back[back.length - 1].state === 'battle') bad.push(`${id}: dopo il culmine la musica non si calma`);
    }
    check(!bad.length && desc.length === 3,
      `culmine da solo dal gradino 6: entra con intensità sopra 0,9 dopo più di 4 s di battaglia, esce sotto 0,6 e poi la musica si calma (${desc.join('; ')})${bad.length ? ': ' + bad.join('; ') : ''}`);
    const midBad = mids.filter(id => r.mid[id].climaxes || r.mid[id].maxI >= 0.9 || r.mid[id].bat < 20);
    check(!midBad.length,
      `culmine: con una battaglia lunga ma sotto 0,9 (intensità fino a ${Math.max(...mids.map(id => r.mid[id].maxI)).toFixed(2).replace('.', ',')}, ${Math.round(Math.min(...mids.map(id => r.mid[id].bat)))} s di battaglia) non entra a nessun gradino${midBad.length ? ': ' + midBad.map(id => `${id} (${r.mid[id].climaxes} culmini, ${r.mid[id].maxI})`).join(', ') : ''}`);
  }

  // 5. livelli, voci e densità
  {
    const CEIL = Math.pow(10, -1 / 20), rows = all.map(id => [id, r.render[id]]);
    const hot = rows.filter(([, x]) => !(x.battle.peak < CEIL && (!x.climax || x.climax.peak < CEIL) && x.all.peak < CEIL && !x.all.bad && !x.battle.bad && !(x.climax && x.climax.bad)));
    check(!hot.length,
      `livelli (OfflineAudioContext, volume al massimo): picco sotto −1 dBFS a ogni gradino, in battaglia e nel culmine (battaglia ${rows.map(([, x]) => db(x.battle.peak)).join(' / ')} dBFS; culmine ${rows.filter(([, x]) => x.climax).map(([, x]) => db(x.climax.peak)).join(' / ')} dBFS)${hot.length ? '; sopra: ' + hot.map(([id]) => id).join(', ') : ''}`);
    const rms = mids.map(id => 20 * Math.log10(r.render[id].battle.rms)), spread = Math.max(...rms) - Math.min(...rms);
    const d18 = Math.abs(rms[7] - rms[0]);
    check(d18 <= 3 && spread <= 3,
      `livelli: RMS della battaglia entro 3 dB dal gradino 1 all'8 (${rms.map(v => v.toFixed(1).replace('.', ',')).join(' / ')} dBFS; tra 1 e 8 ${d18.toFixed(1).replace('.', ',')} dB, tra il più basso e il più alto ${spread.toFixed(1).replace('.', ',')} dB)`);
    const cl = all.filter(id => r.render[id].climax).map(id => [id, 20 * Math.log10(r.render[id].climax.rms) - 20 * Math.log10(r.render[id].battle.rms)]);
    const vmax = Math.max(...all.map(id => r.render[id].voices));
    check(vmax <= MUSIC_LIMITS.voices && MUSIC_LIMITS.voices === 56,
      `voci: al massimo ${vmax} contemporanee (limite ${MUSIC_LIMITS.voices}) a ogni gradino, anche nel culmine (per gradino ${mids.map(id => r.render[id].voices).join(', ')}; note scartate ${mids.map(id => r.render[id].dropped).join(', ')})`);
    const nb = mids.map(id => r.render[id].nBattle), strat = mids.map(id => musicProfile(id).strata.battaglia.length);
    // densità: gli strati attivi in battaglia crescono a ogni gradino; le note per battuta dipendono anche dal carattere
    // della missione (tempo, ostinato, battaglia a mezzo tempo), quindi se ne controlla la tendenza: correlazione di
    // rango con il gradino almeno 0,8, l'ultimo terzo sopra il primo terzo di almeno il 30%, l'8 sopra l'1
    const rank = v => v.map(x => v.filter(y => y < x).length + 1);
    const rk = rank(nb), rho = 1 - 6 * rk.reduce((q, x, i) => q + (x - (i + 1)) ** 2, 0) / (8 * 63);
    const avg = a => a.reduce((q, x) => q + x, 0) / a.length;
    const dips = nb.map((v, i) => i && v < Math.max(...nb.slice(0, i)) ? i + 1 : 0).filter(Boolean);
    check(strat.every((v, i) => !i || v > strat[i - 1]) && rho >= 0.8 && avg(nb.slice(5)) > 1.3 * avg(nb.slice(0, 3)) && nb[7] > nb[0],
      `densità: in battaglia crescono con il gradino gli strati attivi (${strat.join(' < ')}) e le note per battuta (${nb.map(v => v.toFixed(0)).join(', ')}; correlazione di rango ${rho.toFixed(2).replace('.', ',')}, gradini 6–8 ${Math.round(100 * avg(nb.slice(5)) / avg(nb.slice(0, 3)) - 100)}% sopra i gradini 1–3)`);
    if (dips.length) console.log(`     nota: note per battuta sotto un gradino precedente ai gradini ${dips.join(', ')} (carattere della missione: tempo e tipo di battaglia)`);
    // culmine: tutta l'orchestra, ma non più forte (RMS da −1 a +3 dB rispetto alla battaglia dello stesso profilo)
    const clBad = cl.filter(([id, d]) => !(r.render[id].climaxOn && d >= -1 && d <= 3));
    check(cl.length === 4 && !clBad.length,
      `livelli: il culmine resta vicino alla battaglia, senza salti di volume (${cl.map(([id, d]) => `${r.render[id].ep}${id.endsWith('/2') ? ' fase 2' : ''} ${d >= 0 ? '+' : ''}${d.toFixed(1).replace('.', ',')} dB`).join(', ')}; ammesso da −1 a +3 dB)${clBad.length ? '; fuori: ' + clBad.map(([id]) => id).join(', ') : ''}`);
    console.log(`     note per battuta in battaglia → culmine: ${all.filter(id => r.render[id].climax).map(id => `${id} ${r.render[id].nBattle.toFixed(0)} → ${r.render[id].nClimax.toFixed(0)}`).join(', ')}`);
  }
  check(!errors.length, `scala di epicità in tempo virtuale: nessun errore (${sec(tSec)} s)${errors.length ? ': ' + errors.join(' | ') : ''}`);
}

/* ---------- 6: scaletta dell'album ---------- */
export function checkEpicAlbum(check) {
  const f = path.join(root, 'dist/ost/scaletta.txt');
  if (!existsSync(f)) { console.log('skip scaletta: dist/ost/scaletta.txt non c’è (si genera con npm run ost)'); return; }
  const txt = readFileSync(f, 'utf8');
  const rows = [...txt.matchAll(/^(\d\d)\. (.+) \((\d+):(\d\d)\)\n\s+(.+)$/gm)].map(m => ({ n: +m[1], title: m[2], desc: m[5] }));
  const want = [[1, null], ...MISSIONS.map((m, i) => [i + 2, m.id]), [10, 'valle-liberata'], [11, null]], bad = [];
  for (const [n, id] of want) {
    const r = rows.find(x => x.n === n), ep = id ? musicProfile(id).epic : 0;
    const exp = ep ? `Epicità ${ep} su 8.` : 'Epicità: fuori scala.';
    if (!r) bad.push(`traccia ${n} assente`);
    else if (!r.desc.endsWith(exp) || (r.desc.match(/Epicità/g) || []).length !== 1) bad.push(`traccia ${n}: «…${r.desc.slice(-24)}» invece di «${exp}»`);
  }
  check(rows.length === 11 && !bad.length, `scaletta: ogni traccia riporta il gradino di epicità del suo profilo (missioni 1–8, «Valle liberata» 8, menu e sconfitta fuori scala)${bad.length ? ': ' + bad.slice(0, 4).join('; ') : ''}`);
}

/* ---------- 7: nel gioco costruito ---------- */
export async function runEpicChecks({ browser, url, check, profiles }) {
  checkEpicProfiles(check);
  checkEpicAlbum(check);
  await checkEpicVirtual(browser, check);
  for (const [name, opts] of profiles) {
    const touch = !!opts.hasTouch;
    const { ctx, page, errors } = await newPage(browser, opts);
    await prepare(page, url, true);
    await press(page, touch, '#ovt');
    const tm = await waitMusic(page, m => m.mode === 'menu' && m.played > 0, 5);
    const m0 = await music(page);
    const seen = [`menu ${m0.epic}`], bad = [];
    if (tm < 0 || m0.epic !== 0) bad.push(`menu: epic ${m0.epic}`);
    for (const i of [0, 5, 7]) {
      const M = MISSIONS[i], want = musicProfile(M.id).epic;
      await playMission(page, touch, i);
      const t = await waitMusic(page, m => m.mode === 'game' && m.profile === M.id && m.played > 0, 4);
      const m = await music(page);
      seen.push(`missione ${i + 1} ${m.epic}`);
      if (t < 0 || m.epic !== want || m.epic !== i + 1 || m.climax !== false) bad.push(`missione ${i + 1}: epic ${m.epic} (atteso ${want}), culmine ${m.climax}`);
      await leaveToMenu(page, touch);
      await waitMusic(page, m => m.mode === 'menu' && m.profile === null, 3);
      const mm = await music(page);
      if (mm.epic !== 0) bad.push(`menu dopo la missione ${i + 1}: epic ${mm.epic}`);
    }
    // schermaglia: fuori scala, come prima
    await press(page, touch, '#ovStart');
    const ts = await waitMusic(page, m => m.mode === 'game' && m.played > 0, 4);
    const ms = await music(page);
    seen.push(`schermaglia ${ms.epic}`);
    if (ts < 0 || ms.profile !== null || ms.epic !== 0) bad.push(`schermaglia: profilo ${ms.profile}, epic ${ms.epic}`);
    check(!bad.length, `${name}: nel gioco musicState().epic segue la missione aperta (${seen.join(', ')})${bad.length ? ': ' + bad.join('; ') : ''}`);
    check(!errors.length, `${name}: nessun errore in console aprendo le missioni 1, 6 e 8 e la schermaglia${errors.length ? ': ' + errors.join(' | ') : ''}`);
    await ctx.close();
  }
}

// Lancio da solo: node tests/e2e/epica.mjs (dopo npm run build).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const url = pathToFileURL(path.join(root, 'dist/index.html')).href;
  const failures = [];
  const check = (ok, msg) => { if (!ok) failures.push(msg); console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); };
  const landscape = { ...devices['Pixel 7'], viewport: { width: 851, height: 393 }, screen: { width: 851, height: 393 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
  const profiles = [['desktop', { viewport: { width: 1280, height: 800 } }], ['telefono', devices['Pixel 7']], ['telefono-orizzontale', landscape]];
  const only = process.env.E2E_PROFILE;
  const browser = await chromium.launch();
  const t0 = Date.now();
  await runEpicChecks({ browser, url, check, profiles: profiles.filter(([n]) => !only || n === only) });
  await browser.close();
  console.log(`(${sec((Date.now() - t0) / 1000)} s)`);
  if (failures.length) { console.error(`\n${failures.length} controlli falliti.`); process.exit(1); }
  console.log('\nTutti i controlli della scala di epicità sono passati.');
}
