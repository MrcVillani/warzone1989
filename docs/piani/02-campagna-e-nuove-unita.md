# Piano 02 · Comandi con un clic, nuove unità, campagna

Richiesta del proprietario: poter cliccare sulla mappa per spostare le unità, avere molte più unità, e una campagna
bilanciata in cui si sviluppano unità via via più potenti.

Il lavoro è diviso in tre fasi. Ogni fase si chiude con test verdi, un APK aggiornato e un riepilogo al proprietario.

## Fase A · Comandi con un clic (piccola)

Oggi con il mouse il clic sinistro seleziona e il clic destro dà l'ordine; un clic sinistro sul terreno vuoto
deseleziona. Su touch il tocco funziona già come ordine, ma i mezzi sono piccoli da toccare.

- **Clic sinistro (o tocco) sulla mappa con dei mezzi selezionati = ordine**: su terreno li sposta, su un nemico
  attacca, su un giacimento libero i genieri avviano una pompa, su un cantiere o un edificio danneggiato lo
  costruiscono o lo riparano. Il clic destro resta e fa la stessa cosa.
- Si seleziona cliccando un proprio mezzo o edificio, o trascinando un riquadro. Si deseleziona con Esc, con il
  pulsante «Deseleziona» (ora visibile anche con il mouse) o cliccando un proprio mezzo diverso.
- Area di tocco dei mezzi più ampia (almeno 22 px di raggio su touch) e pulsante «Tutto l'esercito» che seleziona
  tutti i mezzi armati.
- Resta il segno visivo dell'ordine sul punto cliccato. L'audio resta nel backlog.

Agenti: frontend (`client/input.js`, `client/ui.js`), tester. Nessun cambiamento al motore.

## Fase B · Più unità e ricerca a livelli

L'albero delle ricerche passa a **4 livelli tecnologici**. Le parti si combinano come oggi (telaio + propulsione +
arma), quindi i progetti possibili passano da 48 a circa 200.

| Livello | Telai | Propulsioni | Armi e moduli |
|---|---|---|---|
| I | Gheppio (leggero) | Ruote | Mitragliatrice binata |
| II | Lince (medio) | Semicingoli | Mitragliatrice pesante, Cannone 40 mm, Lanciafiamme (corto raggio, ad area), Modulo riparazione (cura i mezzi vicini) |
| III | Bisonte (pesante) | Cingoli, Hovercraft | Cannone 75 mm, Razziera, Missile anticarro filoguidato (lunga gittata, colpo singolo potente), Mortaio 81 mm |
| IV | Mammut (superpesante, nuovo) | Cingoli rinforzati (nuova: più scafo, lenta) | Cannone 105 mm a canna lunga, Obice 120 mm (artiglieria a lunghissima gittata), Lanciarazzi multiplo pesante |

Ricerche di potenziamento, anch'esse a livelli: corazza (I, II, III), danno per famiglia d'arma (mitragliatrici,
cannoni, razzi e missili, artiglieria, fiamma: +20% per grado), motori (+10% velocità), pompe (II e III), torrette
(mitragliatrice → cannone 40 → cannone 75). Nuovo edificio di livello III: **bunker pesante**.

Limite di mezzi da 60 a **100** per lato, con una prova di prestazioni (60 fotogrammi al secondo su telefono simulato
con 200 mezzi in campo).

Ogni livello richiede di aver completato almeno due ricerche del livello precedente, così le unità più forti arrivano
dopo un percorso.

Agenti: backend (dati, nuove meccaniche: area della fiamma, cura, colpo singolo dei missili, artiglieria; IA che usa
le parti nuove), frontend (disegno delle nuove parti, scheda Ricerca divisa per livelli, scheda Progetta con le nuove
voci), tester.

## Fase C · Campagna «Operazione Valle Grigia»

Otto missioni in sequenza. **Le ricerche completate e i progetti salvati passano da una missione alla successiva**:
il giocatore costruisce davvero il suo esercito lungo la campagna. Ogni missione apre un livello tecnologico in più e
mette contro un nemico più avanzato.

| # | Missione | Obiettivo | Livelli aperti | Nemico |
|---|---|---|---|---|
| 1 | Testa di ponte | Avvia 4 pompe e distruggi l'avamposto nemico (senza fabbrica) | I | livello I, debole |
| 2 | I pozzi del guado | Tieni 6 pompe per 3 minuti | I–II | livello I |
| 3 | La colonna dei rifornimenti | Resisti 12 minuti a ondate crescenti | I–II | livello II, solo ondate |
| 4 | Il passo dei larici | Distruggi comando e fabbriche nemiche | I–III | livello II |
| 5 | La diga di Serra Alta | Distruggi la base oltre il lago (mappa d'acqua: servono gli hovercraft o il guado) | I–III | livello III |
| 6 | Due fuochi | Distruggi due basi nemiche | I–III | livello III, due basi |
| 7 | Contrattacco | Resisti 8 minuti, poi distruggi la base | I–IV | livello III → IV |
| 8 | Il comando del Direttorio | Assalto finale alla base fortificata | I–IV | livello IV, rendita alta, bunker |

- Prima di ogni missione: schermata di briefing con obiettivo, mappa e livelli disponibili. Durante: obiettivo e
  avanzamento sempre visibili. Alla fine: rapporto e passaggio alla missione successiva.
- Il menu iniziale offre **Campagna** (riprendi o ricomincia) e **Schermaglia** (la partita libera di oggi, con tutti
  i livelli e la scelta della difficoltà).
- I progressi si salvano sul dispositivo (anche nell'app Android). Si possono rigiocare le missioni già superate.
- Le mappe della campagna usano semi fissi scelti in fase di bilanciamento, con ritocchi per missione (basi, giacimenti,
  acqua).

### Bilanciamento

Il tester costruisce una **simulazione automatica**: un giocatore guidato dall'IA gioca ogni missione con il livello
tecnologico che avrebbe un giocatore reale a quel punto della campagna. Per ogni missione si misurano tasso di
vittoria e durata su 20 partite. Obiettivo: missione 1 vinta quasi sempre in 8–12 minuti, poi difficoltà crescente
fino alla missione 8, vinta in 25–35 minuti e non sempre. Il backend ritocca costi, danni, tempi e rendita finché i
numeri non tornano. Il rapporto finisce in `docs/bilanciamento.md`.

Agenti: backend (configurazione delle missioni, obiettivi, ricerche persistenti, IA del giocatore per la
simulazione), frontend (menu, briefing, indicatore dell'obiettivo, salvataggio dei progressi), tester (prove,
simulazione di bilanciamento, rapporto).

## Contratto (fasi B e C)

- `engine/data.js`: campo `tier` su telai, propulsioni, armi, edifici e ricerche; nuove voci; `MISSIONS` con la
  configurazione di ogni missione.
- `engine/world.js`: `newGame(diff, seed, opts)` con `opts.mission` e `opts.tech` (ricerche portate dalla campagna);
  `S.mission` e `S.objective` (`{type, target, progress, done}`) nello stato.
- Eventi nuovi: `objective` (avanzamento), `end` con `{won, reason}`.
- `engine/campaign.js`: funzioni pure per il passaggio tra missioni (`nextCampaignState`), senza accesso al dispositivo;
  il salvataggio su `localStorage` è del client.

## Verifica

Per ogni fase: `npm test`, `npm run e2e` (tre profili), `npm run android` con `tests/android/verify-apk.mjs`.
Per la fase C anche la simulazione di bilanciamento e la prova che la campagna si completa dall'inizio alla fine.
