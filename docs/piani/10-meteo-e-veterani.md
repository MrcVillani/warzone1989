# Piano 10 · Meteo e veterani

Richiesta del proprietario: tra i miglioramenti proposti ha scelto «Meteo e veterani», e ha chiesto che i veterani
migliorino e che, migliorando, abbiano un aspetto «sempre più coatto». Approvato.

## Meteo

Tre condizioni: **sereno** (com'è oggi), **pioggia**, **nebbia**. Valgono per tutti e due i lati.

| Condizione | Regole | Aspetto e suono |
|---|---|---|
| Pioggia | fuori strada i mezzi su ruote vanno al 80% e i semicingolati al 90% (fango); il lanciafiamme fa il 75% del danno; i relitti smettono prima di bruciare | gocce, terreno più scuro e lucido, pozzanghere, schizzi sull'acqua; rumore di pioggia e tuoni lontani |
| Nebbia | la vista di mezzi ed edifici scende al 70% (mai sotto 2,5 caselle); le gittate non cambiano, ma si spara solo a ciò che un proprio mezzo vede | banchi di nebbia che si muovono, colori smorzati; suoni ovattati |

- **Campagna**: «Il passo dei larici» con la nebbia, «La diga di Serra Alta» con la pioggia, «Contrattacco» con la
  pioggia che smette quando si passa al contrattacco (insieme al cambio della musica). Le altre restano serene; la 1
  resta di notte.
- **Schermaglia**: nuova riga «Meteo: Sereno / Pioggia / Nebbia / Variabile» nel menu, scelta ricordata. Con
  «Variabile» il tempo cambia ogni qualche minuto, con un avviso. Il valore di partenza è «Sereno»: chi non tocca
  niente gioca come oggi.
- **Latina**: con la pioggia, una battuta in più («Con la pioggia le buche diventano laghetti.»).
- **Prestazioni**: pioggia e nebbia rispettano i livelli di qualità e «riduci movimento»; in «minima» restano solo
  la tinta e le regole.

## Veterani

I mezzi che distruggono nemici salgono di grado. Vale per tutti e due i lati; torrette ed edifici non salgono.

| Grado | Distruzioni | Vantaggi |
|---|---|---|
| Recluta | 0 | nessuno |
| Esperto | 2 | +8% danno, +10% punti struttura |
| Veterano | 5 | +16% danno, +20% punti struttura |
| Asso | 10 | +25% danno, +30% punti struttura, si ripara piano da solo quando non combatte |

- Il grado si vede come gallone sopra il mezzo e nel pannello della selezione; alla promozione un piccolo lampo e,
  per gli assi del giocatore, un avviso.
- I genieri non salgono di grado. Il modulo riparazione conta le riparazioni come mezza distruzione ogni 150 punti
  riparati, così anche i mezzi di supporto fanno carriera.
- **Campagna**: alla vittoria, fino a tre mezzi sopravvissuti di grado Veterano o Asso seguono il giocatore nella
  missione dopo, in più rispetto ai mezzi di partenza, con il loro grado e la loro livrea.

### Livree sempre più coatte

Più il mezzo sale di grado, più è vistoso. Tutto disegnato da noi, senza marchi; la fascia del colore del lato resta
sempre leggibile. Vale anche per il nemico, con il suo stile (ferro, cromo e rosso).

| Grado | Livrea |
|---|---|
| Recluta | di serie, com'è oggi |
| Esperto | tacche delle vittorie sulla canna, striscia da corsa sul cofano, fari supplementari gialli |
| Veterano | fiamme dipinte sui fianchi, cromature lucide su cingoli e cerchi, coda di volpe sull'antenna che sventola, scarico più grosso |
| Asso | vernice metallizzata con bordi dorati, fiamme d'oro, alettone posteriore, doppio scarico cromato che sbuffa di più, luce al neon sotto la scocca (si vede bene di notte), scintillio ogni tanto |

- Gli assi del giocatore ricevono un **soprannome** a caso, di fantasia (per esempio «er Bufera», «la Pantera»,
  «er Tritacarri»), mostrato nel pannello e nell'avviso di promozione.
- Quando un asso viene distrutto, il relitto conserva alettone e cromature.
- In qualità «minima» restano il gallone e i bordi dorati; neon, scintillio e coda che sventola si spengono con
  «riduci movimento» dove sono movimento.

## Contratto tra motore e client

- `WEATHER` (tabella: nome, vista, velocità fuori strada per propulsione, danno del fuoco) e `S.weather`
  (`'clear' | 'rain' | 'fog'`), salvato; i salvataggi vecchi caricano `'clear'`.
- `MISSIONS[].weather`; in «Contrattacco» il cambio avviene con la fase 2.
- `newGame(diff, seed, { weather })` per la schermaglia: `'clear' | 'rain' | 'fog' | 'variable'`; `S.weatherMode`.
- Evento `weather` `{ from, to }` quando il tempo cambia.
- `RANKS` (tabella: nome, distruzioni, moltiplicatori) e, su ogni mezzo, `xp` e `rank` (0–3), salvati.
- Evento `rank` `{ id, owner, rank, x, y }` alla promozione. Il soprannome e la livrea sono solo del client.
- Campagna: `finishMission` ricorda i veterani (progetto e grado); `newGame(..., { veterans })` li mette in campo.

## Verifica

- Test del motore: effetti del meteo su velocità, vista e danno; gradi e vantaggi; salvataggi vecchi e nuovi;
  veterani tra una missione e l'altra.
- Bilanciamento: `tests/balance/campagna.mjs` sulle missioni con il meteo; le percentuali di vittoria non devono
  spostarsi di molto. IA contro IA in schermaglia con ogni meteo.
- Browser: nessun errore, meteo visibile su computer e telefono, galloni leggibili, fps a «auto» non peggiori di
  oggi con 200 mezzi sotto la pioggia.

## Sotto-compiti

| # | Agente | Compito |
|---|---|---|
| 1 | backend | meteo (tabella, regole, missioni, schermaglia, variabile, salvataggi), gradi e veterani, eventi |
| 2 | frontend | pioggia e nebbia (disegno e suono), riga «Meteo» nel menu, galloni, livree coatte per grado, soprannomi, pannello, avvisi, battuta di Latina; può partire in parallelo: il contratto è fissato qui sopra |
| 3 | tester | test del motore, bilanciamento, prove nel browser |

## Aggiunta: la «Macchina di Villo»

Richiesta del proprietario: nella campagna c'è sempre un mezzo speciale, la «Macchina di Villo», potentissimo, che
genera esplosioni con animazioni spettacolari; è una berlina grigia a tre volumi.

- **Aspetto**: berlina compatta grigio metallizzato a quattro porte, disegnata da noi vista dall'alto, senza stemmi né
  nomi di marca nel gioco (il nome nel gioco è solo «Macchina di Villo»). Sale di grado come gli altri mezzi e
  diventa sempre più coatta (alettone, neon, fiamme) restando grigia.
- **Dove**: in tutte le otto missioni della campagna, accanto al comando all'inizio. Non si produce e non c'è in
  schermaglia.
- **Forza**: mezzo su ruote veloce (prende il vantaggio delle strade), molto resistente. Cresce con la campagna
  (livello 1–8, uno per missione) così resta fortissima in ogni missione senza rendere inutile il resto dell'esercito:
  vale all'incirca cinque dei migliori mezzi disponibili in quella missione.
- **Arma**: «Bassi a palla», l'impianto stereo nel bagagliaio: una scarica che esplode sul bersaglio con danno ad
  area ampio. Ogni terzo colpo è un «colpo grosso» con area e danno maggiori.
- **Animazioni**: bagagliaio che si apre, onde sonore visibili verso il bersaglio; esplosione speciale a più anelli
  con colonna di fuoco, fulmini, detriti e scossa dello schermo; il «colpo grosso» con fungo più alto e lampo che
  illumina tutta la visuale. Sgommate sull'asfalto quando parte.
- **Se viene distrutta**: non si perde la missione. «La macchina di Villo è dal carrozziere» e torna accanto al
  comando dopo 60 secondi (se il comando esiste ancora), con il grado che aveva.

Contratto:

- `HERO` in `engine/data.js` (nome, statistiche per livello di missione, arma `HERO_W`, `respawn: 60`); il mezzo ha
  `hero: 'villo'` e propulsione su ruote.
- `S.hero` `{ id, down, backAt, rank, xp }`, salvato; evento `hero` `{ state: 'down' | 'back', x, y }` con toast.
- I colpi dell'eroe emettono `fx` con `hero: true` e `big: true` per il colpo grosso (oltre ai campi di sempre).
- L'IA in autoplay la usa come un mezzo normale d'attacco.
