// Dati di gioco: mappa, telai, propulsioni, armi, edifici, ricerche, difficoltà.
// Nessuna dipendenza dal DOM: questo file è usato dal motore, dal client e dai test.

export const TILE = 32, MW = 64, MH = 64, N = MW * MH;
export const GROUND = 0, DIRT = 1, WATER = 2, ROCK = 3, FOREST = 4;
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
export const PROPS = {
  W: { name: 'Ruote', short: 'Ruote', tier: 1, speed: 1.0, hpm: 1.0, cost: 15, water: false, req: null },
  HT: { name: 'Semicingoli', short: 'Semic.', tier: 2, speed: 0.85, hpm: 1.2, cost: 35, water: false, req: 'prHT' },
  T: { name: 'Cingoli', short: 'Cingoli', tier: 3, speed: 0.68, hpm: 1.5, cost: 60, water: false, req: 'prT' },
  V: { name: 'Hovercraft', short: 'Hover', tier: 3, speed: 1.35, hpm: 0.8, cost: 50, water: true, req: 'prV' },
  TR: { name: 'Cingoli rinforzati', short: 'Cing. rinf.', tier: 4, speed: 0.58, hpm: 1.8, cost: 90, water: false, req: 'prTR' },
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
export const BUILDER = { hp: 240, speed: 66, cost: 60, time: 12, armor: 1 };
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
