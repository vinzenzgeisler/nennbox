import { Car, Ground, Plate, Sketch, VintageCar } from './Sketch.js';

const road = { strokeWidth: 8, stroke: 'var(--color-white)' };

export const Hillclimb = () => (
  <Sketch>
    <path
      className="sk sk-mint"
      d="M4 88 L34 48 L52 62 L86 14 L122 56 L140 44 L156 66 V88 Z"
    />
    <path
      className="sk sk-white"
      d="M77 28 L86 14 L95 28 L90 25 L86 30 L82 25 Z"
    />
    <path
      className="sk"
      style={{ ...road, strokeLinejoin: 'miter' }}
      d="M30 90 L108 80 L46 70 L106 60 L62 50 L96 41 L72 32 L86 22"
    />
    <path
      className="sk sk-thin sk-dash"
      d="M30 90 L108 80 L46 70 L106 60 L62 50 L96 41 L72 32 L86 22"
    />
    <path className="sk sk-accent" d="M86 14 V3 L99 8 L86 12" />
    <rect className="sk-accent-fill" x="24" y="88" width="10" height="6" />
    <Ground y={94} />
  </Sketch>
);

export const Rally = () => (
  <Sketch>
    <path className="sk sk-sage" d="M4 86 Q40 80 70 86 T152 80 V90 H4 Z" />
    <path className="sk sk-thin sk-dash" d="M14 62 H34 M8 70 H30 M18 76 H38" />
    <circle className="sk sk-white sk-dash" cx="30" cy="80" r="7" />
    <circle className="sk sk-white sk-dash" cx="40" cy="74" r="5" />
    <Car x={44} y={52} s={1.45} accent />
    <path className="sk" d="M48 62 V54 H38" />
    <circle className="sk sk-white" cx="98" cy="72" r="6" />
    <text className="sk-text" x="98" y="76" fontSize="9" textAnchor="middle">
      7
    </text>
    <rect className="sk sk-white" x="118" y="12" width="30" height="38" />
    <path className="sk sk-thin" d="M123 22 H143 M123 29 H143 M123 36 H136" />
    <path className="sk sk-accent" d="M126 44 H140 M136 41 L140 44 L136 47" />
  </Sketch>
);

const cones = [44, 72, 100, 128];
export const Slalom = () => (
  <Sketch>
    <path
      className="sk sk-accent sk-dash"
      d="M10 66 Q30 38 44 64 T72 64 T100 64 T128 64 T152 64"
    />
    {cones.map((x) => (
      <g key={x}>
        <path
          className="sk sk-orange"
          d={`M${x - 7} 86 L${x - 3} 62 H${x + 3} L${x + 7} 86 Z`}
        />
        <path
          className="sk sk-white"
          d={`M${x - 5} 76 H${x + 5} L${x + 4} 70 H${x - 4} Z`}
        />
      </g>
    ))}
    <Car x={6} y={64} s={0.5} />
    <Ground />
  </Sketch>
);

const ticks = Array.from({ length: 12 }, (_, i) => {
  const angle = (i * Math.PI) / 6;
  const inner = i % 3 === 0 ? 21 : 24;
  return [
    [48 + Math.sin(angle) * inner, 52 - Math.cos(angle) * inner],
    [48 + Math.sin(angle) * 27, 52 - Math.cos(angle) * 27],
  ] as const;
});
export const Regularity = () => (
  <Sketch>
    <rect className="sk sk-white" x="42" y="10" width="12" height="7" />
    <path className="sk" d="M48 17 V22 M72 24 L77 19" />
    <circle className="sk sk-white" cx="48" cy="52" r="32" />
    {ticks.map(([a, b]) => (
      <path
        key={`${a[0]}${a[1]}`}
        className="sk sk-thin"
        d={`M${a[0].toFixed(1)} ${a[1].toFixed(1)} L${b[0].toFixed(1)} ${b[1].toFixed(1)}`}
      />
    ))}
    <path className="sk sk-accent" d="M48 52 L62 38" />
    <circle className="sk-solid" cx="48" cy="52" r="3" />
    <VintageCar x={92} y={50} s={1} />
    <path className="sk sk-thin sk-dash" d="M92 84 H152" />
    <path className="sk" d="M148 80 L152 84 L148 88" />
  </Sketch>
);

export const Kart = () => (
  <Sketch>
    <path className="sk sk-mint" d="M30 70 H112 L122 62 H134 V76 H30 Z" />
    <circle className="sk sk-white" cx="46" cy="72" r="14" />
    <circle className="sk-solid" cx="46" cy="72" r="4" />
    <circle className="sk sk-white" cx="116" cy="76" r="10" />
    <circle className="sk-solid" cx="116" cy="76" r="3" />
    <path className="sk sk-mint" d="M50 46 L48 62 H70 L74 48 Z" />
    <circle className="sk sk-white" cx="58" cy="36" r="9" />
    <path className="sk sk-thin" d="M58 34 H67" />
    <path className="sk" d="M72 50 L90 54 M90 46 L96 58 M93 52 L100 66" />
    <circle className="sk sk-white" cx="124" cy="52" r="8" />
    <text className="sk-text" x="124" y="56" fontSize="10" textAnchor="middle">
      7
    </text>
    <Ground y={90} />
  </Sketch>
);

export const Circuit = () => {
  const d = 'M34 34 H92 L118 22 H136 V46 L120 58 V76 H48 L26 64 V40 Z';
  return (
    <Sketch>
      <path className="sk sk-sage" d={d} />
      <path className="sk" style={{ strokeWidth: 11 }} d={d} />
      <path
        className="sk"
        style={{ strokeWidth: 7, stroke: 'var(--color-white)' }}
        d={d}
      />
      <path className="sk sk-thin sk-dash" d={d} />
      {[0, 1, 2, 3].map((i) => (
        <rect
          key={i}
          className={i % 2 ? 'sk sk-white sk-thin' : 'sk-solid'}
          x="22"
          y={50 + i * 3.5}
          width="8"
          height="3.5"
        />
      ))}
      <rect className="sk-accent-fill" x="74" y="31" width="9" height="6" />
      <path className="sk sk-accent" d="M88 34 L92 34 M90 32 L93 34 L90 36" />
      <path className="sk sk-thin" d="M40 8 H72 M40 13 H72 M40 18 H72" />
    </Sketch>
  );
};

export const Other = () => (
  <Sketch>
    <path className="sk" d="M44 12 V90" />
    <path className="sk sk-mint" d="M44 14 H100 L88 28 L100 42 H44 Z" />
    <path className="sk sk-accent" d="M44 28 H88" />
    <rect
      className="sk sk-dash sk-thin"
      x="108"
      y="48"
      width="18"
      height="18"
    />
    <rect
      className="sk sk-dash sk-thin"
      x="130"
      y="48"
      width="18"
      height="18"
    />
    <rect
      className="sk sk-dash sk-thin"
      x="108"
      y="70"
      width="18"
      height="18"
    />
    <path className="sk sk-accent" d="M139 71 V85 M132 78 H146" />
    <Ground y={90} />
    <Plate x={52} y={56} w={36} h={26} text="?" size={20} />
  </Sketch>
);
