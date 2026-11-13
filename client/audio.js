// Suoni: tutti sintetizzati in tempo reale con Web Audio (oscillatori, rumore filtrato, inviluppi). Nessun file.
// Posizione rispetto alla visuale: volume e panorama; fuori schermo più piano, lontano muto. Gli effetti che il
// giocatore non vede (nebbia) non si sentono. Limite di voci contemporanee e di ripetizioni ravvicinate.
import { P, MW, MH, vis, ftile, clamp } from '../engine/index.js';
import { cam, view } from './state.js';

const KEY_ON = 'wz.sound', KEY_VOL = 'wz.volume';
const load = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, String(v)); } catch (e) { /* archivio non disponibile */ } };

let enabled = load(KEY_ON, '1') !== '0';
let volume = clamp(parseFloat(load(KEY_VOL, '0.6')) || 0, 0, 1);
let ac = null, master = null, sfxBus = null, noiseBuf = null, muffle = null, rainG = null, rainLow = null;
// Meteo: pioggia (0–1) per il rumore di fondo, nebbia (0–1) per il filtro che ovatta gli effetti; tuoni suonati.
const wxA = { rain: 0, fog: 0, thunders: 0 };
const MAX_VOICES = 14;
const voices = [];          // istanti di fine delle voci in corso (tempo dell'AudioContext)
const last = {};            // ultimo avvio di ogni suono, per limitare le ripetizioni
const stats = { played: 0, dropped: 0 };
const listeners = new Set();
const readyFns = [];        // chi aspetta il contesto audio (la musica)

/* ---------- impostazioni ---------- */
export const soundOn = () => enabled;
export const getVolume = () => volume;
export function onAudioChange(fn) { listeners.add(fn); }
const changed = () => { for (const f of listeners) f(); };
export function setSound(on) {
  enabled = !!on; save(KEY_ON, enabled ? '1' : '0');
  if (ac) {
    master.gain.setTargetAtTime(enabled ? volume : 0, ac.currentTime, 0.03);
    if (enabled && document.visibilityState !== 'hidden') ac.resume().catch(() => {});
    else if (!enabled) setTimeout(() => { if (!enabled && ac) ac.suspend().catch(() => {}); }, 120);
  }
  changed();
}
export function setVolume(v) {
  volume = clamp(+v || 0, 0, 1); save(KEY_VOL, volume.toFixed(2));
  if (ac && enabled) master.gain.setTargetAtTime(volume, ac.currentTime, 0.03);
  changed();
}
export function audioState() { return { ctx: ac ? ac.state : 'none', enabled, volume, voices: voices.length, ...stats, weather: { rain: +wxA.rain.toFixed(2), fog: +wxA.fog.toFixed(2), muffle: Math.round(muffleHz(wxA.fog)), thunders: wxA.thunders } }; }

/* ---------- avvio al primo gesto ---------- */
function ensure() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try { ac = new AC(); } catch (e) { ac = null; return; }
    master = ac.createGain(); master.gain.value = enabled ? volume : 0;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.2;
    sfxBus = ac.createGain(); sfxBus.gain.value = 0.9;
    // filtro passa-basso sugli effetti: aperto di norma, si chiude un poco con la nebbia (suoni ovattati)
    muffle = ac.createBiquadFilter(); muffle.type = 'lowpass'; muffle.Q.value = 0.5; muffle.frequency.value = muffleHz(wxA.fog);
    sfxBus.connect(muffle); muffle.connect(comp); comp.connect(master); master.connect(ac.destination);
    const len = ac.sampleRate * 2; noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
    const ch = noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    startAmbient();
    for (const f of readyFns) f(ac, master);
  }
  if (enabled && ac.state !== 'running' && document.visibilityState !== 'hidden') ac.resume().catch(() => {});
}
// fn(ac, master) appena il contesto audio esiste (si crea al primo gesto): la musica si collega al bus principale.
export function onAudioReady(fn) { if (ac) fn(ac, master); else readyFns.push(fn); }
export function initAudio() {
  const g = () => ensure();
  for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, g, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!ac) return;
    if (document.visibilityState === 'hidden') ac.suspend().catch(() => {});
    else if (enabled) ac.resume().catch(() => {});
  });
}

/* ---------- mattoni di sintesi ---------- */
// Tono con inviluppo: attacco lineare, discesa esponenziale; frequenza da f0 a f1.
function tone(dst, t, type, f0, f1, a, peak, d) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + a + d);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  o.connect(g); g.connect(dst); o.start(t); o.stop(t + a + d + 0.03);
  return a + d;
}
// Rumore filtrato con inviluppo; la frequenza del filtro va da f0 a f1.
function noise(dst, t, ftype, f0, f1, q, a, peak, d) {
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf; s.loop = true; f.type = ftype; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + a + d);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  s.connect(f); f.connect(g); g.connect(dst); s.start(t, Math.random() * 1.6); s.stop(t + a + d + 0.03);
  return a + d;
}
// Filtro «radio»: banda stretta, per i segnali degli ordini e l'allarme.
function radio(dst, t, dur) {
  const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 1.1; f.connect(dst);
  noise(dst, t, 'bandpass', 2600, 2600, 0.8, 0.002, 0.05, 0.05);           // scatto di apertura del canale
  noise(dst, t + dur, 'bandpass', 2600, 2600, 0.8, 0.002, 0.04, 0.04);     // e di chiusura
  return f;
}
const beeps = (dst, t, seq, type = 'square', peak = 0.22) => {
  let tt = t; for (const [f, d, gap] of seq) { tone(dst, tt, type, f, f, 0.004, peak, d); tt += d + (gap ?? 0.035); } return tt - t;
};

/* ---------- catalogo dei suoni ---------- */
// Ogni voce: durata restituita, guadagno di base (g), intervallo minimo tra due avvii (gap), priorità (pr).
const SFX = {
  // mitragliatrice binata: due colpi secchi ravvicinati
  mg: { g: 0.2, gap: 0.045, f(d, t) {
    for (let i = 0; i < 2; i++) { const ti = t + i * 0.052 + Math.random() * 0.008; noise(d, ti, 'bandpass', 2400, 1300, 1.3, 0.001, 0.55, 0.045); tone(d, ti, 'square', 170, 70, 0.001, 0.1, 0.035); }
    return 0.16;
  } },
  // cannone: schiocco, colpo basso e soffio che si chiude
  cn: { g: 0.46, gap: 0.07, f(d, t) {
    noise(d, t, 'highpass', 3200, 3200, 0.7, 0.001, 0.4, 0.03);
    tone(d, t, 'sine', 120, 36, 0.003, 0.9, 0.32);
    return noise(d, t, 'lowpass', 1600, 170, 0.8, 0.004, 0.7, 0.55);
  } },
  // razzi: sibilo che sale e si allontana
  rk: { g: 0.32, gap: 0.08, f(d, t) {
    noise(d, t, 'lowpass', 700, 200, 1, 0.01, 0.35, 0.22);
    return noise(d, t + 0.02, 'bandpass', 900, 3600, 5, 0.05, 0.5, 0.6);
  } },
  // mortaio: tonfo di partenza e fischio che scende
  mo: { g: 0.42, gap: 0.12, f(d, t) {
    tone(d, t, 'sine', 80, 42, 0.003, 0.9, 0.24);
    noise(d, t, 'lowpass', 520, 140, 1, 0.003, 0.5, 0.22);
    return 0.35 + tone(d, t + 0.35, 'sine', 1750, 620, 0.12, 0.05, 1.0);
  } },
  // mitragliatrice pesante: una canna sola, colpo più grave e corposo della binata
  hmg: { g: 0.26, gap: 0.06, f(d, t) {
    noise(d, t, 'bandpass', 1500, 650, 1.2, 0.001, 0.6, 0.07);
    tone(d, t, 'square', 105, 42, 0.001, 0.16, 0.06);
    return tone(d, t, 'sine', 160, 60, 0.001, 0.4, 0.08) + 0.04;
  } },
  // cannone 75: come il 40 ma più profondo e con la coda più lunga
  cn75: { g: 0.52, gap: 0.08, f(d, t) {
    noise(d, t, 'highpass', 2800, 2800, 0.7, 0.001, 0.4, 0.035);
    tone(d, t, 'sine', 96, 28, 0.003, 0.95, 0.42);
    return noise(d, t, 'lowpass', 1300, 120, 0.8, 0.004, 0.75, 0.75);
  } },
  // cannone 105: il più profondo, con una seconda onda di pressione
  cn105: { g: 0.6, gap: 0.1, f(d, t) {
    noise(d, t, 'highpass', 2400, 2400, 0.7, 0.001, 0.45, 0.04);
    tone(d, t, 'sine', 78, 22, 0.003, 1, 0.55);
    tone(d, t + 0.05, 'sine', 54, 24, 0.01, 0.5, 0.5);
    return noise(d, t, 'lowpass', 1050, 90, 0.8, 0.005, 0.8, 0.95);
  } },
  // lanciafiamme: soffio breve che si apre, con il rombo della fiamma sotto
  flame: { g: 0.3, gap: 0.16, f(d, t) {
    noise(d, t, 'bandpass', 500, 1500, 0.8, 0.04, 0.55, 0.3);
    return noise(d, t, 'lowpass', 420, 180, 0.9, 0.03, 0.6, 0.36);
  } },
  // modulo riparazione: ronzio elettrico leggero con qualche crepitio; molto discreto e raro
  repair: { g: 0.06, gap: 1.4, f(d, t) {
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 3; f.connect(d);
    tone(f, t, 'sawtooth', 118, 122, 0.04, 0.5, 0.32);
    tone(d, t, 'sine', 236, 236, 0.04, 0.12, 0.3);
    for (let i = 0; i < 3; i++) noise(d, t + 0.05 + Math.random() * 0.25, 'highpass', 5200, 5200, 0.7, 0.001, 0.25, 0.012);
    return 0.38;
  } },
  // missile anticarro: colpo di lancio e sibilo lungo del motore che si allontana
  at: { g: 0.32, gap: 0.2, f(d, t) {
    tone(d, t, 'sine', 140, 55, 0.002, 0.7, 0.16);
    noise(d, t, 'lowpass', 1600, 300, 0.9, 0.003, 0.5, 0.22);
    return noise(d, t + 0.05, 'bandpass', 2600, 1700, 3, 0.08, 0.32, 1.2) + 0.05;
  } },
  // obice: colpo molto profondo e fischio lungo della granata
  hw: { g: 0.6, gap: 0.3, f(d, t) {
    noise(d, t, 'highpass', 2000, 2000, 0.7, 0.001, 0.35, 0.05);
    tone(d, t, 'sine', 56, 18, 0.004, 1, 0.9);
    noise(d, t, 'lowpass', 700, 60, 0.8, 0.006, 0.85, 1.2);
    return 0.55 + tone(d, t + 0.55, 'sine', 1400, 420, 0.2, 0.045, 1.6);
  } },
  // lanciarazzi multiplo: salva rapida di sei partenze
  mrl: { g: 0.34, gap: 0.4, f(d, t) {
    for (let i = 0; i < 6; i++) {
      const ti = t + i * 0.075 + Math.random() * 0.015;
      tone(d, ti, 'sine', 120, 50, 0.002, 0.35, 0.08);
      noise(d, ti, 'bandpass', 800, 3000, 4, 0.03, 0.35, 0.32);
    }
    return 0.85;
  } },
  // proiettile di cannone a segno: tonfo metallico corto
  hit: { g: 0.22, gap: 0.06, f(d, t) {
    noise(d, t, 'bandpass', 1300, 600, 2, 0.001, 0.5, 0.09);
    return tone(d, t, 'triangle', 460, 300, 0.001, 0.25, 0.08);
  } },
  // impatto dei razzi
  impRk: { g: 0.38, gap: 0.05, f(d, t) {
    noise(d, t, 'highpass', 2500, 2500, 0.7, 0.001, 0.3, 0.025);
    tone(d, t, 'sine', 130, 48, 0.002, 0.7, 0.2);
    return noise(d, t, 'lowpass', 2200, 260, 0.9, 0.003, 0.6, 0.34);
  } },
  // impatto del mortaio: più profondo
  impMo: { g: 0.52, gap: 0.08, f(d, t) {
    noise(d, t, 'highpass', 2000, 2000, 0.7, 0.001, 0.3, 0.03);
    tone(d, t, 'sine', 90, 30, 0.003, 0.9, 0.5);
    return noise(d, t, 'lowpass', 1300, 120, 0.9, 0.004, 0.75, 0.75);
  } },
  // granata dell'obice a terra: la più grave, con la coda lunga
  impHw: { g: 0.62, gap: 0.12, f(d, t) {
    noise(d, t, 'highpass', 1800, 1800, 0.7, 0.001, 0.3, 0.04);
    tone(d, t, 'sine', 62, 20, 0.004, 1, 0.8);
    return noise(d, t, 'lowpass', 1100, 80, 0.9, 0.005, 0.85, 1.2);
  } },
  // esplosione di un mezzo
  boomUnit: { g: 0.72, gap: 0.06, f(d, t) {
    noise(d, t, 'highpass', 2800, 2800, 0.7, 0.001, 0.35, 0.04);
    tone(d, t, 'sine', 72, 26, 0.004, 0.9, 0.65);
    noise(d, t + 0.18, 'bandpass', 1800, 900, 3, 0.002, 0.18, 0.12);   // pezzi che ricadono
    return noise(d, t, 'lowpass', 1700, 150, 0.8, 0.005, 0.85, 1.0);
  } },
  // esplosione di un edificio: coda lunga, brontolio e crepitio
  boomStruct: { g: 0.95, gap: 0.15, pr: true, f(d, t) {
    noise(d, t, 'highpass', 2200, 2200, 0.7, 0.002, 0.35, 0.06);
    tone(d, t, 'sine', 58, 22, 0.006, 1, 1.4);
    noise(d, t, 'lowpass', 1300, 80, 0.7, 0.01, 0.95, 2.8);
    for (let i = 0; i < 6; i++) noise(d, t + 0.25 + Math.random() * 1.5, 'bandpass', 1400 + Math.random() * 1600, 800, 2.5, 0.002, 0.12, 0.08);
    return 2.9;
  } },
  // conferme degli ordini: segnali radio brevi, diversi tra loro
  ordMove: { g: 0.34, gap: 0.08, pr: true, ui: true, f(d, t) { const r = radio(d, t, 0.2); return beeps(r, t + 0.01, [[880, 0.05], [1175, 0.07]]) + 0.06; } },
  ordAttack: { g: 0.34, gap: 0.08, pr: true, ui: true, f(d, t) { const r = radio(d, t, 0.24); return beeps(r, t + 0.01, [[760, 0.035, 0.025], [760, 0.035, 0.025], [540, 0.08]], 'sawtooth', 0.18) + 0.06; } },
  ordBuild: { g: 0.34, gap: 0.08, pr: true, ui: true, f(d, t) { const r = radio(d, t, 0.26); return beeps(r, t + 0.01, [[620, 0.11, 0.02], [930, 0.04, 0.02], [930, 0.04]], 'triangle', 0.3) + 0.06; } },
  // colpi metallici del cantiere: parziali non armoniche, pochi
  clank: { g: 0.2, gap: 0.42, f(d, t) {
    const b = 480 * (0.9 + Math.random() * 0.2);
    tone(d, t, 'sine', b, b, 0.001, 0.4, 0.2); tone(d, t, 'sine', b * 2.76, b * 2.76, 0.001, 0.22, 0.12); tone(d, t, 'sine', b * 5.4, b * 5.4, 0.001, 0.1, 0.06);
    noise(d, t, 'highpass', 4000, 4000, 0.7, 0.001, 0.25, 0.015);
    return 0.22;
  } },
  // edificio pronto: tre note che salgono
  built: { g: 0.36, gap: 0.5, pr: true, ui: true, f(d, t) { return beeps(d, t, [[523, 0.12, -0.03], [659, 0.12, -0.03], [784, 0.3]], 'triangle', 0.3); } },
  // mezzo pronto: motore che sale di giri e due segnali
  unitReady: { g: 0.34, gap: 0.4, pr: true, ui: true, f(d, t) {
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 520; f.connect(d);
    tone(f, t, 'sawtooth', 48, 105, 0.05, 0.5, 0.4);
    return 0.3 + beeps(d, t + 0.3, [[784, 0.06], [1046, 0.1]], 'square', 0.12);
  } },
  // ricerca completata: arpeggio luminoso
  research: { g: 0.36, gap: 0.5, pr: true, ui: true, f(d, t) {
    let tt = t; for (const f of [659, 880, 1109, 1319]) { tone(d, tt, 'sine', f, f, 0.005, 0.28, 0.45); tone(d, tt, 'sine', f * 2.01, f * 2.01, 0.005, 0.05, 0.3); tt += 0.075; }
    return 0.8;
  } },
  // allarme di attacco: due toni alternati sulla radio
  alarm: { g: 0.36, gap: 2.5, pr: true, ui: true, f(d, t) {
    const r = radio(d, t, 1.0);
    for (let i = 0; i < 4; i++) { tone(r, t + i * 0.24, 'square', 900, 900, 0.006, 0.26, 0.11); tone(r, t + i * 0.24 + 0.12, 'square', 640, 640, 0.006, 0.26, 0.11); }
    noise(d, t, 'bandpass', 2000, 2000, 0.6, 0.02, 0.03, 0.95);
    return 1.05;
  } },
  // obiettivo della missione: nuova fase (due note morbide sulla radio, discrete)
  objStep: { g: 0.26, gap: 1.2, pr: true, ui: true, f(d, t) {
    const r = radio(d, t, 0.42);
    tone(r, t + 0.02, 'triangle', 587, 587, 0.01, 0.3, 0.16);
    return tone(r, t + 0.2, 'triangle', 880, 880, 0.01, 0.3, 0.22) + 0.2;
  } },
  // obiettivo completato: accordo che sale e si apre, breve
  objDone: { g: 0.3, gap: 2, pr: true, ui: true, f(d, t) {
    let tt = t; for (const f of [392, 523, 659]) { tone(d, tt, 'triangle', f, f, 0.01, 0.26, 0.5); tt += 0.11; }
    tone(d, tt, 'sine', 784, 784, 0.02, 0.3, 0.9); tone(d, tt, 'sine', 1568, 1568, 0.02, 0.05, 0.6);
    return tt - t + 0.9;
  } },
  // tuono lontano: brontolio grave che rotola e si spegne piano, senza schiocco
  thunder: { g: 0.5, gap: 3, pr: true, f(d, t) {
    const n = 3 + Math.floor(Math.random() * 3); let tt = t;
    for (let i = 0; i < n; i++) { noise(d, tt, 'lowpass', 150 + Math.random() * 110, 46, 0.7, 0.12 + Math.random() * 0.2, 0.8 - i * 0.1, 1.3 + Math.random() * 0.9); tt += 0.28 + Math.random() * 0.5; }
    tone(d, t + 0.05, 'sine', 52, 30, 0.3, 0.35, 2.4);
    return tt - t + 2.4;
  } },
  // promozione di un mezzo: due note che salgono, con un filo di brillantezza
  rank: { g: 0.3, gap: 0.6, pr: true, ui: true, f(d, t) {
    tone(d, t, 'triangle', 660, 660, 0.005, 0.3, 0.14); tone(d, t + 0.1, 'triangle', 990, 990, 0.005, 0.32, 0.3);
    return tone(d, t + 0.1, 'sine', 1980, 1980, 0.005, 0.06, 0.25) + 0.1;
  } },
  // un mezzo diventa asso: squillo a tre note con l'ottava sopra e una coda che luccica
  rankAce: { g: 0.34, gap: 1, pr: true, ui: true, f(d, t) {
    let tt = t; for (const f of [523, 659, 784]) { tone(d, tt, 'sawtooth', f, f, 0.006, 0.12, 0.13); tone(d, tt, 'triangle', f, f, 0.006, 0.26, 0.16); tt += 0.09; }
    tone(d, tt, 'triangle', 1046, 1046, 0.01, 0.34, 0.7); tone(d, tt, 'sine', 2093, 2093, 0.01, 0.08, 0.5);
    for (let i = 0; i < 5; i++) tone(d, tt + 0.08 + i * 0.07, 'sine', 2600 + Math.random() * 1800, 2600, 0.002, 0.04, 0.09);
    return tt - t + 0.75;
  } },
  // «Bassi a palla» della Macchina di Villo: colpo di bassi profondo che scende, con il battito della cassa
  heroBass: { g: 0.8, gap: 0.12, pr: true, f(d, t) {
    tone(d, t, 'sine', 118, 38, 0.004, 1, 0.42); tone(d, t, 'triangle', 59, 30, 0.006, 0.5, 0.5);
    tone(d, t + 0.16, 'sine', 96, 34, 0.004, 0.7, 0.3);
    noise(d, t, 'lowpass', 900, 120, 1.2, 0.002, 0.3, 0.12);
    return 0.6;
  } },
  // esplosione dei bassi: tonfo sordo, onda di pressione e crepitio elettrico
  heroBoom: { g: 0.9, gap: 0.1, pr: true, f(d, t) {
    noise(d, t, 'highpass', 2600, 2600, 0.7, 0.001, 0.3, 0.04);
    tone(d, t, 'sine', 84, 22, 0.004, 1, 0.9); tone(d, t + 0.07, 'sine', 48, 22, 0.01, 0.6, 0.8);
    for (let i = 0; i < 4; i++) noise(d, t + 0.05 + Math.random() * 0.4, 'bandpass', 3000 + Math.random() * 2500, 1800, 6, 0.001, 0.16, 0.05);
    return noise(d, t, 'lowpass', 1500, 90, 0.8, 0.005, 0.85, 1.3);
  } },
  // colpo grosso: il più profondo del gioco, con due riprese della cassa e una coda lunghissima
  heroBig: { g: 1, gap: 0.3, pr: true, f(d, t) {
    noise(d, t, 'highpass', 2000, 2000, 0.7, 0.002, 0.35, 0.07);
    tone(d, t, 'sine', 70, 18, 0.005, 1, 1.8); tone(d, t + 0.12, 'sine', 44, 18, 0.01, 0.8, 1.6); tone(d, t + 0.34, 'sine', 62, 20, 0.006, 0.7, 1.1);
    noise(d, t, 'lowpass', 1200, 60, 0.7, 0.01, 0.95, 3);
    for (let i = 0; i < 9; i++) noise(d, t + 0.1 + Math.random() * 1.4, 'bandpass', 2600 + Math.random() * 3000, 1500, 6, 0.001, 0.14, 0.06);
    return 3.1;
  } },
  // sgommata: stridio breve di gomme sull'asfalto
  skid: { g: 0.22, gap: 0.8, f(d, t) {
    noise(d, t, 'bandpass', 1900, 1300, 9, 0.03, 0.6, 0.5); return noise(d, t, 'bandpass', 2700, 2100, 12, 0.05, 0.3, 0.4);
  } },
  // clic dell'interfaccia
  click: { g: 0.28, gap: 0.03, pr: true, ui: true, f(d, t) { tone(d, t, 'square', 2300, 1500, 0.001, 0.12, 0.018); return 0.03; } },
};

/* ---------- posizione e ascolto ---------- */
// Si sente solo ciò che il giocatore vede (le sue cose o le caselle visibili).
function audible(x, y, owner) {
  if (owner === P) return true;
  const tx = ftile(x), ty = ftile(y);
  return tx >= 0 && ty >= 0 && tx < MW && ty < MH && vis && vis[tx + ty * MW] === 1;
}
// Guadagno e panorama secondo la distanza dalla visuale: pieno sullo schermo, poi cala; oltre ~900 px muto.
function spatial(x, y) {
  const hw = view.cw / cam.z / 2, hh = view.ch / cam.z / 2, dx = x - (cam.x + hw), dy = y - (cam.y + hh);
  const out = Math.hypot(Math.max(0, Math.abs(dx) - hw), Math.max(0, Math.abs(dy) - hh));
  const g = out <= 0 ? 1 : 0.5 * Math.exp(-out / 240);
  return g < 0.03 ? null : { g: g * (0.8 + 0.2 * Math.min(1.3, cam.z)), pan: clamp(dx / (hw * 1.3 + 1), -0.85, 0.85) };
}
function start(name, g, pan) {
  const S0 = SFX[name]; if (!S0) return;
  const now = ac.currentTime;
  if (last[name] != null && now - last[name] < S0.gap) return;
  let j = 0; for (const e of voices) if (e > now) voices[j++] = e; voices.length = j;
  if (voices.length >= MAX_VOICES && !S0.pr) { stats.dropped++; return; }
  last[name] = now;
  const out = ac.createGain(); out.gain.value = S0.g * g;
  if (pan && ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = pan; out.connect(p); p.connect(sfxBus); }
  else out.connect(sfxBus);
  const dur = S0.f(out, now + 0.005);
  voices.push(now + dur + 0.05); stats.played++;
  // scollega la catena quando il suono è finito
  setTimeout(() => { try { out.disconnect(); } catch (e) { /* già scollegato */ } }, (dur + 0.3) * 1000);
}
const ready = () => ac && enabled && ac.state === 'running';
// Peso di un evento per la musica: 1 sullo schermo, meno fuori; 0 se il giocatore non lo vede (stessa regola dei
// suoni). Le cose del giocatore fuori dalla visuale contano poco ma contano.
export function heard(x, y, owner) {
  if (!audible(x, y, owner)) return 0;
  const sp = spatial(x, y);
  return sp ? Math.min(1, sp.g) : owner === P ? 0.3 : 0;
}
// Suono nel mondo, alla posizione (x, y), prodotto dal lato owner (può mancare).
export function sfx(name, x, y, owner) {
  if (!ready() || !audible(x, y, owner)) return;
  const sp = spatial(x, y); if (!sp) return;
  start(name, sp.g, sp.pan);
}
// Suono dell'interfaccia: senza posizione.
export function uiSfx(name) { if (ready()) start(name, 1, 0); }

// Suono dello sparo per ogni arma (campo w dell'evento flash).
const FLASH_SFX = { MG: 'mg', HMG: 'hmg', CN: 'cn', CN75: 'cn75', CN105: 'cn105', FL: 'flame', RK: 'rk', MRL: 'mrl', AT: 'at', MO: 'mo', HW: 'hw' };
// Dagli eventi fx del motore ai suoni. I campi nuovi (w, owner, kind) possono mancare: si ripiega sulla taglia.
export function fxSound(e) {
  if (!ready()) return;
  switch (e.k) {
    case 'flash': {
      if (e.hero) { sfx('heroBass', e.x, e.y, e.owner); break; }
      const w = e.w || (e.s <= 3 ? 'MG' : 'CN');
      sfx(FLASH_SFX[w] || 'cn', e.x, e.y, e.owner); break;
    }
    case 'repair': sfx('repair', e.x2, e.y2, e.owner); break;
    case 'boom': {
      const kind = e.kind || (e.size >= 2 ? 'struct' : Math.abs(e.size - 0.9) < 0.01 ? 'unit' : 'shot');
      if (e.hero && kind === 'shot') { sfx(e.big ? 'heroBig' : 'heroBoom', e.x, e.y, P); break; }
      sfx(kind === 'struct' ? 'boomStruct' : kind === 'unit' ? 'boomUnit' : e.size < 0.8 ? 'impRk' : e.size >= 1.5 ? 'impHw' : 'impMo', e.x, e.y, kind === 'shot' ? undefined : e.owner);
      break;
    }
    case 'hit': sfx('hit', e.x, e.y); break;
    case 'spark': if (Math.random() < 0.3) sfx('clank', e.x, e.y); break;
  }
}

/* ---------- fondo sonoro: vento e statico radio, molto bassi ---------- */
function loopNoise() { const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s; }
function lfo(freq, depth, param) { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = freq; g.gain.value = depth; o.connect(g); g.connect(param); o.start(); return o; }
function startAmbient() {
  const bus = ac.createGain(); bus.gain.value = 1; bus.connect(master);
  // vento: rumore scuro con raffiche lente
  const w = loopNoise(), wf = ac.createBiquadFilter(), wg = ac.createGain();
  wf.type = 'lowpass'; wf.frequency.value = 380; wf.Q.value = 0.6; wg.gain.value = 0.035;
  w.connect(wf); wf.connect(wg); wg.connect(bus); w.start();
  lfo(0.07, 0.02, wg.gain); lfo(0.11, 160, wf.frequency);
  // statico radio: fruscio acuto che va e viene
  const s = loopNoise(), sf = ac.createBiquadFilter(), sg = ac.createGain();
  sf.type = 'bandpass'; sf.frequency.value = 3200; sf.Q.value = 0.9; sg.gain.value = 0.006;
  s.connect(sf); sf.connect(sg); sg.connect(bus); s.start();
  lfo(0.23, 0.005, sg.gain);
  // pioggia: scroscio chiaro (rumore tra 1 e 8 kHz, con un respiro lento) e battito grave sul terreno; muta col sereno
  const r = loopNoise(), rh = ac.createBiquadFilter(), rl = ac.createBiquadFilter();
  rh.type = 'highpass'; rh.frequency.value = 1100; rh.Q.value = 0.4; rl.type = 'lowpass'; rl.frequency.value = 7800; rl.Q.value = 0.4;
  rainG = ac.createGain(); rainG.gain.value = 0;
  r.connect(rh); rh.connect(rl); rl.connect(rainG); rainG.connect(bus); r.start();
  lfo(0.13, 900, rl.frequency);
  const r2 = loopNoise(), rf = ac.createBiquadFilter(); rf.type = 'bandpass'; rf.frequency.value = 420; rf.Q.value = 0.5;
  rainLow = ac.createGain(); rainLow.gain.value = 0;
  r2.connect(rf); rf.connect(rainLow); rainLow.connect(bus); r2.start();
  applyWeather(0.05);
}
// Suono del meteo: rain e fog da 0 a 1 (weather.js li porta piano al valore del tempo in corso). La pioggia è nel
// fondo sonoro, quindi segue volume e acceso/spento come tutto il resto; la nebbia chiude un poco il filtro degli
// effetti (la musica resta com'è).
const RAIN_G = 0.085, RAIN_LOW_G = 0.05;
const muffleHz = fog => 20000 * Math.pow(2400 / 20000, clamp(fog, 0, 1));
function applyWeather(tc) {
  if (!ac || !rainG) return;
  const t = ac.currentTime;
  rainG.gain.setTargetAtTime(RAIN_G * wxA.rain, t, tc); rainLow.gain.setTargetAtTime(RAIN_LOW_G * wxA.rain, t, tc);
  muffle.frequency.setTargetAtTime(muffleHz(wxA.fog), t, tc);
}
export function weatherAudio(rain, fog) {
  rain = clamp(+rain || 0, 0, 1); fog = clamp(+fog || 0, 0, 1);
  if (Math.abs(rain - wxA.rain) < 0.02 && Math.abs(fog - wxA.fog) < 0.02 && (rain === wxA.rain || (rain > 0 && rain < 1)) && (fog === wxA.fog || (fog > 0 && fog < 1))) return;
  wxA.rain = rain; wxA.fog = fog; applyWeather(0.25);
}
// Tuono lontano tra delay secondi (dopo il lampo). Si conta anche se l'audio è spento, per i test.
export function thunder(delay = 0) {
  wxA.thunders++;
  setTimeout(() => { if (ready()) start('thunder', 0.7 + Math.random() * 0.3, (Math.random() - 0.5) * 1.2); }, Math.max(0, delay) * 1000);
}
