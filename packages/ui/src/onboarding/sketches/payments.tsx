import { Sketch } from './Sketch.js';

const Card = ({ x, y, s = 1 }: { x: number; y: number; s?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <rect className="sk sk-white" width="84" height="54" />
    <rect className="sk-solid" y="10" width="84" height="9" />
    <rect className="sk sk-mint" x="8" y="28" width="16" height="12" />
    <path className="sk sk-thin" d="M32 34 H76 M32 42 H58" />
  </g>
);

const Bank = ({ x, y, s = 1 }: { x: number; y: number; s?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <path className="sk sk-mint" d="M0 20 L30 0 L60 20 Z" />
    <path
      className="sk"
      d="M8 26 V56 M22 26 V56 M38 26 V56 M52 26 V56 M0 62 H60"
    />
  </g>
);

export const PayOnline = () => (
  <Sketch>
    <Card x={30} y={22} />
    <circle
      className="sk-solid"
      cx="118"
      cy="68"
      r="14"
      style={{ fill: 'var(--color-green)' }}
    />
    <path
      className="sk"
      style={{ stroke: 'var(--color-mint)' }}
      d="M111 68 L116 73 L125 62"
    />
  </Sketch>
);

export const PayTransfer = () => (
  <Sketch>
    <Bank x={22} y={20} />
    <path className="sk sk-accent sk-dash" d="M88 50 H116" />
    <path className="sk sk-accent" d="M111 45 L117 50 L111 55" />
    <rect className="sk sk-white" x="124" y="30" width="26" height="40" />
    <path className="sk sk-thin" d="M129 40 H145 M129 48 H145 M129 56 H138" />
    <text className="sk-text" x="100" y="42" fontSize="12" textAnchor="middle">
      €
    </text>
  </Sketch>
);

export const PayBoth = () => (
  <Sketch>
    <Card x={8} y={30} s={0.8} />
    <path className="sk sk-accent" d="M84 52 H96 M90 46 V58" />
    <Bank x={104} y={28} s={0.75} />
  </Sketch>
);
