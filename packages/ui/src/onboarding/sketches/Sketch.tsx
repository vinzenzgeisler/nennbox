import type { ReactNode } from 'react';

/**
 * Frame for a line sketch in the NENNBOX style: 160 × 100 grid, 2 px square-capped
 * Green lines, flat Mint/Sage fills and a single Marshal accent. Decorative only.
 */
export function Sketch({ children }: { children: ReactNode }) {
  return (
    <svg
      className="nb-sketch"
      viewBox="0 0 160 100"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

type Place = { x: number; y: number; s?: number };
const at = ({ x, y, s = 1 }: Place) => `translate(${x} ${y}) scale(${s})`;
const wheel = (cx: number, cy: number, r: number) => (
  <>
    <circle className="sk sk-white" cx={cx} cy={cy} r={r} />
    <circle className="sk-solid" cx={cx} cy={cy} r={r / 4} />
  </>
);

/** Modern car in side view; 60 × 26 in its own units, ground at y = 25.5. */
export function Car(place: Place & { accent?: boolean }) {
  return (
    <g transform={at(place)}>
      <path
        className={`sk ${place.accent ? 'sk-orange' : 'sk-mint'}`}
        d="M2 20 V14 L14 11 L22 4 H42 L52 11 L58 13 V20 Z"
      />
      <path
        className="sk sk-white"
        d="M17 11 L24 5.5 H33 V11 Z M36 11 V5.5 H41 L48 11 Z"
      />
      {wheel(14, 20, 5.5)}
      {wheel(46, 20, 5.5)}
    </g>
  );
}

/** Pre-war tourer with sloped windscreen, fenders and running board; 60 × 29. */
export function VintageCar(place: Place) {
  return (
    <g transform={at(place)}>
      <path
        className="sk sk-mint"
        d="M3 20 V13 L9 11 H14 L16 5 H29 L33 11 H55 V20 Z"
      />
      <path className="sk sk-white" d="M18 10 L19.5 6.5 H28 L30.5 10 Z" />
      <path className="sk sk-thin" d="M36 14 H52 M36 17 H52" />
      <rect className="sk sk-white" x="55" y="7" width="3" height="13" />
      <circle className="sk sk-white" cx="58" cy="13" r="2" />
      <path className="sk" d="M5 21 A9 9 0 0 1 23 21 M36 21 A9 9 0 0 1 54 21" />
      <path className="sk sk-thin" d="M23 21 H36" />
      <circle className="sk sk-white" cx="14" cy="22" r="6" />
      <circle className="sk sk-white" cx="45" cy="22" r="6" />
      <path
        className="sk sk-thin"
        d="M14 16 V28 M8 22 H20 M45 16 V28 M39 22 H51"
      />
    </g>
  );
}

/** Motorcycle in side view; 56 × 28. */
export function Bike(place: Place) {
  return (
    <g transform={at(place)}>
      {wheel(10, 20, 8)}
      {wheel(46, 20, 8)}
      <path className="sk" d="M10 20 H26 L20 9 M46 20 L38 8 M36 6 H43" />
      <path className="sk sk-mint" d="M19 7 H34 L36 11 H21 Z" />
      <path className="sk" d="M8 9 H20" />
    </g>
  );
}

export const Ground = ({ y = 86 }: { y?: number }) => (
  <path className="sk sk-thin" d={`M8 ${y} H152`} />
);

/** Small start-number plate with a number. */
export function Plate({
  x,
  y,
  w,
  h,
  text,
  size,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  size: number;
}) {
  return (
    <g>
      <rect className="sk sk-white" x={x} y={y} width={w} height={h} />
      <text
        className="sk-text"
        x={x + w / 2}
        y={y + h / 2 + size * 0.36}
        fontSize={size}
        textAnchor="middle"
      >
        {text}
      </text>
    </g>
  );
}

/** Head and shoulders; `s` scales it around its anchor. */
export function Person({
  x,
  y,
  s = 1,
  dashed,
  fill = 'sk-mint',
}: Place & { dashed?: boolean; fill?: string }) {
  const dash = dashed ? ' sk-dash' : '';
  return (
    <g transform={at({ x, y, s })}>
      <circle className={`sk ${fill}${dash}`} cx="0" cy="-12" r="7" />
      <path
        className={`sk ${fill}${dash}`}
        d="M-11 14 V2 L-6 -3 H6 L11 2 V14 Z"
      />
    </g>
  );
}
