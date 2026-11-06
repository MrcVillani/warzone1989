// Punto d'ingresso del motore: il client e i test importano solo da qui.
export * from './data.js';
export * from './util.js';
export { genMap, bfsReach } from './map.js';
export * from './world.js';
export * from './path.js';
export * from './orders.js';
export * from './combat.js';
export { step, alive, pumpRate, updUnit, updStruct, followPath } from './sim.js';
export { aiTick, aiDesign } from './ai.js';
