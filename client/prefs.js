// Scelte del giocatore ricordate sul dispositivo (localStorage): mappa e meteo della schermaglia (`wz.mappa`,
// `wz.meteo`), nomi dei luoghi sulla mappa e scossa dello schermo (`wz.scossa`). Suono, musica ed effetti hanno le loro chiavi nei rispettivi moduli.
import { MAPS, mapDef } from '../engine/index.js';

const load = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, String(v)); } catch (e) { /* archivio non disponibile */ } };

const MAP_KEY = 'wz.mappa', PLACES_KEY = 'wz.luoghi';
const okMap = id => MAPS.some(m => m.id === id);

let map = load(MAP_KEY, 'casuale');
if (!okMap(map)) map = 'casuale';
let places = load(PLACES_KEY, '1') !== '0';

// Mappa della schermaglia: id da MAPS ('casuale' = generata dal seme).
export const mapPref = () => map;
export function setMapPref(id) { if (!okMap(id)) return; map = id; save(MAP_KEY, id); }
// Meteo della schermaglia: 'clear' (sereno, di base), 'rain', 'fog' o 'variable', come li vuole newGame.
const WX_KEY = 'wz.meteo';
export const WEATHER_PREFS = ['clear', 'rain', 'fog', 'variable'];
let weather = load(WX_KEY, 'clear');
if (!WEATHER_PREFS.includes(weather)) weather = 'clear';
export const weatherPref = () => weather;
export function setWeatherPref(id) { if (!WEATHER_PREFS.includes(id)) return; weather = id; save(WX_KEY, id); }
// Opzioni di newGame per la schermaglia: mappa disegnata e meteo scelti nel menu (niente con mappa casuale e sereno,
// cioè la partita di sempre).
export function mapOpts() {
  const o = {};
  if (map !== 'casuale') o.map = map;
  if (weather !== 'clear') o.weather = weather;
  return o.map || o.weather ? o : undefined;
}
// Voce di MAPS per un id; nome e luoghi della mappa disegnata in corso (S.map), se c'è.
export const mapInfo = id => MAPS.find(m => m.id === id) || MAPS[0];
export const placesOf = id => (id && mapDef(id) && mapDef(id).places) || null;

// Nomi dei luoghi sulle mappe disegnate: accesi o spenti.
export const placesOn = () => places;
export function setPlaces(on) { places = !!on; save(PLACES_KEY, places ? '1' : '0'); }

// Scossa dello schermo sulle esplosioni grandi: accesa o spenta. Con «riduci movimento» del sistema non c'è comunque.
const SHAKE_KEY = 'wz.scossa';
let shake = load(SHAKE_KEY, '1') !== '0';
export const shakeOn = () => shake;
export function setShake(on) { shake = !!on; save(SHAKE_KEY, shake ? '1' : '0'); }
