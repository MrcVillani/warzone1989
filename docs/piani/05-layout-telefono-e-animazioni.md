# Piano 05 · Nuovo layout per telefono e animazioni migliori

Richiesta del proprietario: l'interfaccia da telefono è ingiocabile (poco spazio per selezionare mezzi ed edifici,
creare le unità è difficile) e le animazioni vanno migliorate. Tra le proposte mostrate (A: dock in basso; B: barra
laterale con cassetto) il proprietario ha scelto **B**. Dalla proposta A si prendono il piazzamento degli edifici
con conferma e le tessere grandi con il disegno del mezzo.

## Layout B (telefono e schermi touch)

Vale per gli schermi touch in orizzontale e per gli schermi bassi (`pointer: coarse`, o altezza fino a 520 px). Su
telefono in verticale la barra diventa una fila di schede in basso e il cassetto sale dal basso. **Il computer non
cambia.**

- **Mappa a tutto schermo.** In alto a sinistra una striscia sottile con gasolio, pompe, mezzi e tempo; sotto,
  l'obiettivo della missione.
- **Barra laterale a destra** (circa 66 px), con icone grandi disegnate apposta (SVG originali, niente emoji):
  Costruisci, Produci, Ricerca, Progetta, Allarme, Menu. Toccare una scheda apre il suo cassetto; toccarla di nuovo
  lo chiude.
- **Cassetto** largo circa il 40% dello schermo, a tutta altezza, sopra la mappa, con un'animazione breve di entrata
  e uscita. Si chiude con ✕, con la scheda attiva o scorrendo verso destra. La mappa a sinistra resta giocabile anche
  con il cassetto aperto, così si può continuare a mettere mezzi in coda mentre si guarda il campo.
- **Costruisci**: tessere grandi (tre per riga) con la sagoma dell'edificio, nome, costo e ingombro. Senza un geniere
  selezionato il cassetto offre «Seleziona i genieri liberi». Toccare una tessera avvia il **piazzamento**: il cassetto
  si chiude, l'edificio compare al centro dello schermo, si trascina con un dito e si conferma con **✓** grande (o si
  annulla con **✕**). Il piazzamento sbagliato è segnalato in rosso con il motivo.
- **Produci**: in alto le fabbriche e il comando come schede («Fabbrica 1 · 2 in coda»); sotto, tessere grandi per
  ogni progetto con il **disegno del mezzo** (la stessa sagoma del gioco), costo, tempo e un numero con i mezzi già in
  coda. Tocco = aggiungi uno; tocco lungo = aggiungi cinque. In fondo la coda con l'avanzamento; tocco su un elemento
  della coda = toglilo con rimborso. Il gasolio disponibile è sempre visibile nel cassetto.
- **Ricerca**: livelli I–IV come sezioni apribili, tessere grandi con stato, costo e motivo del blocco.
- **Progetta**: telaio, propulsione e arma come tessere grandi con il disegno della parte, anteprima del mezzo,
  statistiche, «Salva il progetto».
- **Selezione**: un riquadro compatto in basso a sinistra («6 mezzi», salute media, ✕ Nessuno); toccarlo apre il
  dettaglio nel cassetto. Accanto, gli ordini rapidi (Attacca, Ferma, Esercito) e le squadre 1–4, con tutti i gesti
  del piano 04.
- **Minimappa** piccola in basso a destra, accanto alla barra; tocco = visuale lì, tocco lungo = ordine ai mezzi
  selezionati; un pulsante la ingrandisce.
- **Selezione degli edifici**: toccare una propria fabbrica apre direttamente Produci su quella fabbrica; toccare il
  laboratorio apre Ricerca.
- Bersagli tattili di almeno 48 px nella barra e 64 px nelle tessere.

## Animazioni

- **Mezzi**: accelerazione e frenata invece della velocità costante, sterzata morbida, leggero beccheggio sui terreni
  sterrati, polvere dietro i mezzi su terra e strade; cingoli che girano in proporzione alla velocità.
- **Sparo**: rinculo della canna, fumo dalla bocca, vampa più luminosa che illumina per un attimo il terreno attorno.
- **Esplosioni**: palla di fuoco animata più grande e a fasi (lampo, fiamma, fumo), detriti che rimbalzano, relitti
  che restano sul campo, bruciano e poi anneriscono.
- **Edifici**: cantiere con impalcature e gru che si muove; porta della fabbrica che si apre quando esce un mezzo;
  crollo a fasi con fiamme e polvere quando un edificio viene distrutto.
- **Interfaccia**: cassetti e schede che scorrono, risposta visiva al tocco sui pulsanti, evidenziazione dei mezzi
  selezionati.
- Tutto rispetta la qualità adattiva (`client/quality.js`) e «riduci movimento»; nessun costo visibile sulla
  fluidità con 200 mezzi.

## Sotto-compiti

| # | Agente | Compito | File |
|---|---|---|---|
| 1 | frontend | layout B, cassetti, piazzamento con conferma, tessere con disegni | `client/ui.js`, `client/screens.js`, `client/input.js`, `client/index.html`, `client/style.css`, nuovi moduli in `client/` |
| 2 | frontend | animazioni | `client/render.js` (ed eventuali nuovi moduli di disegno) |
| 3 | tester | prove del layout B con tocchi veri in orizzontale e verticale, piazzamento con conferma, produzione dal cassetto; prove delle animazioni (nessun errore, prestazioni, riduci movimento); computer invariato | `tests/` |

I sotto-compiti 1 e 2 vanno in parallelo su file diversi. Contratto con il motore: nessun cambiamento.
