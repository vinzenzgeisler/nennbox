import { Person, Sketch } from './Sketch.js';

export const AccountGoogle = () => (
  <Sketch>
    <rect className="sk sk-white" x="30" y="12" width="100" height="76" />
    <path className="sk sk-thin" d="M30 26 H130" />
    <circle className="sk sk-mint" cx="80" cy="48" r="11" />
    <path className="sk sk-mint" d="M58 80 V70 L66 60 H94 L102 70 V80 Z" />
    <circle
      className="sk-solid"
      cx="122"
      cy="22"
      r="13"
      style={{ fill: 'var(--color-green)' }}
    />
    <path
      className="sk"
      style={{ stroke: 'var(--color-mint)' }}
      d="M116 22 L120 26 L128 17"
    />
    <path className="sk sk-thin" d="M38 20 H52" />
  </Sketch>
);

export const AccountPasskey = () => (
  <Sketch>
    <rect className="sk sk-white" x="30" y="12" width="52" height="76" />
    <path
      className="sk"
      d="M42 42 A14 14 0 0 1 70 42 M47 50 A9 9 0 0 1 65 50 V58 M52 56 A4 4 0 0 1 60 56 V66 L58 74 M56 56 V70"
    />
    <path className="sk sk-accent" d="M40 30 A16 16 0 0 1 72 30" />
    <circle className="sk sk-mint" cx="108" cy="58" r="10" />
    <circle className="sk-solid" cx="108" cy="58" r="2.5" />
    <path className="sk" d="M118 58 H146 M138 58 V67 M146 58 V65" />
    <path className="sk sk-accent" d="M96 30 H108 M102 24 V36" />
  </Sketch>
);

export const AccountEmail = () => (
  <Sketch>
    {[0, 1, 2, 3, 4, 5].map((i) => (
      <g key={i}>
        <rect
          className="sk sk-mint"
          x={38 + i * 14}
          y="10"
          width="12"
          height="18"
        />
        <text
          className="sk-text"
          x={44 + i * 14}
          y="23"
          fontSize="11"
          textAnchor="middle"
        >
          {'482915'[i]}
        </text>
      </g>
    ))}
    <rect className="sk sk-white" x="34" y="44" width="92" height="46" />
    <path className="sk" d="M34 44 L80 74 L126 44" />
    <path className="sk sk-accent" d="M80 32 V40 M76 36 L80 40 L84 36" />
  </Sketch>
);

export const StartersLicensed = () => (
  <Sketch>
    <rect className="sk sk-white" x="24" y="18" width="112" height="64" />
    <rect className="sk sk-mint" x="32" y="28" width="30" height="34" />
    <circle className="sk sk-white" cx="47" cy="40" r="7" />
    <path className="sk sk-white" d="M38 62 V54 L43 49 H51 L56 54 V62" />
    <path className="sk sk-thin" d="M70 32 H126 M70 42 H116 M70 52 H122" />
    <circle className="sk sk-accent" cx="112" cy="68" r="9" />
    <path className="sk sk-accent" d="M107 68 L111 72 L118 64" />
    <path className="sk" d="M32 72 H60" />
  </Sketch>
);

export const StartersClub = () => (
  <Sketch>
    <path className="sk sk-thin" d="M20 14 Q80 34 140 14" />
    {[0, 1, 2, 3, 4, 5].map((i) => {
      const x = 32 + i * 19;
      const y = 17 + Math.sin(((x - 20) / 120) * Math.PI) * 11;
      return (
        <path
          key={i}
          className={`sk sk-thin ${i % 2 ? 'sk-orange' : 'sk-mint'}`}
          d={`M${x - 5} ${y} H${x + 5} L${x} ${y + 12} Z`}
        />
      );
    })}
    <Person x={46} y={64} s={1.1} />
    <Person x={80} y={60} s={1.35} fill="sk-white" />
    <Person x={114} y={64} s={1.1} />
    <path className="sk sk-accent" d="M80 70 V80 M74 75 H86" />
  </Sketch>
);

export const StartersGuests = () => (
  <Sketch>
    <path className="sk sk-white" d="M96 14 V88 H140 V14 Z" />
    <path className="sk sk-mint" d="M96 14 L122 22 V80 L96 88 Z" />
    <circle className="sk-solid" cx="116" cy="52" r="1.8" />
    <Person x={40} y={58} s={1.25} />
    <path className="sk sk-accent sk-dash" d="M58 58 H88" />
    <path className="sk sk-accent" d="M83 53 L89 58 L83 63" />
    <path className="sk sk-thin" d="M18 88 H150" />
  </Sketch>
);
