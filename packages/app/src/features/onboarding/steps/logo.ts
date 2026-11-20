/** Sample logos for the prototype and colour sampling for uploaded ones. */
export type SampleLogo = {
  id: string;
  name: string;
  colors: string[];
  url: string;
};

const svg = (body: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">${body}</svg>`,
  )}`;

export const sampleLogos: SampleLogo[] = [
  {
    id: 'blue-yellow',
    name: 'Blau und Gelb',
    colors: ['#1B4DB3', '#FFD400', '#FFFFFF'],
    url: svg(
      '<rect width="96" height="96" fill="#1B4DB3"/><circle cx="48" cy="48" r="26" fill="#FFD400"/><rect x="40" y="22" width="16" height="52" fill="#1B4DB3"/>',
    ),
  },
  {
    id: 'red-white',
    name: 'Rot und Schwarz',
    colors: ['#D62828', '#1A1A1A', '#FFFFFF'],
    url: svg(
      '<rect width="96" height="96" fill="#D62828"/><path d="M0 70 L96 30 V50 L0 90 Z" fill="#1A1A1A"/><circle cx="30" cy="30" r="12" fill="#FFFFFF"/>',
    ),
  },
  {
    id: 'green-orange',
    name: 'Grün und Orange',
    colors: ['#1F7A4D', '#F28C28', '#FFFFFF'],
    url: svg(
      '<rect width="96" height="96" fill="#1F7A4D"/><path d="M12 76 L48 16 L84 76 Z" fill="#F28C28"/><rect x="40" y="52" width="16" height="24" fill="#1F7A4D"/>',
    ),
  },
];

const hex = (value: number) => value.toString(16).padStart(2, '0');

/** Dominant colours of an image, most frequent first; empty where canvas is unavailable. */
export function sampleImageColors(
  image: HTMLImageElement,
  count = 4,
): string[] {
  try {
    const size = 48;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return [];
    context.drawImage(image, 0, 0, size, size);
    const { data } = context.getImageData(0, 0, size, size);
    const buckets = new Map<
      number,
      { n: number; r: number; g: number; b: number }
    >();
    for (let i = 0; i < data.length; i += 4) {
      if ((data[i + 3] ?? 0) < 200) continue;
      const r = data[i]!,
        g = data[i + 1]!,
        b = data[i + 2]!;
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
      bucket.n++;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      buckets.set(key, bucket);
    }
    return [...buckets.values()]
      .sort((a, b) => b.n - a.n)
      .slice(0, count)
      .map(
        ({ n, r, g, b }) =>
          `#${hex(Math.round(r / n))}${hex(Math.round(g / n))}${hex(Math.round(b / n))}`,
      );
  } catch {
    return [];
  }
}
