# Piano 04 · Giocabilità su telefono

Richiesta del proprietario: migliorare la giocabilità da cellulare. Fastidi indicati: **selezionare i mezzi** e
**muovere e vedere la mappa**.

## Problemi di oggi

- Un dito sulla mappa fa due cose diverse secondo il pulsante «Mappa»: riquadro di selezione oppure scorrimento. Bisogna
  ricordarsi in che modalità si è, e si sbaglia spesso.
- I mezzi sono piccoli: un tocco un po' fuori non li prende e diventa un ordine di movimento.
- Prendere un gruppo o richiamarlo è scomodo: niente tasti Ctrl+1–9 sul telefono.
- Lo scorrimento si ferma di colpo, la mappa è grande e non si capisce dove succedono le cose fuori dallo schermo.

## Scelte

### Mappa
- **Un dito scorre sempre la mappa**, con inerzia (la mappa continua a scivolare e rallenta). Sparisce la modalità
  «Mappa».
- **Due dita**: zoom (come oggi), più fluido, con limiti un po' più ampi sul telefono.
- **Avvisi toccabili**: toccare «Contatto nemico nel settore D4» porta la visuale lì. Un pulsante **«Allarme»** sulla
  barra porta all'ultimo scontro e, toccato di nuovo, ai precedenti.
- **Frecce ai bordi dello schermo** che indicano dove i tuoi mezzi o edifici stanno combattendo fuori dalla visuale;
  toccare la freccia porta lì.
- **Minimappa**: tocco = visuale lì (come oggi); **tocco lungo con dei mezzi selezionati = li manda lì**.

### Selezione
- **Tocco su un tuo mezzo** = selezionalo. Il tocco «aggancia» il tuo mezzo più vicino entro un raggio ampio (circa
  32 px sullo schermo), così non si sbaglia.
- **Doppio tocco su un mezzo** = tutti i mezzi dello stesso tipo sullo schermo.
- **Tocco lungo (circa mezzo secondo) e poi trascinare** = riquadro di selezione, con una breve vibrazione all'inizio
  se il telefono la permette. Vicino ai bordi la mappa scorre da sola mentre si disegna il riquadro.
- **Squadre**: quattro pulsanti compatti «1–4» sulla barra. Tocco lungo = salva la selezione in quella squadra; tocco =
  selezionala; doppio tocco = selezionala e porta lì la visuale. Il numero di mezzi è scritto sul pulsante.
- Indicatore del numero di mezzi selezionati sulla barra; «Nessuno» e «Esercito» restano.
- Tocco sulla mappa con dei mezzi selezionati = ordine, come oggi; il segno dell'ordine è più grande su telefono.

### Note
- Il computer non cambia: mouse e tastiera funzionano come oggi.
- La vibrazione su Android richiede il permesso `VIBRATE` (concesso in automatico, senza richieste al giocatore); se non
  c'è, il gioco funziona lo stesso. Approvato dal proprietario.

## Sotto-compiti

| # | Agente | Compito |
|---|---|---|
| 1 | frontend | gesti (`client/input.js`), barra con squadre, Allarme e contatore, avvisi toccabili, frecce ai bordi, minimappa (`client/ui.js`, `client/render.js`, `client/style.css`) |
| 2 | frontend | `android/`: permesso `VIBRATE` (approvato) |
| 3 | tester | prove nel browser con tocchi veri (anche a due dita, tramite il protocollo di Chromium): scorrimento con inerzia, zoom, tocco con aggancio, doppio tocco, tocco lungo e riquadro, squadre, avvisi toccabili, frecce, minimappa; computer invariato |

Contratto con il motore: nessun cambiamento. Si parte dopo la colonna sonora (piano 03), che tocca gli stessi file.
