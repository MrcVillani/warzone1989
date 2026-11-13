// Punto d'ingresso del motore: il client e i test importano solo da qui.
export * from './data.js';
export * from './util.js';
export { genMap, bfsReach, missionMap, FORDS, LAKE_HALF } from './map.js';
export { MAPS, MAP_BY, mapDef, drawnMap, parseMap } from './maps/index.js';
export * from './world.js';
export * from './path.js';
export * from './orders.js';
export * from './combat.js';
export { step, alive, pumpRate, updUnit, updStruct, followPath } from './sim.js';
export { aiTick, aiDesign } from './ai.js';
export { updateObjective, missionTick } from './mission.js';
export * from './campaign.js';
