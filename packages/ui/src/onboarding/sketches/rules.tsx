import { Car, Person, Plate, Sketch } from './Sketch.js';

export const NumbersRequested = () => (
  <Sketch>
    <Person x={36} y={66} s={1.5} />
    <path className="sk sk-white" d="M68 12 H146 V60 H92 L80 72 L82 60 H68 Z" />
    <Plate x={86} y={22} w={44} h={28} text="42" size={24} />
    <path className="sk sk-accent" d="M138 26 V46" />
  </Sketch>
);

export const NumbersAssigned = () => (
  <Sketch>
    <rect className="sk sk-white" x="44" y="14" width="72" height="80" />
    <rect className="sk-solid" x="68" y="8" width="24" height="12" />
    {['07', '12', '23'].map((n, i) => (
      <g key={n}>
        <Plate x={52} y={28 + i * 21} w={26} h={16} text={n} size={11} />
        <path className="sk sk-thin" d={`M84 ${36 + i * 21} H106`} />
      </g>
    ))}
    <path className="sk sk-accent" d="M96 84 L102 90 L112 78" />
  </Sketch>
);

export const NumbersAutomatic = () => (
  <Sketch>
    {['101', '102', '103'].map((n, i) => (
      <g key={n}>
        <Plate x={14 + i * 50} y={38} w={34} h={22} text={n} size={13} />
        {i < 2 && (
          <path
            className="sk sk-accent"
            d={`M${52 + i * 50} 49 H${60 + i * 50} M${57 + i * 50} 45 L${61 + i * 50} 49 L${57 + i * 50} 53`}
          />
        )}
      </g>
    ))}
    <path className="sk sk-accent sk-dash" d="M31 30 Q80 6 129 30" />
    <text
      className="sk-text"
      x="80"
      y="20"
      fontSize="12"
      textAnchor="middle"
      style={{ fill: 'var(--color-marshal)' }}
    >
      +1
    </text>
    <path className="sk sk-thin" d="M14 74 H148" />
  </Sketch>
);

export const Waitlist = () => (
  <Sketch>
    <path className="sk sk-accent" d="M18 24 V84" />
    {[0, 1, 2].map((i) => (
      <Person key={i} x={42 + i * 24} y={58} s={0.95} />
    ))}
    {[3, 4].map((i) => (
      <Person key={i} x={42 + i * 24} y={58} s={0.95} dashed fill="sk-white" />
    ))}
    <path className="sk sk-thin" d="M32 84 H84" />
    <path className="sk sk-thin sk-dash" d="M92 84 H146" />
    <path
      className="sk sk-accent"
      d="M106 26 Q82 6 40 26 M46 21 L40 26 L47 30"
    />
  </Sketch>
);

export const CoDriver = () => (
  <Sketch>
    <Car x={32} y={32} s={1.6} />
    <circle className="sk sk-white" cx="73" cy="46" r="5.5" />
    <circle className="sk sk-white" cx="92" cy="46" r="5.5" />
    <rect className="sk sk-white" x="118" y="14" width="26" height="32" />
    <path className="sk sk-thin" d="M123 24 H139 M123 31 H139 M123 38 H132" />
    <path className="sk sk-thin sk-dash" d="M132 46 L100 52" />
  </Sketch>
);

export const DoubleStart = () => (
  <Sketch>
    <Person x={26} y={56} s={1.5} />
    <path className="sk sk-accent" d="M46 56 L62 30 M46 56 L62 78" />
    <Car x={70} y={14} s={0.8} />
    <Car x={70} y={56} s={0.8} accent />
    <Plate x={124} y={22} w={22} h={16} text="1" size={12} />
    <Plate x={124} y={64} w={22} h={16} text="2" size={12} />
  </Sketch>
);

export const Yes = () => (
  <Sketch>
    <rect className="sk sk-mint" x="54" y="20" width="52" height="52" />
    <path className="sk" style={{ strokeWidth: 5 }} d="M64 46 L76 58 L98 32" />
  </Sketch>
);

export const No = () => (
  <Sketch>
    <rect className="sk sk-white" x="54" y="20" width="52" height="52" />
    <path
      className="sk sk-accent"
      style={{ strokeWidth: 5 }}
      d="M66 32 L94 60 M94 32 L66 60"
    />
  </Sketch>
);

export const BrandLogo = () => (
  <Sketch>
    <rect
      className="sk sk-dash sk-white"
      x="36"
      y="12"
      width="88"
      height="76"
    />
    <path className="sk sk-mint" d="M44 76 L66 50 L82 66 L98 46 L116 76 Z" />
    <circle className="sk sk-white" cx="62" cy="32" r="6" />
    <path className="sk sk-accent" d="M80 28 V44 M74 34 L80 28 L86 34" />
  </Sketch>
);

export const StripeNow = () => (
  <Sketch>
    <circle className="sk sk-white" cx="80" cy="50" r="32" />
    <path className="sk sk-mint" d="M86 20 L62 54 H78 L74 80 L98 44 H82 Z" />
  </Sketch>
);

export const StripeLater = () => (
  <Sketch>
    <rect className="sk sk-white" x="34" y="18" width="92" height="68" />
    <path className="sk" d="M34 34 H126 M54 10 V24 M106 10 V24" />
    <circle className="sk sk-mint" cx="80" cy="60" r="16" />
    <path className="sk sk-accent" d="M80 50 V60 L88 64" />
  </Sketch>
);
