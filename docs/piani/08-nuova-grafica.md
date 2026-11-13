# Piano 08 · Nuova grafica «A+» e animazioni spettacolari

Richiesta del proprietario: grafica ancora migliore e «animazioni fighe», poi «implementa il tutto». Dalle anteprime
(due giri, prototipi in `scripts/anteprime-grafica/`, non nel repository) si adotta **A+ «Rilievo»** con la luce di
B solo dove serve. La pixel art (C+) resta un'alternativa non adottata.

## Cosa entra nel gioco

- **Terreno A+**: erba varia (ciuffi, fiori, chiazze secche), terra umida vicino all'acqua, massi con crepe e licheni,
  passaggi morbidi tra i tipi; città e strade di Latina nello stesso stile; strade con solchi.
- **Segni che restano**: crateri, bruciature, impronte dei cingoli (con un tetto e dissolvenza lenta).
- **Alberi** a chiome illuminate di lato con ombra, che ondeggiano al vento e si piegano all'onda d'urto.
- **Acqua** con increspature, riflesso del cielo e delle nuvole, rive con schiuma; cerchi e schizzi dove cade un colpo.
- **Atmosfera**: ombre delle nuvole, correzione colore, vignettatura leggera.
- **Mezzi**: portelli e cupola, cingoli a maglie con ruota motrice, scarico con sbuffi, filo di luce sugli spigoli,
  insegne e fascia della fazione, ombra di contatto, beccheggio; torretta che ruota verso il bersaglio.
- **Edifici**: tetti in lamiera e cemento, camino che fuma, luci di segnalazione.
- **Effetti**: esplosioni a fasi (lampo, palla di fuoco, onda d'urto e polvere, detriti, fungo, cratere), bossoli e
  scintille, torretta sbalzata e relitto in fiamme con fumo piegato dal vento, crollo degli edifici a fasi, scossa
  dello schermo sulle esplosioni grandi (spegnibile, rispetta «riduci movimento»).
- **Luce**: le esplosioni e gli incendi illuminano il terreno attorno (tela della luce a 1/4). **Notte** solo nelle
  missioni notturne (campo `night` della missione nel motore; la 1 «Testa di ponte»), con fari, finestre accese e
  contorno sottile del colore del lato sui mezzi in vista.
- **Correzione**: l'elenco «N selezionati» del pannello su computer non si sovrappone più alle schede.

## Prestazioni

- Terreno cotto a pezzi in un Web Worker (con ripiego sul filo principale), segni a metà risoluzione.
- Livelli di qualità **alta / media / bassa / minima**: la qualità adattiva («auto») scende fino a «minima», che costa
  quanto la grafica di oggi. Così nessun telefono va peggio di adesso; i telefoni capaci vedono di più.
- Obiettivo misurato: a «auto» con 200 mezzi, fps non peggiori di oggi su telefono simulato e computer.
- Da provare su un telefono vero (le misure in headless penalizzano le passate a tutto schermo).

## Sotto-compiti

| # | Agente | Compito |
|---|---|---|
| 1 | backend | campo `night` nelle missioni (la 1 di notte); nessun'altra modifica |
| 2 | frontend | grafica A+, animazioni, luce, notte, livelli di qualità e worker, correzione del pannello (`client/render.js`, `client/anim.js`, nuovi moduli, `client/quality.js`, `client/style.css`) |
| 3 | tester | nessun errore, qualità adattiva fino a «minima», fps a «auto» non peggiori di oggi, «riduci movimento» e scossa spenta, notte solo in missione 1, leggibilità (contorni), schermaglia su Latina, computer e telefono |
