// Scelte del giocatore ricordate sul dispositivo (localStorage): mappa della schermaglia e nomi dei luoghi sulla mappa.
// Suono, musica ed effetti hanno le loro chiavi nei rispettivi moduli.
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
// Opzioni di newGame per la mappa scelta (niente per la mappa casuale).
export const mapOpts = () => (map !== 'casuale' ? { map } : undefined);
// Voce di MAPS per un id; nome e luoghi della mappa disegnata in corso (S.map), se c'è.
export const mapInfo = id => MAPS.find(m => m.id === id) || MAPS[0];
export const placesOf = id => (id && mapDef(id) && mapDef(id).places) || null;

// Nomi dei luoghi sulle mappe disegnate: accesi o spenti.
export const placesOn = () => places;
export function setPlaces(on) { places = !!on; save(PLACES_KEY, places ? '1' : '0'); }
