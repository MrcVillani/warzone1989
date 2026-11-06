# Architettura

Il gioco è diviso in due parti che si parlano attraverso un contratto stretto.

```mermaid
flowchart LR
  subgraph engine["engine/ · backend"]
    data[data.js<br>bilanciamento] --> world[world.js<br>stato S, entità, nebbia, eventi]
    map[map.js<br>generazione mappa] --> world
    world --> path[path.js<br>A*] --> orders[orders.js<br>ordini e azioni]
    orders --> combat[combat.js<br>danni e proiettili]
    combat --> sim[sim.js<br>step]
    ai[ai.js<br>IA nemica] --> sim
  end
  subgraph client["client/ · frontend"]
    main[main.js<br>ciclo e avvio] --> render[render.js<br>canvas]
    main --> ui[ui.js<br>pannello e schermate]
    main --> input[input.js<br>mouse, touch, tastiera]
  end
  sim -- "eventi: toast, fx, ping, fog, world, end" --> main
  input -- "funzioni: cmdMove, placeStruct, enqueue…" --> orders
  render -. "legge S" .-> world
```

## Motore (`engine/`)

Codice JavaScript puro (moduli ES), senza DOM: gira nel browser e in Node. Si importa solo da `engine/index.js`.

| File | Contenuto |
|---|---|
| `data.js` | costanti della mappa, telai, propulsioni, armi, edifici, ricerche, livelli di difficoltà |
| `util.js` | numeri casuali con seme, rumore per il terreno, angoli, riferimenti di settore (A1–H8) |
| `map.js` | mappa 64×64 simmetrica rispetto al centro, giacimenti, corridoi garantiti tra le basi |
| `world.js` | stato `S`, creazione di mezzi ed edifici, visibilità del giocatore, salvataggio, eventi |
| `path.js` | passabilità e percorsi A* a 8 direzioni, disposizione dei gruppi |
| `orders.js` | ordini (muovi, attacca, costruisci, ferma), piazzamento, produzione, ricerca |
| `combat.js` | distanze, scelta dei bersagli, danno con corazza, colpi, proiettili |
| `sim.js` | movimento, costruzione, produzione, torrette, officine, fine partita, `step(dt)` |
| `ai.js` | IA del Direttorio Ferreo: pompe, edifici, ricerca, produzione, difesa, ondate |

### Stato

`S` è un oggetto serializzabile in JSON: `seed`, `diff`, `time`, `ents` (mezzi ed edifici, con `id`), `res`
(gasolio per lato), `tech` (ricerche completate per lato), `designs` (progetti del giocatore), `ai`, `stats`,
`timers`, `phase` (`play`, `won`, `lost`). Terreno, giacimenti e occupazione si ricalcolano dal seme.

### Eventi verso il client

| Evento | Dati | Uso |
|---|---|---|
| `world` | — | nuova mappa: il client ridisegna il terreno |
| `fog` | — | visibilità aggiornata (ogni 0,2 s) |
| `fx` | `{k, …}` con `k` tra `boom`, `scorch`, `flash`, `tracer`, `hit`, `trail`, `spark`, `spray`, `chimney` | effetti visivi |
| `toast` | `{text, kind}` | avviso al giocatore (`kind`: vuoto, `warn`, `bad`) |
| `ping` | `{x, y}` | segnale sulla minimappa |
| `end` | `{won}` | fine partita |

## Client (`client/`)

| File | Contenuto |
|---|---|
| `index.html` | struttura della pagina (barra, mappa, pannello, copertina) |
| `style.css` | stile e token di colore |
| `state.js` | stato del solo client: selezione, camera, scheda attiva, effetti |
| `render.js` | terreno, edifici, mezzi, effetti, nebbia, minimappa |
| `input.js` | selezione, ordini, scorciatoie, touch e zoom |
| `ui.js` | pannello (Costruisci, Produzione, Ricerca, Progetta), avvisi, copertina, rapporto finale |
| `main.js` | collega eventi e moduli, ciclo di gioco, aggancio di test `window.__wz` |

## Build

`npm run build` (esbuild) produce un solo file con CSS e JavaScript in linea:

- `dist/index.html`: documento completo, per browser e per l'app Android;
- `dist/artifact.html`: frammento per l'anteprima pubblicata su claude.ai.

## Test

- `npm test`: test del motore in Node (`engine/test/`).
- `npm run e2e`: build, poi prova nel browser su computer e telefono (`tests/e2e/smoke.mjs`), con screenshot in
  `tests/e2e/out/`.
