// Album della colonna sonora (piani 06 e 07): «Warzone 1989 · Operazione Valle Grigia (colonna sonora originale)».
// Registra le 11 tracce con lo stesso motore del gioco (client/music.js) dentro Chromium, con OfflineAudioContext
// (44,1 kHz, stereo), le codifica in MP3 a 192 kbps con i tag ID3 e scrive in dist/ost/ i file «01 Valle del
// Serra.mp3» … «11 Brigata sconfitta.mp3» più scaletta.txt (copertina testuale, titoli, durate, descrizioni).
// Ogni traccia si controlla dopo la codifica (il file MP3 si decodifica di nuovo nel browser): picco sotto −1 dBFS,
// nessun silenzio anomalo, nessun clic, durata nei limiti. Se un controllo non passa lo script esce con errore.
// Ogni brano di missione ha il suo gradino di epicità (piano 07, dal profilo in client/music.js), riportato in scaletta;
// dal gradino 6 l'arco passa anche per il culmine (calma → tensione → battaglia → culmine → battaglia → calma).
// DETTAGLI=1 stampa anche il livello efficace ogni 10 s e per tratto dell'arco.
// Uso: npm run ost            (richiede Playwright con Chromium, come npm run e2e)
//      npm run ost -- 3 8     solo le tracce 3 e 8
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';
import { Mp3Encoder } from '@breezystack/lamejs';
import { musicProfile } from '../client/music.js';

// Playwright si carica con require, come nei test end-to-end: così vale anche l'installazione globale del sistema.
const { chromium } = createRequire(import.meta.url)('playwright');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'dist/ost');
const ALBUM = 'Warzone 1989 · Operazione Valle Grigia (colonna sonora originale)';
const ARTIST = 'Warzone 1989';
const SR = 44100, KBPS = 192;
const CEIL_DB = -2;     // picco massimo dopo il guadagno (il controllo finale chiede meno di −1 dBFS sul file MP3)

// Tracce: fonte (menu, missione, finale, sconfitta), durata ammessa e una riga di descrizione per la scaletta;
// climax: battute d'inizio e di fine del culmine (solo dal gradino 6).
const TRACKS = [
  { title: 'Valle del Serra', kind: 'menu', min: 90, max: 120,
    desc: 're minore, 72 battiti: il tema del menu, prima ai legni e poi ai corni, con arpa e coro lontano sul giro del menu.' },
  { title: 'Testa di ponte', kind: 'game', id: 'testa-di-ponte',
    desc: 'si minore, 64 battiti: notte sul fiume; il tema a frasi spezzate al legno, arpa rada, un piccolo gruppo e una battaglia guardinga e trattenuta.' },
  { title: 'I pozzi del guado', kind: 'game', id: 'pozzi-del-guado',
    desc: 'mi frigio, 70 battiti: il tema a note ribattute nei corni gravi sopra timpani e archi gravi in ostinato; battaglia tesa in 3+3+2 e il primo frammento del motivo della Brigata.' },
  { title: 'La colonna dei rifornimenti', kind: 'game', id: 'colonna-rifornimenti', battleEnd: 48,
    desc: 'sol minore, 96 battiti: il tema in passo di marcia al legno acuto sopra un ostinato che non si ferma mai; corni a due voci, rullante militare e tamburi da guerra.' },
  { title: 'Il passo dei larici', kind: 'game', id: 'passo-dei-larici',
    desc: 'mi bemolle maggiore, 60 battiti: corni a due voci, coro lontano, trombe e una campana lontana; battaglia pesante a mezzo tempo con i piatti in crescendo.' },
  { title: 'La diga di Serra Alta', kind: 'game', id: 'diga-serra-alta',
    desc: 'do lidio, 68 battiti: arpa ad acqua e il tema al flauto nell’acuto; coro pieno, tromboni e tuba, archi all’ottava in una sala più ampia; in battaglia un ostinato a onde.' },
  { title: 'Due fuochi', kind: 'game', id: 'due-fuochi', climax: [23, 30],
    desc: 'fa diesis minore, 84 battiti: il tema e una seconda voce per moto contrario; tamburi grandi, due sezioni di ottoni in contrappunto, il motivo della Brigata completo e il primo culmine.' },
  { title: 'Contrattacco', kind: 'game', id: 'contrattacco', stage2: 30, battleEnd: 40, climax: [33, 38],
    desc: 'da la minore a la maggiore, 80 battiti: cupo, con il coro sulla «u», archi staccati e campane finché si resiste; poi il motivo della Brigata diventa il tema trionfale, fino al culmine.' },
  { title: 'Il comando del Direttorio', kind: 'game', id: 'comando-direttorio', battleEnd: 40, climax: [27, 37],
    desc: 're minore, 88 battiti: il tema puntato dei corni, orchestra e coro al completo, ottoni all’ottava, il motivo della Brigata e il culmine dell’assalto finale.' },
  { title: 'Valle liberata', kind: 'finale', id: 'valle-liberata', min: 60, max: 90,
    desc: 're maggiore, 80 battiti: dall’alba al trionfo; il motivo della Brigata ai corni, poi a orchestra piena sul tema eroico e alle trombe sulla cadenza si bemolle – do – re.' },
  { title: 'Brigata sconfitta', kind: 'defeat', min: 30, max: 45,
    desc: 're minore, un battito al secondo: lamento sulla testa del tema, al corno e poi al legno, sopra un tamburo velato.' },
];
// Gradino di epicità dal profilo del gioco (i temi del menu e della sconfitta sono fuori dalla scala).
for (const t of TRACKS) {
  t.epic = t.id ? musicProfile(t.id).epic : 0;
  t.desc += t.epic ? ` Epicità ${t.epic} su 8.` : ' Epicità: fuori scala.';
}
for (const t of TRACKS) if (t.kind === 'game') { t.min = 150; t.max = 180; }

const only = process.argv.slice(2).map(Number).filter(Boolean);
const js = (await build({ entryPoints: [path.join(root, 'client/music.js')], bundle: true, format: 'iife', globalName: 'WZM', write: false, target: 'es2020' })).outputFiles[0].text;

// Dentro la pagina: registra la traccia, applica guadagno e dissolvenze, misura e prepara i campioni a 16 bit.
async function renderInPage(tr) {
  const SR = 44100, M0 = window.WZM;
  // durata e scaletta degli stati (in secondi) secondo il tipo di traccia
  let dur, fadeOut, plan = [], profile = null;
  if (tr.kind === 'game') {
    profile = M0.musicProfile(tr.id);
    const BAR = 240 / profile.bpm, N = Math.ceil(158 / BAR / 2) * 2, E = tr.battleEnd || 32;
    // arco: calma → tensione (battuta 10) → battaglia (16, il colpo cade sul battere) → calma (E) e dissolvenza
    plan = [[10 * BAR - 0.3, 'tension'], [16 * BAR - 1.2, 'battle'], [E * BAR - 2, 'calm']];
    if (tr.stage2) plan.push([tr.stage2 * BAR, 'stage2']);
    if (tr.climax) plan.push([tr.climax[0] * BAR - 1.2, 'climax'], [tr.climax[1] * BAR - 1, 'battle']);
    plan.sort((x, y) => x[0] - y[0]);
    dur = N * BAR + 2.5; fadeOut = 14;
  } else if (tr.kind === 'menu') { dur = 32 * 240 / 72 + 2; fadeOut = 11; }
  else if (tr.kind === 'finale') { dur = 28 * 3 + 3.5; fadeOut = 2.5; }
  else { dur = 43.5; fadeOut = 2; }
  const n = Math.ceil(SR * dur), ctx = new OfflineAudioContext(2, n, SR);
  const m = M0.createMusic(ctx, ctx.destination, { volume: 1, seed: 1989 + tr.no, manual: true });
  if (tr.kind === 'game') m.setProfile(tr.id, 0);
  m.setMode(tr.kind, 0);
  let k = 0;
  for (let t = 0; t < dur; t = +(t + 0.05).toFixed(3)) {
    while (k < plan.length && plan[k][0] <= t) {
      const [, what] = plan[k++];
      if (what === 'stage2') m.setProfile(tr.id + '/2', t); else m.force(what, t);
    }
    m.update(t); m.schedule(t, t + 0.2);
  }
  const buf = await ctx.startRendering();
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  // misure prima del guadagno
  let pk = 0, sq = 0; for (let i = 0; i < n; i++) { pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i])); sq += L[i] * L[i] + R[i] * R[i]; }
  const rms0 = Math.sqrt(sq / (2 * n));
  // guadagno: livello medio comune (−18 dBFS efficaci) senza superare il tetto di picco
  const TARGET = Math.pow(10, -18 / 20), CEIL = Math.pow(10, tr.ceil / 20);
  const g = Math.min(TARGET / rms0, CEIL / pk);
  const fi = Math.floor(SR * 0.02), fo = Math.floor(SR * fadeOut);
  const toI16 = ch => {
    const o = new Int16Array(n); let s = 12345;
    for (let i = 0; i < n; i++) {
      let w = g;
      if (i < fi) w *= i / fi;
      if (i > n - fo) w *= 0.5 + 0.5 * Math.cos(Math.PI * (i - (n - fo)) / fo);
      s = (s * 16807) % 2147483647; const d1 = s / 2147483647; s = (s * 16807) % 2147483647; const d2 = s / 2147483647;
      const v = ch[i] * w * 32767 + (d1 - d2);   // rumore triangolare di un bit
      o[i] = Math.max(-32768, Math.min(32767, Math.round(v)));
    }
    return o;
  };
  window.__trk = { L: toI16(L), R: toI16(R) };
  // livello efficace (prima del guadagno, in dB) dei tratti dell'arco: calma, battaglia, culmine, ritorno alla calma
  const span = (a, b) => { const s0 = Math.floor(a * SR), s1 = Math.min(n, Math.floor(b * SR)); if (s1 <= s0) return null; let q = 0; for (let i = s0; i < s1; i++) q += L[i] * L[i] + R[i] * R[i]; return 20 * Math.log10(Math.sqrt(q / (2 * (s1 - s0)))); };
  let arc = null;
  if (profile) {
    const BAR = 240 / profile.bpm, E = tr.battleEnd || 32, C = tr.climax;
    arc = { calma: span(1, 10 * BAR - 1), battaglia: span(16 * BAR + 2, (C ? C[0] : E) * BAR - 1.5), culmine: C ? span(C[0] * BAR + 2.5, C[1] * BAR - 1.5) : null,
      ritorno: C ? span(C[1] * BAR + 4, E * BAR - 2.5) : null, calma2: span(E * BAR + 4, dur - fadeOut - 1) };
  }
  return { n, g, peak0: pk, rms0, arc, timeline: m.timeline, st: m.state(), bpm: profile && profile.bpm };
}

// Controlli sul file finito, dentro la pagina: decodifica l'MP3, misura picco, RMS, silenzi e clic.
async function checkInPage(b64) {
  const bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ctx = new OfflineAudioContext(2, 44100, 44100);
  const buf = await ctx.decodeAudioData(bytes.buffer);
  const SR = buf.sampleRate, L = buf.getChannelData(0), R = buf.getChannelData(buf.numberOfChannels > 1 ? 1 : 0), n = buf.length;
  let pk = 0, sq = 0, nan = 0;
  for (let i = 0; i < n; i++) { const a = L[i], b = R[i]; if (!Number.isFinite(a) || !Number.isFinite(b)) nan++; pk = Math.max(pk, Math.abs(a), Math.abs(b)); sq += a * a + b * b; }
  // finestre di mezzo secondo: livello efficace (per i silenzi)
  const W = SR / 2, wins = [];
  for (let s = 0; s + W <= n; s += W) { let q = 0; for (let i = s; i < s + W; i++) q += L[i] * L[i] + R[i] * R[i]; wins.push(Math.sqrt(q / (2 * W))); }
  // clic: in blocchi di 5 ms, il salto più forte della derivata seconda rispetto al livello efficace del blocco
  // vicino; la musica ha rapporti bassi e regolari, un clic (gradino improvviso) li fa schizzare in alto.
  const B = Math.floor(SR * 0.005), ratios = [];
  let worst = { r: 0, t: 0 };
  for (let s = 2; s + B < n; s += B) {
    let d2 = 0, q = 0;
    for (let i = s; i < s + B; i++) {
      for (const ch of [L, R]) { const d = Math.abs(ch[i] - 2 * ch[i - 1] + ch[i - 2]); if (d > d2) d2 = d; q += ch[i] * ch[i]; }
    }
    const r = d2 / (Math.sqrt(q / (2 * B)) + 0.003);
    ratios.push(r);
    if (r > worst.r) worst = { r, t: s / SR };
  }
  const sorted = [...ratios].sort((a, b) => a - b), med = sorted[sorted.length >> 1], p999 = sorted[Math.floor(sorted.length * 0.999)];
  return { dur: buf.duration, ch: buf.numberOfChannels, sr: SR, peak: pk, rms: Math.sqrt(sq / (2 * n)), nan, wins, click: { worst: worst.r, at: worst.t, med, p999 } };
}

// Tag ID3v2.3: titolo, artista, album, numero di traccia, genere (testo UTF-16 con BOM).
function id3(tags) {
  const frames = Object.entries(tags).map(([id, text]) => {
    const body = Buffer.concat([Buffer.from([1, 0xff, 0xfe]), Buffer.from(text, 'utf16le')]);
    const h = Buffer.alloc(10); h.write(id, 0, 'latin1'); h.writeUInt32BE(body.length, 4);
    return Buffer.concat([h, body]);
  });
  const all = Buffer.concat(frames), size = all.length, head = Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0]);
  head[6] = (size >> 21) & 0x7f; head[7] = (size >> 14) & 0x7f; head[8] = (size >> 7) & 0x7f; head[9] = size & 0x7f;
  return Buffer.concat([head, all]);
}
function encodeMp3(L, R) {
  const enc = new Mp3Encoder(2, SR, KBPS), parts = [];
  for (let i = 0; i < L.length; i += 1152) { const b = enc.encodeBuffer(L.subarray(i, i + 1152), R.subarray(i, i + 1152)); if (b.length) parts.push(Buffer.from(b)); }
  const f = enc.flush(); if (f.length) parts.push(Buffer.from(f));
  return Buffer.concat(parts);
}

const db = v => v > 0 ? (20 * Math.log10(v)).toFixed(1) : '−∞';
const mmss = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const fileName = (i, t) => `${String(i + 1).padStart(2, '0')} ${t.title}.mp3`;

mkdirSync(outDir, { recursive: true });
if (!only.length) for (const f of readdirSync(outDir)) if (/\.(mp3|txt)$/.test(f)) rmSync(path.join(outDir, f));
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.addScriptTag({ content: js });
const results = [], failures = [];
for (const [i, tr] of TRACKS.entries()) {
  if (only.length && !only.includes(i + 1)) continue;
  const t0 = Date.now();
  const r = await page.evaluate(renderInPage, { ...tr, no: i + 1, ceil: CEIL_DB });
  // campioni dalla pagina a blocchi di 10 s (stringhe base64 di Int16)
  const take = async ch => {
    const out = new Int16Array(r.n), step = SR * 10;
    for (let s = 0; s < r.n; s += step) {
      const b64 = await page.evaluate(([ch, s, e]) => {
        const a = window.__trk[ch].subarray(s, e), u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
        let bin = ''; for (let k = 0; k < u.length; k += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(k, k + 0x8000));
        return btoa(bin);
      }, [ch, s, Math.min(r.n, s + step)]);
      const buf = Buffer.from(b64, 'base64');
      out.set(new Int16Array(buf.buffer, buf.byteOffset, buf.length / 2), s);
    }
    return out;
  };
  const L = await take('L'), R = await take('R');
  await page.evaluate(() => { window.__trk = null; });
  const mp3 = Buffer.concat([id3({ TIT2: tr.title, TPE1: ARTIST, TALB: ALBUM, TRCK: `${i + 1}/${TRACKS.length}`, TCON: 'Soundtrack' }), encodeMp3(L, R)]);
  const file = path.join(outDir, fileName(i, tr));
  writeFileSync(file, mp3);
  const c = await page.evaluate(checkInPage, mp3.toString('base64'));
  // silenzi anomali: finestre sotto −50 dBFS lontane dall'inizio e dalla dissolvenza finale
  const quiet = c.wins.map((w, k) => [k / 2, w]).filter(([t, w]) => t > 1 && t < c.dur - 4 && w < Math.pow(10, -50 / 20));
  const ok = {
    peak: c.peak < Math.pow(10, -1 / 20),
    dur: c.dur >= tr.min && c.dur <= tr.max,
    quiet: quiet.length === 0,
    click: c.click.worst < 25 * Math.max(c.click.p999, 1),
    fmt: c.ch === 2 && c.sr === SR && c.nan === 0,
  };
  const res = { no: i + 1, title: tr.title, file, dur: c.dur, peak: c.peak, rms: c.rms, gain: r.g, desc: tr.desc, ok, quiet, click: c.click, kb: mp3.length / 1024, bpm: r.bpm, epic: tr.epic, arc: r.arc };
  results.push(res);
  for (const [k, v] of Object.entries(ok)) if (!v) failures.push(`${fileName(i, tr)}: controllo «${k}» non superato`);
  const tl = r.timeline.filter(e => e.state || e.profile || e.climax != null).map(e => `${e.t.toFixed(0)} s ${e.state || e.profile || (e.climax ? 'culmine' : 'fine culmine')}`).join(', ');
  console.log(`${String(i + 1).padStart(2, '0')} ${tr.title.padEnd(28)} ${mmss(c.dur)}  epicità ${tr.epic || '—'}  picco ${db(c.peak)} dBFS  RMS ${db(c.rms)} dBFS  ` +
    `guadagno ${db(r.g)} dB  ${(mp3.length / 1024 / 1024).toFixed(1)} MB  note ${r.st.played} (scartate ${r.st.dropped})  ` +
    `clic: peggiore ${c.click.worst.toFixed(1)} a ${c.click.at.toFixed(2)} s (99,9° ${c.click.p999.toFixed(1)})  ` +
    `silenzi ${quiet.length}${tl ? `  [${tl}]` : ''}  ${((Date.now() - t0) / 1000).toFixed(0)} s` +
    (Object.values(ok).every(Boolean) ? '' : '  ← CONTROLLO NON SUPERATO'));
  // DETTAGLI=1: livello efficace ogni 10 s (per controllare l'arco calma → battaglia → calma)
  if (process.env.DETTAGLI && r.arc) console.log('   arco (RMS prima del guadagno): ' + Object.entries(r.arc).filter(([, v]) => v != null).map(([k, v]) => `${k} ${v.toFixed(1)} dB`).join(', '));
  if (process.env.DETTAGLI) console.log('   RMS ogni 10 s: ' + Array.from({ length: Math.ceil(c.wins.length / 20) }, (_, k) => { const w = c.wins.slice(k * 20, k * 20 + 20); return db(Math.sqrt(w.reduce((a, x) => a + x * x, 0) / w.length)); }).join(' '));
}
await browser.close();

if (!only.length) {
  const total = results.reduce((a, r) => a + r.dur, 0);
  const lines = [
    '══════════════════════════════════════════════════════════════════',
    '  WARZONE 1989',
    '  Operazione Valle Grigia',
    '  colonna sonora originale',
    '',
    '  Valle del Serra, ottobre 1989: la Brigata Aurora contro il',
    '  Direttorio Ferreo, dalla testa di ponte al comando nemico.',
    '══════════════════════════════════════════════════════════════════',
    '',
    `Album: ${ALBUM}`,
    `Artista: ${ARTIST}`,
    `${results.length} tracce, ${mmss(total)} in tutto · MP3 stereo, 44,1 kHz, ${KBPS} kbps`,
    'Musica originale, generata dal motore musicale del gioco (client/music.js) con npm run ost.',
    '',
    ...results.map(r => `${String(r.no).padStart(2, '0')}. ${r.title} (${mmss(r.dur)})\n    ${r.desc}`),
    '',
  ];
  writeFileSync(path.join(outDir, 'scaletta.txt'), lines.join('\n'));
  console.log(`\n${outDir}: ${results.length} tracce, ${mmss(total)}, ${(results.reduce((a, r) => a + r.kb, 0) / 1024).toFixed(1)} MB, scaletta.txt`);
}
if (errors.length) failures.push('errori nella pagina: ' + errors.join(' | '));
if (failures.length) { console.error('\n' + failures.join('\n')); process.exit(1); }
