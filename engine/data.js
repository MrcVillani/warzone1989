// Dati di gioco: mappa, telai, propulsioni, armi, edifici, ricerche, difficoltà.
// Nessuna dipendenza dal DOM: questo file è usato dal motore, dal client e dai test.

export const TILE = 32, MW = 64, MH = 64, N = MW * MH;
export const GROUND = 0, DIRT = 1, WATER = 2, ROCK = 3, FOREST = 4;
export const P = 0, E = 1;
export const UNIT_CAP = 60;
export const B0 = { x: 9, y: 9 };
export const B1 = { x: MW - 10, y: MH - 10 };

export const CHASSIS = {
  L: { name: 'Gheppio', label: 'Leggero', hp: 170, armor: 0, cost: 40, wt: 1, size: [15, 10], rad: 8, req: null },
  M: { name: 'Lince', label: 'Medio', hp: 300, armor: 2, cost: 80, wt: 2, size: [19, 13], rad: 10, req: 'chM' },
  H: { name: 'Bisonte', label: 'Pesante', hp: 500, armor: 4, cost: 140, wt: 3, size: [23, 16], rad: 12, req: 'chH' },
};
export const PROPS = {
  W: { name: 'Ruote', short: 'Ruote', speed: 1.0, hpm: 1.0, cost: 15, water: false, req: null },
  HT: { name: 'Semicingoli', short: 'Semic.', speed: 0.85, hpm: 1.2, cost: 35, water: false, req: 'prHT' },
  T: { name: 'Cingoli', short: 'Cingoli', speed: 0.68, hpm: 1.5, cost: 60, water: false, req: 'prT' },
  V: { name: 'Hovercraft', short: 'Hover', speed: 1.35, hpm: 0.8, cost: 50, water: true, req: 'prV' },
};
export const WEAPONS = {
  MG: { name: 'Mitragliatrice binata', short: 'MG', dmg: 7, rof: 0.22, range: 4.5, splash: 0, proj: 'tracer', cost: 20, req: null },
  CN: { name: 'Cannone 40 mm', short: 'Cannone', dmg: 38, rof: 1.5, range: 5.2, splash: 0, proj: 'shell', speed: 560, cost: 45, req: 'wCN' },
  RK: { name: 'Razziera', short: 'Razzi', dmg: 30, rof: 2.2, range: 6.5, splash: 0.9, proj: 'rocket', speed: 330, cost: 65, req: 'wRK' },
  MO: { name: 'Mortaio 81 mm', short: 'Mortaio', dmg: 48, rof: 3.2, range: 9, minRange: 2.5, splash: 1.3, proj: 'mortar', cost: 80, req: 'wMO' },
};
export const TOWER_MG = Object.assign({}, WEAPONS.MG, { range: 5.5, dmg: 8 });
export const TOWER_CN = Object.assign({}, WEAPONS.CN, { range: 6.2, dmg: 42 });

// m: true = nome maschile (serve ai messaggi "pronto/pronta", "distrutto/distrutta").
export const STRUCTS = {
  hq: { name: 'Comando', m: true, w: 3, h: 3, hp: 1600, cost: 0, time: 1, sight: 9, armor: 4, desc: 'Addestra i genieri.' },
  pump: { name: 'Pompa', w: 1, h: 1, hp: 420, cost: 50, time: 10, sight: 4, armor: 2, desc: 'Va su un giacimento. +1,6 di gasolio al secondo.' },
  factory: { name: 'Fabbrica', w: 3, h: 2, hp: 1100, cost: 200, time: 28, sight: 6, armor: 4, desc: 'Produce i mezzi che progetti.' },
  lab: { name: 'Laboratorio', m: true, w: 2, h: 2, hp: 650, cost: 150, time: 22, sight: 5, armor: 2, desc: 'Sblocca telai, propulsioni e armi.' },
  tower: { name: 'Torretta', w: 1, h: 1, hp: 650, cost: 110, time: 14, sight: 8, armor: 5, desc: 'Difesa fissa. Gittata 5,5 caselle.' },
  depot: { name: 'Officina', w: 2, h: 2, hp: 700, cost: 140, time: 18, sight: 5, armor: 3, req: 'stRP', desc: 'Ripara i mezzi entro 3,5 caselle.' },
};
export const BUILD_ORDER = ['pump', 'factory', 'lab', 'tower', 'depot'];
export const BUILDER = { hp: 240, speed: 66, cost: 60, time: 12, armor: 1 };
export const PUMP_RATE = 1.6;

export const TECH = [
  { id: 'wCN', name: 'Cannone 40 mm', cost: 80, time: 25, req: [], desc: 'Arma a colpo singolo, efficace contro i mezzi corazzati.' },
  { id: 'prHT', name: 'Semicingoli', cost: 70, time: 20, req: [], desc: 'Scafo +20%, velocità 85%.' },
  { id: 'chM', name: 'Telaio medio Lince', cost: 100, time: 30, req: [], desc: '300 punti struttura, corazza 2.' },
  { id: 'pump2', name: 'Pompe ad alta pressione', cost: 120, time: 35, req: [], desc: '+50% di gasolio da ogni pompa.' },
  { id: 'stRP', name: 'Officina da campo', cost: 80, time: 20, req: [], desc: 'Sblocca l’officina che ripara i mezzi vicini.' },
  { id: 'twCN', name: 'Torretta a cannone', cost: 100, time: 30, req: ['wCN'], desc: 'Tutte le torrette passano al cannone 40 mm.' },
  { id: 'prT', name: 'Cingoli', cost: 110, time: 35, req: ['prHT'], desc: 'Scafo +50%, velocità 68%.' },
  { id: 'prV', name: 'Hovercraft', cost: 110, time: 35, req: ['prHT'], desc: 'Veloce, attraversa l’acqua, scafo −20%.' },
  { id: 'wRK', name: 'Razziera', cost: 120, time: 40, req: ['wCN'], desc: 'Salve di due razzi, gittata 6,5, danno ad area.' },
  { id: 'chH', name: 'Telaio pesante Bisonte', cost: 150, time: 45, req: ['chM'], desc: '500 punti struttura, corazza 4.' },
  { id: 'arm', name: 'Corazza composita', cost: 150, time: 45, req: ['chM'], desc: '+2 corazza a tutti i mezzi, anche quelli già in campo.' },
  { id: 'wMO', name: 'Mortaio 81 mm', cost: 150, time: 45, req: ['wRK'], desc: 'Tiro indiretto fino a 9 caselle. Non spara sotto 2,5.' },
];
export const TECH_BY = Object.fromEntries(TECH.map(t => [t.id, t]));

export const DIFF = {
  facile: { label: 'Recluta', inc: 0.8, first: 330, gap: 130, w0: 3, wmax: 10, rs: 1.3 },
  normale: { label: 'Veterano', inc: 1.0, first: 240, gap: 105, w0: 4, wmax: 14, rs: 1.0 },
  difficile: { label: 'Comandante', inc: 1.3, first: 170, gap: 85, w0: 5, wmax: 20, rs: 0.8 },
};
export const AI_TECH = ['wCN', 'prHT', 'chM', 'pump2', 'twCN', 'prT', 'wRK', 'arm', 'chH', 'stRP', 'wMO'];
