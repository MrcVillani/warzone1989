// Dati di gioco: mappa, telai, propulsioni, armi, edifici, ricerche, difficoltà.
// Nessuna dipendenza dal DOM: questo file è usato dal motore, dal client e dai test.

export const TILE = 32, MW = 64, MH = 64, N = MW * MH;
export const GROUND = 0, DIRT = 1, WATER = 2, ROCK = 3, FOREST = 4, CITY = 5, ROAD = 6;
// Terreni, nell'ordine dei codici qui sopra. ch: lettera nelle mappe disegnate (engine/maps/); walk: attraversabile dai
// mezzi di terra (l'acqua solo dagli hovercraft); build: ci si può costruire. CITY è un isolato: si comporta come la
// roccia. ROAD (asfalto, anche i ponti sui canali) è terreno piano: ci si passa più veloci (campo road delle
// propulsioni) e ci si costruisce come sull'erba, così le basi e i giacimenti vicino alle strade restano usabili e un
// edificio può fare da sbarramento, come già sulla terra battuta dei guadi.
export const TERRAIN = [
  { name: 'Erba', ch: '.', walk: true, build: true },
  { name: 'Terra', ch: ':', walk: true, build: true },
  { name: 'Acqua', ch: '~', walk: false, build: false },
  { name: 'Roccia', ch: '^', walk: false, build: false },
  { name: 'Bosco', ch: 'T', walk: false, build: false },
  { name: 'Città', ch: '#', walk: false, build: false },
  { name: 'Strada', ch: '=', walk: true, build: true },
];
// Tabelle per codice di terreno (1 = sì), per i controlli veloci di passabilità e piazzamento.
export const WALKABLE = Uint8Array.from(TERRAIN, t => t.walk ? 1 : 0);
export const BUILDABLE = Uint8Array.from(TERRAIN, t => t.build ? 1 : 0);
// Casella percorribile con quel terreno: a terra, oppure anche l'acqua se water (hovercraft).
export const walkable = (v, water) => WALKABLE[v] === 1 || (!!water && v === WATER);
export const P = 0, E = 1;
export const UNIT_CAP = 100;
export const B0 = { x: 9, y: 9 };
export const B1 = { x: MW - 10, y: MH - 10 };

// tier: livello tecnologico (1–4). Le parti di livello I sono libere; le altre si sbloccano con la ricerca `req`.
export const CHASSIS = {
  L: { name: 'Gheppio', label: 'Leggero', tier: 1, hp: 170, armor: 0, cost: 40, wt: 1, size: [15, 10], rad: 8, req: null },
  M: { name: 'Lince', label: 'Medio', tier: 2, hp: 300, armor: 2, cost: 80, wt: 2, size: [19, 13], rad: 10, req: 'chM' },
  H: { name: 'Bisonte', label: 'Pesante', tier: 3, hp: 500, armor: 4, cost: 140, wt: 3, size: [23, 16], rad: 12, req: 'chH' },
  X: { name: 'Mammut', label: 'Superpesante', tier: 4, hp: 800, armor: 6, cost: 220, wt: 4, size: [27, 19], rad: 14, req: 'chX' },
};
// road: moltiplicatore di velocità sulla strada (ROAD): le ruote ne guadagnano di più, i cingoli poco.
export const PROPS = {
  W: { name: 'Ruote', short: 'Ruote', tier: 1, speed: 1.0, hpm: 1.0, cost: 15, water: false, road: 1.35, req: null },
  HT: { name: 'Semicingoli', short: 'Semic.', tier: 2, speed: 0.85, hpm: 1.2, cost: 35, water: false, road: 1.2, req: 'prHT' },
  T: { name: 'Cingoli', short: 'Cingoli', tier: 3, speed: 0.68, hpm: 1.5, cost: 60, water: false, road: 1.1, req: 'prT' },
  V: { name: 'Hovercraft', short: 'Hover', tier: 3, speed: 1.35, hpm: 0.8, cost: 50, water: true, road: 1.1, req: 'prV' },
  TR: { name: 'Cingoli rinforzati', short: 'Cing. rinf.', tier: 4, speed: 0.58, hpm: 1.8, cost: 90, water: false, road: 1.1, req: 'prTR' },
};
// family: famiglia dell'arma (mg, cannon, rocket, artillery, fire, support): decide quale ricerca di danno vale.
// proj: come si vede il colpo: 'tracer' (immediato), 'shell' (proiettile), 'rocket' (salva di `salvo` razzi ad area),
// 'missile' (missile filoguidato che insegue il bersaglio), 'mortar' (tiro a parabola ad area), 'flame' (getto di
// fiamma immediato, ad area), 'repair' (nessun colpo: ripara i mezzi alleati).
// Regole speciali: armorK moltiplica la corazza del bersaglio (la fiamma la conta la metà); vsStruct moltiplica il
// danno contro gli edifici; antiArmor aggiunge al danno questa frazione per ogni punto di corazza del bersaglio;
// heal: punti struttura riparati al secondo (con dmg 0), entro `range` caselle.
export const WEAPONS = {
  MG: { name: 'Mitragliatrice binata', short: 'MG', tier: 1, family: 'mg', dmg: 7, rof: 0.22, range: 4.5, splash: 0, proj: 'tracer', cost: 20, req: null },
  HMG: { name: 'Mitragliatrice pesante', short: 'MG pes.', tier: 2, family: 'mg', dmg: 11, rof: 0.24, range: 5.2, splash: 0, proj: 'tracer', cost: 35, req: 'wHMG' },
  CN: { name: 'Cannone 40 mm', short: 'Cannone', tier: 2, family: 'cannon', dmg: 38, rof: 1.5, range: 5.2, splash: 0, proj: 'shell', speed: 560, cost: 45, req: 'wCN' },
  FL: { name: 'Lanciafiamme', short: 'Fiamma', tier: 2, family: 'fire', dmg: 15, rof: 0.4, range: 2.5, splash: 0.9, proj: 'flame', armorK: 0.5, vsStruct: 1.5, cost: 40, req: 'wFL' },
  RP: { name: 'Modulo riparazione', short: 'Ripara', tier: 2, family: 'support', dmg: 0, heal: 15, rof: 0.3, range: 3, splash: 0, proj: 'repair', cost: 45, req: 'wRP' },
  CN75: { name: 'Cannone 75 mm', short: 'Cann. 75', tier: 3, family: 'cannon', dmg: 70, rof: 2.0, range: 6, splash: 0, proj: 'shell', speed: 600, cost: 75, req: 'wCN75' },
  RK: { name: 'Razziera', short: 'Razzi', tier: 3, family: 'rocket', dmg: 30, rof: 2.2, range: 6.5, splash: 0.9, proj: 'rocket', salvo: 2, speed: 330, cost: 65, req: 'wRK' },
  AT: { name: 'Missile anticarro filoguidato', short: 'Anticarro', tier: 3, family: 'rocket', dmg: 130, rof: 4.5, range: 7.5, splash: 0, proj: 'missile', speed: 260, antiArmor: 0.1, cost: 85, req: 'wAT' },
  MO: { name: 'Mortaio 81 mm', short: 'Mortaio', tier: 3, family: 'artillery', dmg: 48, rof: 3.2, range: 9, minRange: 2.5, splash: 1.3, proj: 'mortar', cost: 80, req: 'wMO' },
  CN105: { name: 'Cannone 105 mm a canna lunga', short: 'Cann. 105', tier: 4, family: 'cannon', dmg: 120, rof: 2.6, range: 7, splash: 0, proj: 'shell', speed: 680, cost: 110, req: 'wCN105' },
  HW: { name: 'Obice 120 mm', short: 'Obice', tier: 4, family: 'artillery', dmg: 115, rof: 6, range: 13, minRange: 3.5, splash: 2, proj: 'mortar', cost: 120, req: 'wHW' },
  MRL: { name: 'Lanciarazzi multiplo pesante', short: 'Lanciarazzi', tier: 4, family: 'rocket', dmg: 150, rof: 5, range: 9, splash: 1.1, proj: 'rocket', salvo: 6, speed: 300, cost: 120, req: 'wMRL' },
};
// key: chiave dell'arma, così chi riceve l'oggetto (colpi, eventi) sa quale arma è; le torrette la ereditano.
for (const [k, w] of Object.entries(WEAPONS)) w.key = k;
export const FAMILIES = { mg: 'Mitragliatrici', cannon: 'Cannoni', rocket: 'Razzi e missili', artillery: 'Artiglieria', fire: 'Fiamma', support: 'Supporto' };
export const TOWER_MG = Object.assign({}, WEAPONS.MG, { range: 5.5, dmg: 8 });
export const TOWER_CN = Object.assign({}, WEAPONS.CN, { range: 6.2, dmg: 42 });
export const TOWER_CN75 = Object.assign({}, WEAPONS.CN75, { range: 6.6, dmg: 74 });
export const BUNKER_W = Object.assign({}, WEAPONS.CN75, { range: 7, dmg: 78, rof: 1.8 });

// m: true = nome maschile (serve ai messaggi "pronto/pronta", "distrutto/distrutta").
export const STRUCTS = {
  hq: { name: 'Comando', m: true, tier: 1, w: 3, h: 3, hp: 1600, cost: 0, time: 1, sight: 9, armor: 4, desc: 'Addestra i genieri.' },
  pump: { name: 'Pompa', tier: 1, w: 1, h: 1, hp: 420, cost: 50, time: 10, sight: 4, armor: 2, desc: 'Va su un giacimento. +1,6 di gasolio al secondo.' },
  factory: { name: 'Fabbrica', tier: 1, w: 3, h: 2, hp: 1100, cost: 200, time: 28, sight: 6, armor: 4, desc: 'Produce i mezzi che progetti.' },
  lab: { name: 'Laboratorio', m: true, tier: 1, w: 2, h: 2, hp: 650, cost: 150, time: 22, sight: 5, armor: 2, desc: 'Sblocca telai, propulsioni e armi.' },
  tower: { name: 'Torretta', tier: 1, w: 1, h: 1, hp: 650, cost: 110, time: 14, sight: 8, armor: 5, desc: 'Difesa fissa. Gittata 5,5 caselle.' },
  depot: { name: 'Officina', tier: 1, w: 2, h: 2, hp: 700, cost: 140, time: 18, sight: 5, armor: 3, req: 'stRP', desc: 'Ripara i mezzi entro 3,5 caselle.' },
  bunker: { name: 'Bunker pesante', m: true, tier: 3, w: 2, h: 2, hp: 1800, cost: 320, time: 40, sight: 8, armor: 8, req: 'stBK', desc: 'Difesa corazzata con cannone 75 mm. Gittata 7 caselle.' },
};
export const BUILD_ORDER = ['pump', 'factory', 'lab', 'tower', 'depot', 'bunker'];
// I genieri vanno su ruote: sulla strada hanno il moltiplicatore delle ruote (road).
export const BUILDER = { hp: 240, speed: 66, cost: 60, time: 12, armor: 1, road: 1.35 };
export const PUMP_RATE = 1.6;

// Ricerche. tier: livello; per avviarne una di livello N+1 servono almeno TIER_GATE ricerche completate di livello N
// (oltre ai requisiti specifici in req). Effetti (eff): armor (+corazza ai mezzi), dmg = [famiglia, +frazione],
// speed (+frazione di velocità), pump (+frazione di gasolio dalle pompe), tower (arma delle torrette).
export const TIER_GATE = 2;
export const TIERS = ['I', 'II', 'III', 'IV'];
export const TECH = [
  // Livello I
  { id: 'dMG1', tier: 1, name: 'Proiettili perforanti', cost: 60, time: 18, req: [], eff: { dmg: ['mg', 0.2] }, desc: 'Mitragliatrici: +20% di danno.' },
  { id: 'mot1', tier: 1, name: 'Motori potenziati', cost: 70, time: 20, req: [], eff: { speed: 0.1 }, desc: '+10% di velocità a tutti i mezzi.' },
  { id: 'pump2', tier: 1, name: 'Pompe ad alta pressione', cost: 90, time: 25, req: [], eff: { pump: 0.5 }, desc: '+50% di gasolio da ogni pompa.' },
  { id: 'stRP', tier: 1, name: 'Officina da campo', cost: 70, time: 18, req: [], desc: 'Sblocca l’officina che ripara i mezzi vicini.' },
  // Livello II
  { id: 'chM', tier: 2, name: 'Telaio medio Lince', cost: 100, time: 30, req: [], desc: '300 punti struttura, corazza 2.' },
  { id: 'prHT', tier: 2, name: 'Semicingoli', cost: 70, time: 20, req: [], desc: 'Scafo +20%, velocità 85%.' },
  { id: 'wCN', tier: 2, name: 'Cannone 40 mm', cost: 80, time: 25, req: [], desc: 'Arma a colpo singolo, efficace contro i mezzi corazzati.' },
  { id: 'wHMG', tier: 2, name: 'Mitragliatrice pesante', cost: 80, time: 25, req: [], desc: 'Danno 11, gittata 5,2.' },
  { id: 'wFL', tier: 2, name: 'Lanciafiamme', cost: 90, time: 28, req: [], desc: 'Corto raggio, ad area. La corazza conta la metà; +50% contro gli edifici.' },
  { id: 'wRP', tier: 2, name: 'Modulo riparazione', cost: 90, time: 28, req: [], desc: 'Il mezzo ripara 15 punti al secondo al mezzo alleato più danneggiato entro 3 caselle.' },
  { id: 'twCN', tier: 2, name: 'Torretta a cannone', cost: 100, time: 30, req: ['wCN'], eff: { tower: 'CN' }, desc: 'Tutte le torrette passano al cannone 40 mm.' },
  { id: 'arm', tier: 2, name: 'Corazza composita I', cost: 130, time: 40, req: ['chM'], eff: { armor: 2 }, desc: '+2 corazza a tutti i mezzi, anche quelli già in campo.' },
  { id: 'dMG2', tier: 2, name: 'Mitragliatrici II', cost: 100, time: 30, req: ['dMG1'], eff: { dmg: ['mg', 0.2] }, desc: 'Mitragliatrici: altro +20% di danno.' },
  { id: 'dCN1', tier: 2, name: 'Granate perforanti', cost: 100, time: 30, req: ['wCN'], eff: { dmg: ['cannon', 0.2] }, desc: 'Cannoni: +20% di danno.' },
  { id: 'dFL1', tier: 2, name: 'Miscela incendiaria', cost: 100, time: 30, req: ['wFL'], eff: { dmg: ['fire', 0.2] }, desc: 'Lanciafiamme: +20% di danno.' },
  // Livello III
  { id: 'chH', tier: 3, name: 'Telaio pesante Bisonte', cost: 150, time: 45, req: ['chM'], desc: '500 punti struttura, corazza 4.' },
  { id: 'prT', tier: 3, name: 'Cingoli', cost: 110, time: 35, req: ['prHT'], desc: 'Scafo +50%, velocità 68%.' },
  { id: 'prV', tier: 3, name: 'Hovercraft', cost: 110, time: 35, req: ['prHT'], desc: 'Veloce, attraversa l’acqua, scafo −20%.' },
  { id: 'wCN75', tier: 3, name: 'Cannone 75 mm', cost: 140, time: 40, req: ['wCN'], desc: 'Danno 70, gittata 6.' },
  { id: 'wRK', tier: 3, name: 'Razziera', cost: 120, time: 40, req: [], desc: 'Salve di due razzi, gittata 6,5, danno ad area.' },
  { id: 'wAT', tier: 3, name: 'Missile anticarro filoguidato', cost: 150, time: 45, req: [], desc: 'Gittata 7,5, colpo singolo potente: +10% di danno per ogni punto di corazza del bersaglio.' },
  { id: 'wMO', tier: 3, name: 'Mortaio 81 mm', cost: 150, time: 45, req: [], desc: 'Tiro indiretto fino a 9 caselle. Non spara sotto 2,5.' },
  { id: 'twCN75', tier: 3, name: 'Torretta a cannone 75', cost: 150, time: 40, req: ['twCN', 'wCN75'], eff: { tower: 'CN75' }, desc: 'Tutte le torrette passano al cannone 75 mm.' },
  { id: 'stBK', tier: 3, name: 'Bunker pesante', cost: 160, time: 45, req: [], desc: 'Sblocca il bunker: 1800 punti struttura, corazza 8, cannone 75 mm.' },
  { id: 'arm2', tier: 3, name: 'Corazza composita II', cost: 180, time: 50, req: ['arm'], eff: { armor: 2 }, desc: 'Altri +2 di corazza a tutti i mezzi.' },
  { id: 'mot2', tier: 3, name: 'Motori a turbina', cost: 140, time: 40, req: ['mot1'], eff: { speed: 0.1 }, desc: 'Altro +10% di velocità a tutti i mezzi.' },
  { id: 'pump3', tier: 3, name: 'Pompe a doppio stadio', cost: 180, time: 50, req: ['pump2'], eff: { pump: 0.3 }, desc: 'Altro +30% di gasolio da ogni pompa.' },
  { id: 'dMG3', tier: 3, name: 'Mitragliatrici III', cost: 140, time: 40, req: ['dMG2'], eff: { dmg: ['mg', 0.2] }, desc: 'Mitragliatrici: altro +20% di danno.' },
  { id: 'dCN2', tier: 3, name: 'Cannoni II', cost: 150, time: 45, req: ['dCN1'], eff: { dmg: ['cannon', 0.2] }, desc: 'Cannoni: altro +20% di danno.' },
  { id: 'dFL2', tier: 3, name: 'Fiamma II', cost: 140, time: 40, req: ['dFL1'], eff: { dmg: ['fire', 0.2] }, desc: 'Lanciafiamme: altro +20% di danno.' },
  { id: 'dRK1', tier: 3, name: 'Testate cave', cost: 140, time: 40, req: ['wRK'], eff: { dmg: ['rocket', 0.2] }, desc: 'Razzi e missili: +20% di danno.' },
  { id: 'dAR1', tier: 3, name: 'Spolette di prossimità', cost: 140, time: 40, req: ['wMO'], eff: { dmg: ['artillery', 0.2] }, desc: 'Artiglieria: +20% di danno.' },
  // Livello IV
  { id: 'chX', tier: 4, name: 'Telaio superpesante Mammut', cost: 220, time: 60, req: ['chH'], desc: '800 punti struttura, corazza 6.' },
  { id: 'prTR', tier: 4, name: 'Cingoli rinforzati', cost: 180, time: 50, req: ['prT'], desc: 'Scafo +80%, velocità 58%.' },
  { id: 'wCN105', tier: 4, name: 'Cannone 105 mm a canna lunga', cost: 220, time: 55, req: ['wCN75'], desc: 'Danno 120, gittata 7.' },
  { id: 'wHW', tier: 4, name: 'Obice 120 mm', cost: 240, time: 60, req: ['wMO'], desc: 'Tiro indiretto fino a 13 caselle, area ampia. Non spara sotto 3,5.' },
  { id: 'wMRL', tier: 4, name: 'Lanciarazzi multiplo pesante', cost: 220, time: 55, req: ['wRK'], desc: 'Salve di sei razzi, gittata 9, danno ad area.' },
  { id: 'arm3', tier: 4, name: 'Corazza composita III', cost: 240, time: 60, req: ['arm2'], eff: { armor: 2 }, desc: 'Altri +2 di corazza a tutti i mezzi.' },
  { id: 'dCN3', tier: 4, name: 'Cannoni III', cost: 200, time: 50, req: ['dCN2'], eff: { dmg: ['cannon', 0.2] }, desc: 'Cannoni: altro +20% di danno.' },
  { id: 'dFL3', tier: 4, name: 'Fiamma III', cost: 180, time: 50, req: ['dFL2'], eff: { dmg: ['fire', 0.2] }, desc: 'Lanciafiamme: altro +20% di danno.' },
  { id: 'dRK2', tier: 4, name: 'Razzi e missili II', cost: 200, time: 50, req: ['dRK1'], eff: { dmg: ['rocket', 0.2] }, desc: 'Razzi e missili: altro +20% di danno.' },
  { id: 'dRK3', tier: 4, name: 'Razzi e missili III', cost: 240, time: 60, req: ['dRK2'], eff: { dmg: ['rocket', 0.2] }, desc: 'Razzi e missili: altro +20% di danno.' },
  { id: 'dAR2', tier: 4, name: 'Artiglieria II', cost: 200, time: 50, req: ['dAR1'], eff: { dmg: ['artillery', 0.2] }, desc: 'Artiglieria: altro +20% di danno.' },
  { id: 'dAR3', tier: 4, name: 'Artiglieria III', cost: 240, time: 60, req: ['dAR2'], eff: { dmg: ['artillery', 0.2] }, desc: 'Artiglieria: altro +20% di danno.' },
];
export const TECH_BY = Object.fromEntries(TECH.map(t => [t.id, t]));

export const DIFF = {
  facile: { label: 'Recluta', inc: 0.8, first: 330, gap: 130, w0: 3, wmax: 10, rs: 1.3 },
  normale: { label: 'Veterano', inc: 1.0, first: 240, gap: 105, w0: 4, wmax: 14, rs: 1.0 },
  difficile: { label: 'Comandante', inc: 1.3, first: 170, gap: 85, w0: 5, wmax: 20, rs: 0.8 },
};
// Quota della scala delle difficoltà che vale in missione, per difficoltà (in schermaglia vale DIFF per intero):
// rendita (inc), tempi di ricerca (rs) e ondate (waves: prima ondata, intervallo, dimensione iniziale e massima).
// 0 = come «Veterano», 1 = scala piena. «Recluta» resta con la scala piena; «Comandante» ne prende una piccola quota,
// perché le missioni sono già tarate al limite e la scala piena le rende invincibili dalla terza in poi.
export const MISSION_DIFF = {
  facile: { inc: 1, rs: 1, waves: 1 },
  normale: { inc: 0, rs: 0, waves: 0 },
  difficile: { inc: 0.1, rs: 0.25, waves: 0.2 },
};
// Limite dell'esercito dell'IA: mezzi in campo più quelli in coda nelle sue fabbriche (genieri esclusi).
export const AI_ARMY = 50;
// Mezzi superati che l'IA al limite, senza difensori da mandare all'attacco, richiama in base alla volta per smontarli.
export const AI_RECALL = 4;
// Secondi senza progressi (con genieri assegnati) dopo cui l'IA smonta un suo edificio incompiuto.
export const AI_STALL = 45;
// Ordine di ricerca dell'IA, per livelli: prende la prima disponibile (requisiti e livello) che si può pagare.
export const AI_TECH = [
  'pump2', 'dMG1', 'mot1',
  'wCN', 'chM', 'prHT', 'twCN', 'wHMG', 'dCN1', 'arm', 'wRP', 'wFL',
  'chH', 'prT', 'wCN75', 'stBK', 'wAT', 'arm2', 'wRK', 'dCN2', 'pump3', 'twCN75', 'wMO',
  'chX', 'wCN105', 'prTR', 'arm3', 'dCN3', 'wHW', 'wMRL', 'dRK1', 'dAR1', 'mot2', 'dRK2', 'dAR2', 'stRP',
];

// Ordine di ricerca dell'IA del giocatore (S.autoplay): quello del nemico più le ricerche che l'IA nemica non usa
// (hovercraft dopo i cingoli; mitragliatrici, fiamma e ultimi potenziamenti in fondo), così in campagna il giocatore
// guidato dall'IA può completare tutto l'albero. L'hovercraft passa davanti quando serve (mappe d'acqua, vedi ai.js).
export const AI_TECH_P = (() => {
  const l = AI_TECH.slice();
  l.splice(l.indexOf('prT') + 1, 0, 'prV');
  l.push('dMG2', 'dFL1', 'dMG3', 'dFL2', 'dFL3', 'dRK3', 'dAR3');
  return l;
})();

// IA dalla parte del giocatore (S.autoplay, per le simulazioni di bilanciamento): tempi e dimensioni delle sue ondate;
// edge: vantaggio minimo (valore dei suoi difensori diviso valore dell'esercito e delle difese nemiche) per attaccare,
// con torrette e bunker nemici contati per defW volte il loro costo;
// first: primo attacco (s), in missione e in schermaglia; factories: fabbriche massime; hover: quota di hovercraft
// nella produzione quando servono, cioè quando la strada via terra verso il comando nemico è più lunga di hoverGain
// volte quella sull'acqua.
export const AI_PLAYER = { label: 'IA del giocatore', first: 600, gap: 95, w0: 6, wmax: 22, wstep: 2, edge: 1.2, defW: 0.5, hover: 0.7, hoverGain: 1.6, factories: 3 };

/* ---------- campagna «Operazione Valle Grigia» ----------
   Ottobre 1989, Valle del Serra: la Brigata Aurora (giocatore) contro il Direttorio Ferreo (IA).
   Ogni missione:
   - objective: { type, ... } con type tra 'outpost' (pumps: pompe da avviare, poi distruggere tutti gli edifici
     nemici), 'hold' (pumps attive per time secondi consecutivi), 'survive' (resistere time secondi),
     'destroy' (comando, fabbriche e genieri nemici), 'survive_then_destroy' (time secondi, poi la base),
     'destroy_all_bases' (tutte le basi nemiche);
   - maxTier: livello massimo che il giocatore può ricercare in questa missione;
   - seed: seme della mappa (provvisorio, da fissare con il bilanciamento); map: ritocchi alla mappa
     (lake: lago al centro con due guadi; bases: 2 = seconda base nemica in ENEMY_BASE2);
   - player: gasolio iniziale (res), genieri (builders), mezzi (units: progetti), edifici già pronti (structs);
   - enemy: ricerche già completate (tech), livello massimo che può ricercare (maxTier), moltiplicatore di rendita
     (inc) e di tempo di ricerca (rs), costruisce o no (build: true, false o 'repair', cioè i genieri riparano
     soltanto e non piazzano edifici nuovi), ondate ('base' dalla sua base, 'edge' da fuori mappa,
     'none'), prima ondata (first, s), intervallo (gap, s), dimensione iniziale (w0), massima (wmax) e crescita per
     ondata (wstep), fabbriche massime che costruisce (factories, predefinito 2), quota dei difensori che resta in
     base quando parte un'ondata (keep, da 0 a 1, predefinito 0); bases: per ogni base comando (hq), fabbriche, laboratori, torrette, bunker, pompe, genieri e mezzi
     iniziali (x, y facoltativi: centro della base, altrimenti B1).
     I tempi e le dimensioni delle ondate (e la rendita e i tempi di ricerca) sono per «Veterano»: le altre difficoltà
     li scalano secondo DIFF, per la quota in MISSION_DIFF (vedi enemyConfig in mission.js).
   - timeLimit (facoltativo, s): oltre questo tempo la missione è persa. */
export const ENEMY_BASE2 = { x: MW - 11, y: 10 };
const ET = n => AI_TECH.slice(0, n); // le prime n ricerche dell'IA, nel suo ordine (che rispetta requisiti e livelli)
const LMG = { c: 'L', p: 'W', w: 'MG' }, MCN = { c: 'M', p: 'HT', w: 'CN' }, MHMG = { c: 'M', p: 'HT', w: 'HMG' }, HCN = { c: 'H', p: 'T', w: 'CN75' };
export const MISSIONS = [
  {
    id: 'testa-di-ponte', name: 'Testa di ponte', seed: 1101, maxTier: 1, map: {},
    brief: '12 ottobre 1989. La Brigata Aurora ha passato il Serra di notte e tiene una striscia di riva. ' +
      'A sud-est il Direttorio Ferreo ha lasciato un avamposto senza fabbriche, ma irto di torrette che i suoi genieri riparano. ' +
      'Metti in funzione sei pompe per dare gasolio alla testa di ponte, poi spazza via l’avamposto.',
    objective: { type: 'outpost', pumps: 6 },
    player: { res: 600, builders: 2, units: [LMG, LMG, LMG], structs: [] },
    enemy: {
      tech: [], maxTier: 1, inc: 0.6, build: 'repair', factories: 0, waves: 'none',
      bases: [{ hq: 1, towers: 12, pumps: 2, builders: 3, units: [LMG, LMG, LMG, LMG, LMG, LMG] }],
    },
  },
  {
    id: 'pozzi-del-guado', name: 'I pozzi del guado', seed: 2202, maxTier: 2, map: {},
    brief: 'I pozzi lungo il guado sono l’unica riserva di gasolio rimasta nella valle, e il Direttorio li vuole quanto noi. ' +
      'La sua base è a poche ore di marcia e manderà le prime colonne presto. ' +
      'Metti in funzione otto pompe e tienile attive per nove minuti di fila: ai convogli basta questo.',
    objective: { type: 'hold', pumps: 8, time: 540 },
    player: { res: 700, builders: 3, units: [LMG, LMG, LMG], structs: [] },
    enemy: {
      tech: ['pump2'], maxTier: 1, inc: 1.0, build: true, waves: 'base', first: 150, gap: 90, w0: 4, wmax: 10,
      bases: [{ hq: 1, builders: 2, units: [LMG, LMG] }],
    },
  },
  {
    id: 'colonna-rifornimenti', name: 'La colonna dei rifornimenti', seed: 3303, maxTier: 2, map: {},
    brief: 'Una nostra colonna di rifornimenti è ferma in fondo alla valle, con il ponte ancora da riparare. ' +
      'Il Direttorio non ha basi in zona, ma i suoi reparti mobili entreranno dai bordi, uno dopo l’altro e sempre più numerosi. ' +
      'Resisti dodici minuti, finché la colonna non è passata.',
    objective: { type: 'survive', time: 720 },
    player: { res: 900, builders: 3, units: [LMG, LMG, LMG, LMG], structs: ['factory'] },
    enemy: {
      tech: ET(10), maxTier: 2, build: false, waves: 'edge', first: 100, gap: 70, w0: 4, wmax: 18, wstep: 2,
      bases: [],
    },
  },
  {
    id: 'passo-dei-larici', name: 'Il passo dei larici', seed: 4401, maxTier: 3, map: {},
    brief: 'Oltre il passo dei larici il Direttorio ha messo in piedi la sua prima base vera, con fabbrica e laboratorio. ' +
      'Da lì partono i mezzi che ci hanno colpito al guado. ' +
      'Distruggi il comando, le fabbriche e i genieri nemici e apri la strada verso nord.',
    objective: { type: 'destroy' },
    player: { res: 800, builders: 3, units: [LMG, LMG, MCN, MCN], structs: [] },
    enemy: {
      tech: ET(8), maxTier: 2, inc: 0.95, build: true, waves: 'base', first: 280, gap: 110, w0: 4, wmax: 14,
      bases: [{ hq: 1, factory: 1, lab: 1, towers: 9, pumps: 2, builders: 2, units: [MHMG, MCN, LMG, LMG] }],
    },
  },
  {
    id: 'diga-serra-alta', name: 'La diga di Serra Alta', seed: 5564, maxTier: 3, map: { lake: true },
    brief: 'Il Direttorio ha aperto le chiuse della diga di Serra Alta e metà valle è finita sott’acqua. ' +
      'La sua base è oltre il lago: si arriva solo dai due guadi stretti ai lati, oppure sull’acqua con gli hovercraft. ' +
      'Scegli la strada e distruggi la base.',
    objective: { type: 'destroy' },
    player: { res: 900, builders: 3, units: [MCN, MCN, MHMG, MHMG], structs: [] },
    enemy: {
      tech: ET(20), maxTier: 3, inc: 1.1, build: true, waves: 'base', first: 280, gap: 110, w0: 5, wmax: 16, keep: 0.5, factories: 3,
      bases: [{ hq: 1, factory: 1, lab: 1, towers: 6, bunkers: 2, pumps: 2, builders: 2, units: [MCN, MCN, MHMG] }],
    },
  },
  {
    id: 'due-fuochi', name: 'Due fuochi', seed: 6612, maxTier: 3, map: { bases: 2 },
    brief: 'Il nemico ha diviso le forze in due basi, una a est e una a sud-est, e prova a stringerci in mezzo. ' +
      'Se ne resta in piedi una, l’altra rinasce in pochi giorni. ' +
      'Distruggi tutte e due le basi del Direttorio.',
    objective: { type: 'destroy_all_bases' },
    player: { res: 1000, builders: 3, units: [MCN, MCN, MCN, MHMG, MHMG, LMG], structs: ['factory'] },
    enemy: {
      tech: ET(16), maxTier: 3, inc: 1.0, build: true, waves: 'base', first: 360, gap: 140, w0: 5, wmax: 16, factories: 3, keep: 0.4,
      bases: [
        { hq: 1, factory: 1, lab: 1, towers: 2, pumps: 2, builders: 2, units: [MCN, MCN, MHMG] },
        { x: ENEMY_BASE2.x, y: ENEMY_BASE2.y, hq: 1, factory: 1, towers: 2, pumps: 2, builders: 1, units: [MCN, MHMG] },
      ],
    },
  },
  {
    id: 'contrattacco', name: 'Contrattacco', seed: 7707, maxTier: 4, map: {},
    brief: 'Il Direttorio ha richiamato le riserve e lancia tutto contro la nostra linea. ' +
      'Per otto minuti dovrai solo tenere: i rinforzi non arriveranno prima. ' +
      'Poi passa al contrattacco e distruggi la base da cui partono le colonne.',
    objective: { type: 'survive_then_destroy', time: 480 },
    player: { res: 1200, builders: 3, units: [HCN, MCN, MCN, MCN, MHMG, MHMG], structs: ['factory', 'lab', 'tower', 'tower'] },
    enemy: {
      tech: ET(20), maxTier: 4, inc: 0.9, build: true, waves: 'base', first: 130, gap: 80, w0: 5, wmax: 14,
      bases: [{ hq: 1, factory: 2, lab: 1, towers: 5, bunkers: 2, pumps: 3, builders: 3, units: [HCN, MCN, MCN, MHMG] }],
    },
  },
  {
    id: 'comando-direttorio', name: 'Il comando del Direttorio', seed: 8838, maxTier: 4, map: {},
    brief: '31 ottobre 1989. Il comando del Direttorio Ferreo è in fondo alla valle, dietro bunker e torrette. ' +
      'Ha i mezzi migliori e una rendita che sembra non finire mai. ' +
      'È l’assalto finale: distruggi comando, fabbriche e genieri, e la Valle del Serra è libera.',
    objective: { type: 'destroy' },
    player: { res: 2500, builders: 3, units: [HCN, HCN, MCN, MCN, MHMG, MHMG], structs: ['factory', 'factory', 'lab', 'tower', 'tower', 'tower', 'bunker', 'bunker'] },
    enemy: {
      tech: ET(26), maxTier: 4, inc: 1.1, build: true, waves: 'base', first: 360, gap: 150, w0: 8, wmax: 24, factories: 4, keep: 0.75,
      bases: [{ hq: 1, factory: 2, lab: 2, towers: 8, bunkers: 6, pumps: 4, builders: 3, units: [HCN, HCN, MCN, MCN, MHMG] }],
    },
  },
];
export const MISSION_BY = Object.fromEntries(MISSIONS.map(m => [m.id, m]));
// Missione da indice (0–7) o da id; undefined se non esiste.
export function missionOf(m) { return typeof m === 'number' ? MISSIONS[m] : MISSION_BY[m]; }
// Progetto di partenza dei nuovi giocatori (e della campagna).
export const DEFAULT_DESIGNS = [{ c: 'L', p: 'W', w: 'MG' }];
