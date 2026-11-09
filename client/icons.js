// Icone e sagome disegnate apposta per il gioco (SVG in linea, niente immagini esterne né emoji).
// Icone della barra: tratto chiaro sul colore del testo. Sagome degli edifici: vista dall'alto come sulla mappa,
// con i colori della Brigata Aurora.
import { PAL } from './state.js';

const svg = (vb, body, cls = 'ti') => `<svg class="${cls}" viewBox="${vb}" aria-hidden="true" focusable="false">${body}</svg>`;

// Icone delle schede (24×24, tratto 1,7).
export const TAB_ICONS = {
  // gru da cantiere: torre a traliccio, braccio, gancio con il carico
  build: svg('0 0 24 24', '<path d="M6 21V4M9 21V7M6 7h3M6 11h3M6 15h3M6 4 9 7M3 21h9M6 4h15M17 4v7"/><rect x="14.5" y="11" width="5" height="4" rx=".6"/><path d="M12 4 9 7"/>'),
  // capannone con il tetto a denti di sega e la ciminiera
  prod: svg('0 0 24 24', '<path d="M2.5 20.5V12l5 3v-3l5 3v-3l5 3v5.5Z"/><path d="M17.5 15V4.5h3v16"/><path d="M2 20.5h20M6 18h2M10.5 18h2"/>'),
  // antenna parabolica del laboratorio con le onde
  res: svg('0 0 24 24', '<path d="M5 13a7 7 0 0 0 9.9 0L5 3.1a7 7 0 0 0 0 9.9Z"/><path d="M9.9 8.1 13 5M10 17l-2 4h8l-2-4"/><path d="M16 3.5a4.5 4.5 0 0 1 4.5 4.5M16 .8a7.2 7.2 0 0 1 7.2 7.2" opacity=".7"/>'),
  // squadra da disegno e matita sopra la sagoma di un mezzo
  des: svg('0 0 24 24', '<path d="M3 21V5l16 16Z"/><path d="M7 17v-3.5l3.5 3.5Z"/><path d="m14 3 7 7-2 2-7-7Z" class="fill" opacity=".35"/><path d="m14 3 7 7-2 2-7-7Z"/>'),
  // tre linee del menu, con il segno della pausa a sinistra
  menu: svg('0 0 24 24', '<path d="M9 6h12M9 12h12M9 18h12"/><path d="M3.5 9.5v5M6 9.5v5"/>'),
};

// Icone piccole (16×16) del cassetto e della selezione.
export const ICON = {
  close: svg('0 0 16 16', '<path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/>', 'ic'),
  ok: svg('0 0 24 24', '<path d="M4.5 12.5 10 18 19.5 6.5"/>', 'ic'),
  no: svg('0 0 24 24', '<path d="M6 6l12 12M18 6 6 18"/>', 'ic'),
  grow: svg('0 0 16 16', '<path d="M2.5 6.5v-4h4M13.5 9.5v4h-4M2.5 2.5l4.5 4.5M13.5 13.5 9 9"/>', 'ic'),
  shrink: svg('0 0 16 16', '<path d="M6.5 2.5v4h-4M9.5 13.5v-4h4M6.5 6.5 2 2M9.5 9.5 14 14"/>', 'ic'),
  drag: svg('0 0 16 16', '<path d="M8 1.5v13M1.5 8h13M8 1.5 6 3.5M8 1.5l2 2M8 14.5l-2-2M8 14.5l2-2M1.5 8l2-2M1.5 8l2 2M14.5 8l-2-2M14.5 8l-2 2"/>', 'ic'),
};

/* ---------- sagome degli edifici ----------
   Ogni sagoma usa le stesse proporzioni della casella del gioco (32 unità per casella), con un piccolo margine. */
const C = PAL[0];
const PADC = '#5b584d', PADR = '#3e3c34';
const pad = (w, h) => `<rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="2" fill="${PADC}" stroke="${PADR}" stroke-width="1.5"/>`;
const STRUCT_ART = {
  hq: [96, 96, `${pad(96, 96)}<rect x="12" y="12" width="66" height="64" fill="${C.body}" stroke="${C.dark}" stroke-width="2"/>
    <path d="M28.5 12v64M45 12v64M61.5 12v64" stroke="${C.dark}" stroke-opacity=".45"/>
    <path d="M35 36l10 8 10-8M35 28l10 8 10-8" fill="none" stroke="${C.light}" stroke-width="3.5"/>
    <circle cx="83" cy="20" r="8" fill="#4f4d44"/><ellipse cx="83" cy="20" rx="3" ry="8" fill="#d8d3c1" transform="rotate(35 83 20)"/>
    <rect x="34" y="76" width="28" height="7" fill="#2a2925"/>`],
  pump: [32, 32, `<ellipse cx="16" cy="16" rx="15" ry="13" fill="#1a1712"/><rect x="5" y="5" width="22" height="22" rx="2.5" fill="#6e6a5b" stroke="#47443a"/>
    <circle cx="10.5" cy="21" r="4.5" fill="${C.body}" stroke="${C.dark}"/>
    <g transform="rotate(-37 17 14)"><rect x="6.5" y="12.4" width="20" height="3.2" fill="${C.light}"/><rect x="25" y="10.5" width="4" height="7" fill="${C.dark}"/><rect x="14.5" y="11.5" width="5" height="5" fill="#33322c"/></g>`],
  factory: [96, 64, `${pad(96, 64)}<rect x="6" y="6" width="84" height="44" fill="#7b776a"/>
    <path d="M10 12v32M14 12v32M18 12v32M22 12v32M26 12v32M30 12v32M34 12v32M38 12v32M42 12v32M46 12v32M50 12v32M54 12v32M58 12v32M62 12v32M66 12v32M70 12v32M74 12v32" stroke="#000" stroke-opacity=".2"/>
    <rect x="6" y="6" width="84" height="6" fill="${C.body}"/><rect x="32" y="49" width="32" height="10" fill="#2a2925"/>
    <path d="M32 47h4M40 47h4M48 47h4M56 47h4" stroke="${C.light}" stroke-width="2"/>
    <circle cx="80" cy="20" r="6.5" fill="#4a4840"/><circle cx="80" cy="20" r="3.5" fill="#191814"/>`],
  lab: [64, 64, `${pad(64, 64)}<rect x="7" y="7" width="50" height="50" fill="#86837a"/>
    <circle cx="32" cy="32" r="16" fill="none" stroke="${C.body}" stroke-width="3"/><circle cx="32" cy="32" r="15" fill="#aeb8b8"/>
    <circle cx="27" cy="27" r="7" fill="#eef1ee" opacity=".8"/><path d="M17 32h30" stroke="#3c4646" stroke-opacity=".5"/>
    <rect x="52" y="8" width="3" height="3" fill="#33322c"/>`],
  tower: [32, 32, `<circle cx="18" cy="19" r="14" fill="#000" opacity=".3"/>
    <circle cx="16" cy="16" r="11" fill="none" stroke="#9c9271" stroke-width="6" stroke-dasharray="5.2 1.7"/>
    <circle cx="16" cy="16" r="7" fill="#55524a"/><circle cx="16" cy="16" r="4.6" fill="${C.body}" stroke="${C.dark}"/>
    <rect x="17" y="14.6" width="13" height="2.8" fill="#2a2925"/>`],
  depot: [64, 64, `${pad(64, 64)}<rect x="9" y="9" width="46" height="46" fill="none" stroke="${C.light}" stroke-width="2" stroke-dasharray="5 4"/>
    <path d="M23 29.5h18v5H23zM29.5 23h5v18h-5z" fill="${C.body}"/>
    <circle cx="10" cy="10" r="4" fill="#33322c"/><rect x="10" y="8.5" width="20" height="3" fill="${C.light}" transform="rotate(35 10 10)"/>`],
  bunker: [64, 64, `<path d="M13 3h38l10 10v38L51 61H13L3 51V13Z" fill="#827f6c" stroke="#4b493e" stroke-width="1.2"/>
    <path d="M5 15h54M5 21h54M5 27h54M5 33h54M5 39h54M5 45h54M5 51h54" stroke="#28261e" stroke-opacity=".25"/>
    <path d="M18 11h28l7 7v28l-7 7H18l-7-7V18Z" fill="#99967f" stroke="${C.body}" stroke-width="1.8"/>
    <path d="M25 13.5h14v2.6H25zM25 47.9h14v2.6H25zM13.5 25h2.6v14h-2.6zM47.9 25h2.6v14h-2.6z" fill="#16150f"/>
    <circle cx="32" cy="32" r="10" fill="#5f5c50" stroke="#3f3d34"/><circle cx="32" cy="32" r="5.5" fill="${C.body}" stroke="${C.dark}"/>
    <rect x="34" y="30.3" width="25" height="3.4" fill="#2a2925"/>`],
};
// Sagoma dell'edificio, inquadrata nella sua casella: le proporzioni dicono l'ingombro.
export function structArt(type, cls = 'sart') {
  const a = STRUCT_ART[type]; if (!a) return '';
  return `<svg class="${cls}" viewBox="-2 -2 ${a[0] + 4} ${a[1] + 4}" aria-hidden="true" focusable="false">${a[2]}</svg>`;
}
// Il geniere visto dall'alto: autocarro con la gru di servizio (per la tessera del comando).
export const BUILDER_ART = `<svg class="vart" viewBox="0 0 60 38" aria-hidden="true" focusable="false">
  <rect x="11" y="10" width="38" height="20" rx="2" fill="#000" opacity=".3"/>
  <rect x="12" y="7" width="5" height="3" fill="#26271f"/><rect x="12" y="28" width="5" height="3" fill="#26271f"/>
  <rect x="38" y="7" width="5" height="3" fill="#26271f"/><rect x="38" y="28" width="5" height="3" fill="#26271f"/>
  <rect x="9" y="9" width="27" height="20" rx="2" fill="${C.body}" stroke="${C.dark}"/>
  <rect x="36" y="10" width="12" height="18" rx="2.5" fill="${C.light}" stroke="${C.dark}"/>
  <rect x="43" y="12" width="3" height="14" fill="#2a2925" opacity=".6"/>
  <circle cx="16" cy="19" r="3.4" fill="#33322c"/><rect x="16" y="17.6" width="18" height="2.8" fill="${C.light}" transform="rotate(-18 16 19)"/>
</svg>`;
