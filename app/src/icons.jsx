// One stroke icon set: 24px grid, 1.75 stroke, round joins. Directional icons carry `mirror`.
const P = {
  home: 'M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z',
  search: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM20 20l-4-4',
  inbox: 'M4 13l2.5-8h11L20 13v6H4zM4 13h4.5l1 2.5h5l1-2.5H20',
  clock: 'M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17zM12 7.5V12l3 2',
  user: 'M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM4.5 20.5c1.2-3.6 4.2-5.5 7.5-5.5s6.3 1.9 7.5 5.5',
  users: 'M9 5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM2.5 20c.9-3.2 3.4-5 6.5-5s5.6 1.8 6.5 5M16 5.2a3.4 3.4 0 0 1 0 6.6M18 15.3c1.8.6 3 2.2 3.5 4.7',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2.2 2.2 0 0 0 4 0',
  plus: 'M12 5v14M5 12h14',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  building: 'M4 21V7l8-4 8 4v14M9 21v-5h6v5M8.5 9.5h.01M12 9.5h.01M15.5 9.5h.01M8.5 13h.01M15.5 13h.01',
  shield: 'M12 3l7.5 3v5.5c0 4.5-3.2 8.2-7.5 9.5-4.3-1.3-7.5-5-7.5-9.5V6z',
  shieldCheck: 'M12 3l7.5 3v5.5c0 4.5-3.2 8.2-7.5 9.5-4.3-1.3-7.5-5-7.5-9.5V6zM8.5 12l2.5 2.5 4.5-5',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M6 6l12 12M18 6 6 18',
  back: 'M15 5l-7 7 7 7',
  chev: 'M9 5l7 7-7 7',
  pin: 'M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11zM12 7.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z',
  calendar: 'M4.5 6.5h15v13h-15zM4.5 10.5h15M8.5 4v4M15.5 4v4',
  hourglass: 'M7 3.5h10M7 20.5h10M8 3.5c0 5 8 5 8 8.5s-8 3.5-8 8.5M16 3.5c0 5-8 5-8 8.5s8 3.5 8 8.5',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z',
  access: 'M12 3.5a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6zM5 8.5l7 1.5 7-1.5M12 10v4.5l-3 6M12 14.5l3 6',
  info: 'M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17zM12 11v5.5M12 7.8h.01',
  alert: 'M12 4 21 19.5H3zM12 10v4.5M12 17.2h.01',
  download: 'M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14',
  printer: 'M7 9V4h10v5M7 17H4.5V9.5h15V17H17M7 14h10v6H7z',
  gear: 'M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM19.4 13.5l1.6 1.2-2 3.4-1.9-.7a7 7 0 0 1-1.7 1L15 20.5h-4l-.4-2.1a7 7 0 0 1-1.7-1l-1.9.7-2-3.4 1.6-1.2a7 7 0 0 1 0-3L5 9.3l2-3.4 1.9.7a7 7 0 0 1 1.7-1L11 3.5h4l.4 2.1a7 7 0 0 1 1.7 1l1.9-.7 2 3.4-1.6 1.2a7 7 0 0 1 0 3z',
  logout: 'M14.5 4.5H19v15h-4.5M10 8l-4 4 4 4M6 12h10',
  help: 'M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17zM9.6 9.5a2.5 2.5 0 0 1 4.9.6c0 1.7-2.5 2-2.5 3.6M12 16.8h.01',
  doc: 'M6 3.5h8l4 4v13H6zM14 3.5v4h4M9 12h6M9 15.5h6',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  leaf: 'M5 19C5 10 11 5 20 4.5 19.5 13.5 14 19 5 19zM5 19l7-7',
  broom: 'M14.5 3.5 10 12M6.5 12h7l2 8.5h-11zM8.5 16v4.5M11.5 16v4.5',
  book: 'M4.5 5.5c2.5-1 5-1 7.5 1 2.5-2 5-2 7.5-1v13c-2.5-1-5-1-7.5 1-2.5-2-5-2-7.5-1zM12 6.5v13',
  heart: 'M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z',
  paw: 'M7 10.5a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6zM17 10.5a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6zM10 7a1.8 1.8 0 1 1 0-3.6A1.8 1.8 0 0 1 10 7zM14 7a1.8 1.8 0 1 1 0-3.6A1.8 1.8 0 0 1 14 7zM12 11.5c2.5 0 5 3.5 5 5.5 0 1.6-1.4 2.5-3 2.2-1.3-.3-2.7-.3-4 0-1.6.3-3-.6-3-2.2 0-2 2.5-5.5 5-5.5z',
  star: 'M12 3.5l2.5 4.5 5 .8-3.6 3.6.8 5.1L12 15.2l-4.7 2.3.8-5.1L4.5 8.8l5-.8z',
  pencil: 'M14.5 5.5l4 4L8 20H4v-4zM12.5 7.5l4 4',
  ban: 'M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17zM6 6l12 12',
  history: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9M4.5 4.5V9H9M12 8v4.5l3 1.5',
  globe: 'M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17zM3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z',
  lock: 'M6 10.5h12v10H6zM8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5',
  filter: 'M4 5.5h16l-6 7v6l-4 2v-8z',
  chart: 'M4.5 20h15M7 16.5V11M12 16.5V6.5M17 16.5V13.5',
  arrow: 'M5 12h14M13.5 6.5 19 12l-5.5 5.5',
  offline: 'M3 9.5a14 14 0 0 1 4-2.6M21 9.5a14 14 0 0 0-8.5-4M6.3 13a9 9 0 0 1 3-1.9M17.7 13a9 9 0 0 0-4.4-2.2M9.6 16.4a4 4 0 0 1 4.8 0M12 19.6h.01M4 4l16 16',
};
const MIRRORED = new Set(['back', 'chev', 'logout', 'arrow']);

export function Icon({ name, size = 22, label, className = '' }) {
  const d = P[name];
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
      strokeLinecap="round" strokeLinejoin="round" className={`${MIRRORED.has(name) ? 'mirror ' : ''}${className}`}
      aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label} focusable="false"
    >
      <path d={d} />
    </svg>
  );
}

// The verification seal, in the logo's lime-to-green. Only used for independently verified hours.
export function Seal({ size = 56, label }) {
  return (
    <svg width={size} height={size} viewBox="-60 -60 120 120" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <rect x="-38" y="-38" width="76" height="76" rx="8" fill="#86D23F" />
      <rect x="-38" y="-38" width="76" height="76" rx="8" fill="#1FA453" transform="rotate(45)" opacity="0.92" />
      <circle r="22" fill="#0B4F63" />
      <path d="M-10 1l7 7 14-16" fill="none" stroke="#C9F29B" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const CATEGORY_ICON = { cleanup: 'broom', gardening: 'leaf', seniors: 'heart', reading: 'book', pets: 'paw', events: 'star', tutoring: 'doc', other: 'star' };

// Category colour: one hue per kind of activity, taken from the logo's range (plus sand), so a list can be scanned by type.
export const CATEGORY_HUE = { cleanup: '#0b7a7d', gardening: '#167a42', seniors: '#a4560a', reading: '#0b4f63', pets: '#7a5c22', events: '#4a7d14', tutoring: '#12627a', other: '#4e6a72' };

// Dubai-style skyline in the logo's own language (a tapered tower among low blocks, one palm at the edge).
// Decorative only; colours come from CSS variables so dark mode can retune it.
export function Skyline({ className = '' }) {
  const leaf = 'M0 0Q15 -16 38 -8Q17 -6 0 0Z';
  return (
    <svg className={`skyline ${className}`} viewBox="0 0 350 112" aria-hidden="true" focusable="false">
      <g className="sky-back">
        <rect x="84" y="76" width="20" height="36" />
        <polygon points="104,112 104,50 126,40 126,112" />
        <rect x="128" y="68" width="18" height="44" />
        <path d="M178 112V52h8v-8h8v8h8v60z" />
        <rect x="202" y="70" width="22" height="42" />
        <rect x="268" y="62" width="24" height="50" /><rect x="292" y="80" width="20" height="32" />
        <rect x="156.500" y="30" width="1.600" height="22" />
      </g>
      <g className="sky-mid">
        <rect x="150" y="82" width="22" height="30" /><rect x="170" y="94" width="14" height="18" />
        <path d="M236 112 L237.400 80 L239.200 80 L240.200 56 L241.600 56 L242.200 28 L242.900 0 L243.600 28 L244.200 56 L245.600 56 L246.600 80 L248.400 80 L249.800 112 Z" />
        <polygon points="252,112 252,84 270,76 270,112" />
      </g>
      <g className="sky-palm">
        <path d="M322 112 C321 98 319 88 315 76 L318 75 C323 87 326 98 327 112 Z" />
        <g transform="translate(316.500 76) scale(0.78)">
          {[-170, -135, -100, -62, -25, 12, 45].map((a) => <path key={a} d={leaf} transform={`rotate(${a})`} />)}
        </g>
      </g>
    </svg>
  );
}
