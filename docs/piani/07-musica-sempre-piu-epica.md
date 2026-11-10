# Piano 07 · Colonna sonora sempre più epica lungo la campagna

Richiesta del proprietario: colonne personalizzate per le missioni, sempre più epiche man mano che si avanza nella
campagna.

## Scelte

- **Una scala di epicità da 1 a 8**, una per missione, nel profilo (`epic`). Ogni missione conserva il suo carattere
  (piano 06: tonalità, tempo, variante del tema), ma l'orchestra cresce con la scala. Ogni gradino aggiunge qualcosa
  e non toglie niente di quello che c'era al gradino prima:

| Livello | Missione | Cosa si aggiunge |
|---|---|---|
| 1 | Testa di ponte | piccolo gruppo: legno, un corno, arpa, archi; battaglia trattenuta (com'è oggi) |
| 2 | I pozzi del guado | timpani e archi gravi in ostinato; prima apparizione del **motivo della Brigata** (4 note, solo in un frammento) |
| 3 | La colonna dei rifornimenti | sezione di corni a due voci, rullante militare, tamburi da guerra |
| 4 | Il passo dei larici | coro lontano, trombe, piatti in crescendo nei passaggi di battaglia |
| 5 | La diga di Serra Alta | coro pieno, tromboni e tuba, archi raddoppiati all'ottava, sala più ampia |
| 6 | Due fuochi | ensemble di tamburi grandi, contrappunto tra due sezioni di ottoni, motivo della Brigata completo |
| 7 | Contrattacco | tutti gli strumenti; nella fase 2 il motivo della Brigata diventa il tema trionfale |
| 8 | Il comando del Direttorio | orchestra e coro al completo, ottoni all'ottava, **culmine** nelle battaglie più dure |

- **Motivo della Brigata**: un motivo originale di quattro note che lega la campagna. Nasce in frammenti nelle prime
  missioni, si completa a metà campagna e torna pieno in «Contrattacco», nel «Comando del Direttorio» e in «Valle
  liberata».
- **Culmine** (dal livello 6): quando lo scontro è molto intenso, entra un ultimo strato di tutta l'orchestra. Il
  passaggio è con dissolvenza, come per la battaglia.
- **Nuovi timbri sintetizzati**, se servono: tromba, trombone e tuba, coro su vocali, tamburi grandi d'insieme, archi
  staccati. Tutto originale, generato con Web Audio come oggi.
- **Volume**: più strati non vuol dire più forte. Picco sempre sotto −1 dBFS, e la scala si sente nella pienezza e
  nella densità, non nel volume.
- **Prestazioni**: limite di voci rispettato anche al livello 8 con il culmine; nessun calo di fluidità con 200
  mezzi.
- **Invariati**: schermaglia, menu e comandi della musica. «Valle liberata» riprende il motivo della Brigata a
  orchestra piena.
- **Album rigenerato** con `npm run ost`: stessi titoli, stessi 11 brani, con le versioni nuove.

## Sotto-compiti

| # | Agente | Compito |
|---|---|---|
| 1 | frontend | scala `epic` nei profili, strati e timbri nuovi, motivo della Brigata, culmine, rigenerazione dell'album in `client/music.js` e `scripts/ost.mjs` |
| 2 | tester | controlli: ogni livello contiene gli strati del precedente; la densità in battaglia cresce con la missione (e i livelli restano sotto −1 dBFS); il motivo compare dove previsto; culmine solo dal livello 6; schermaglia invariata; prestazioni |

Contratto con il motore: nessun cambiamento.
